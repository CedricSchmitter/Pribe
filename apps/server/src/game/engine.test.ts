import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Person } from '@pribe/shared';
import { createRepositories, openDatabase, type Db } from '../db';
import { isOwner, ownerHash } from '../security/hmac';
import { GameEngine } from './engine';
import { computeLeaderboard } from './scoring';

const SECRET = 'engine-test-secret-0123';

interface World {
  db: Db;
  repos: ReturnType<typeof createRepositories>;
  engine: GameEngine;
  p: Record<'anna' | 'ben' | 'cleo' | 'dan', Person>;
  /** submission id → owner name; only the test knows this. */
  owners: Map<string, string>;
}

function makeEngine(db: Db) {
  return new GameEngine({ db, repos: createRepositories(db), isOwner: (id, hash) => isOwner(id, hash, SECRET), rng: () => 0 });
}

function setup(dbFile = ':memory:'): World {
  const db = openDatabase(dbFile);
  const repos = createRepositories(db);
  const mk = (name: string) => repos.persons.create({ name, emoji: '🙂', color: '#123456' });
  const p = { anna: mk('Anna'), ben: mk('Ben'), cleo: mk('Cleo'), dan: mk('Dan') };
  const owners = new Map<string, string>();
  for (const name of ['anna', 'ben', 'cleo'] as const) {
    const { submission } = repos.submissions.replaceForOwner({
      ownerHash: ownerHash(p[name].id, SECRET),
      kind: 'html',
      status: 'ready',
      filePath: `${name}.html`,
    });
    owners.set(submission.id, name);
  }
  return { db, repos, engine: makeEngine(db), p, owners };
}

/** Plays up to the countdown with Dan presenting; returns the owner of the drawn submission. */
function playToCountdown(w: World): Person {
  expect(w.engine.start()).toEqual({ ok: true, data: undefined });
  expect(w.engine.draw(w.p.dan.id).ok).toBe(true);
  expect(w.engine.startRound().ok).toBe(true);
  const round = w.engine.currentRound()!;
  return w.p[w.owners.get(round.submissionId) as keyof World['p']];
}

let w: World;
beforeEach(() => {
  vi.useFakeTimers({ now: 1_000_000 });
  w = setup();
});
afterEach(() => {
  w.engine.dispose();
  vi.useRealTimers();
});

describe('state machine', () => {
  it('walks lobby → choosePresenter → drawing → presenting → countdown → reveal → choosePresenter → finale', () => {
    expect(w.engine.phase()).toBe('lobby');
    expect(w.engine.draw(w.p.dan.id)).toEqual({ ok: false, error: 'WRONG_PHASE' });
    playToCountdown(w);
    expect(w.engine.phase()).toBe('presenting');
    expect(w.engine.closeRound().ok).toBe(true);
    expect(w.engine.phase()).toBe('countdown');
    expect(w.engine.finale()).toBeNull();
    vi.advanceTimersByTime(20_000);
    expect(w.engine.phase()).toBe('reveal');
    expect(w.engine.next().ok).toBe(true);
    expect(w.engine.phase()).toBe('choosePresenter');
    expect(w.engine.startFinale().ok).toBe(true);
    expect(w.engine.hostSnapshot([]).finale?.leaderboard).toHaveLength(4);
  });

  it('removes the drawn presentation from the pool for good', () => {
    w.engine.start();
    expect(w.engine.hostSnapshot([]).poolSize).toBe(3);
    w.engine.draw(w.p.dan.id);
    expect(w.engine.hostSnapshot([]).poolSize).toBe(2);
  });

  it('reports ONLY_OWN_LEFT through the engine (HMAC comparison)', () => {
    w.engine.start();
    // Drain everything except Anna's submission.
    for (const [id, owner] of w.owners) if (owner !== 'anna') w.repos.rounds.create({ presenterId: w.p.dan.id, submissionId: id });
    expect(w.engine.draw(w.p.anna.id)).toEqual({ ok: false, error: 'ONLY_OWN_LEFT' });
    expect(w.engine.draw(w.p.ben.id).ok).toBe(true);
  });

  it('wheel reservation is honoured by the following draw', () => {
    w.engine.start();
    const spun = w.engine.spin();
    if (!spun.ok) throw new Error(spun.error);
    expect(spun.data.candidateIds.sort()).toEqual(Object.values(w.p).map((x) => x.id).sort());
    const reserved = w.repos.game.get<{ wheel: { submissionId: string } }>().state.wheel.submissionId;
    expect(w.engine.draw(spun.data.presenterId).ok).toBe(true);
    expect(w.engine.currentRound()!.submissionId).toBe(reserved);
  });
});

describe('voting and scoring', () => {
  it('accepts changes until the countdown ends, then closes', () => {
    playToCountdown(w);
    const roundId = w.engine.currentRound()!.id;
    expect(w.engine.castVote(w.p.ben.id, { roundId, guessPersonId: w.p.anna.id })).toMatchObject({ ok: true });
    expect(w.engine.castVote(w.p.ben.id, { roundId, stars: 4 })).toEqual({
      ok: true,
      data: { roundId, guessPersonId: w.p.anna.id, stars: 4 },
    });
    w.engine.closeRound();
    vi.advanceTimersByTime(19_999);
    expect(w.engine.castVote(w.p.ben.id, { roundId, guessPersonId: w.p.cleo.id }).ok).toBe(true);
    expect(w.engine.castVote(w.p.ben.id, { roundId, guessPersonId: w.p.anna.id }, Date.now() + 1)).toEqual({
      ok: false,
      error: 'VOTING_CLOSED',
    });
    vi.advanceTimersByTime(1);
    expect(w.engine.castVote(w.p.ben.id, { roundId, stars: 1 })).toEqual({ ok: false, error: 'VOTING_CLOSED' });
    expect(w.engine.castVote(null, { roundId, stars: 1 })).toEqual({ ok: false, error: 'NOT_IDENTIFIED' });
  });

  it('dummy vote: the owner sees exactly the same and does not count (R52, D07, D16)', () => {
    const owner = playToCountdown(w);
    const other = Object.values(w.p).find((x) => x.id !== owner.id && x.id !== w.p.dan.id)!;
    const roundId = w.engine.currentRound()!.id;

    const ownerAck = w.engine.castVote(owner.id, { roundId, guessPersonId: owner.id, stars: 5 });
    const otherAck = w.engine.castVote(other.id, { roundId, guessPersonId: owner.id, stars: 5 });
    expect(ownerAck).toEqual({ ok: true, data: { roundId, guessPersonId: owner.id, stars: 5 } });
    expect(otherAck).toEqual({ ok: true, data: { roundId, guessPersonId: owner.id, stars: 5 } });

    const strip = (s: ReturnType<GameEngine['voteSnapshot']>) => ({ ...s, me: null });
    expect(strip(w.engine.voteSnapshot(owner.id))).toEqual(strip(w.engine.voteSnapshot(other.id)));
    expect(JSON.stringify(w.engine.hostSnapshot([]))).not.toContain(ownerHash(owner.id, SECRET));
    expect(w.engine.currentRound()!.revealedOwnerId).toBeNull();

    w.engine.castVote(w.p.dan.id, { roundId, guessPersonId: other.id, stars: 2 });
    w.engine.closeRound();
    vi.advanceTimersByTime(20_000);

    const reveal = w.engine.hostSnapshot([]).reveal!;
    expect(reveal.ownerId).toBe(owner.id);
    expect(reveal.correctVoterIds).toEqual([other.id]);
    expect(reveal.tally).toEqual(
      expect.arrayContaining([
        { personId: owner.id, count: 1 },
        { personId: other.id, count: 1 },
      ]),
    );
    expect(reveal.tally).toHaveLength(2);
    expect(reveal.avgStars).toBe(3.5);
    expect(reveal.ratingCount).toBe(2);
    expect(w.engine.currentRound()!.revealedOwnerId).toBe(owner.id);

    expect(w.engine.voteSnapshot(owner.id).myOutcome).toBe('owner');
    expect(w.engine.voteSnapshot(other.id).myOutcome).toBe('correct');
    expect(w.engine.voteSnapshot(w.p.dan.id).myOutcome).toBe('wrong');
    const fourth = Object.values(w.p).find((x) => ![owner.id, other.id, w.p.dan.id].includes(x.id))!;
    expect(w.engine.voteSnapshot(fourth.id).myOutcome).toBe('noGuess');

    w.engine.startFinale();
    const board = w.engine.hostSnapshot([]).finale!.leaderboard;
    expect(board[0]).toEqual({ personId: other.id, points: 1, rank: 1 });
    expect(board.slice(1).map((e) => [e.points, e.rank])).toEqual([
      [0, 2],
      [0, 2],
      [0, 2],
    ]);
  });

  it('leaderboard: 1 point per correct guess, ties share a rank', () => {
    const persons = Object.values(w.p);
    const [a, b, c, d] = persons.map((x) => x.id) as [string, string, string, string];
    const rounds = [
      { id: 1, revealedAt: 1, revealedOwnerId: a },
      { id: 2, revealedAt: 1, revealedOwnerId: b },
      { id: 3, revealedAt: null, revealedOwnerId: null },
    ].map((r) => ({ ...r, number: r.id, presenterId: d, submissionId: `s${r.id}`, drawnAt: 0, startedAt: 0, closedAt: 0, countdownEndsAt: 0 }));
    const vote = (roundId: number, voterId: string, guess: string) => ({ roundId, voterId, guessPersonId: guess, stars: null, updatedAt: 0 });
    const board = computeLeaderboard(persons, rounds, [
      vote(1, b, a),
      vote(1, c, a),
      vote(1, a, a), // owner's dummy vote
      vote(2, c, b),
      vote(2, d, b),
      vote(3, d, c), // unrevealed round
    ]);
    const pts = Object.fromEntries(board.map((e) => [e.personId, [e.points, e.rank]]));
    expect(pts).toEqual({ [c]: [2, 1], [b]: [1, 2], [d]: [1, 2], [a]: [0, 4] });
  });
});

describe('persistence', () => {
  it('a restart in the middle of the countdown resumes it and loses nothing (R4)', () => {
    const file = path.join(mkdtempSync(path.join(tmpdir(), 'pribe-game-')), 'game.sqlite');
    w.engine.dispose();
    w.db.close();
    w = setup(file);
    const owner = playToCountdown(w);
    const roundId = w.engine.currentRound()!.id;
    w.engine.castVote(w.p.dan.id, { roundId, guessPersonId: owner.id, stars: 4 });
    w.engine.closeRound();
    vi.advanceTimersByTime(5_000);

    // Crash: the in-memory timer is gone.
    w.engine.dispose();
    w.db.close();

    const db = openDatabase(file);
    const engine = makeEngine(db);
    expect(engine.phase()).toBe('countdown');
    expect(engine.voteSnapshot(w.p.dan.id).myVote).toEqual({ roundId, guessPersonId: owner.id, stars: 4 });
    engine.resume();
    vi.advanceTimersByTime(14_999);
    expect(engine.phase()).toBe('countdown');
    vi.advanceTimersByTime(1);
    expect(engine.phase()).toBe('reveal');
    expect(engine.hostSnapshot([]).reveal?.correctVoterIds).toEqual([w.p.dan.id]);
    engine.dispose();
    db.close();
  });

  it('a countdown that ran out while the server was down reveals right after the restart', () => {
    const file = path.join(mkdtempSync(path.join(tmpdir(), 'pribe-game-')), 'game.sqlite');
    w.engine.dispose();
    w.db.close();
    w = setup(file);
    playToCountdown(w);
    w.engine.closeRound();
    w.engine.dispose();
    w.db.close();
    vi.setSystemTime(Date.now() + 60_000);

    const db = openDatabase(file);
    const engine = makeEngine(db);
    engine.resume();
    vi.advanceTimersByTime(0);
    expect(engine.phase()).toBe('reveal');
    engine.dispose();
    db.close();
  });
});
