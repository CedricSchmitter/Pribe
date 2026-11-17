import { describe, expect, it } from 'vitest';
import type { Award, AwardKind, Person } from '@pribe/shared';
import type { RoundRecord, VoteRecord } from '../db';
import { buildFinale, computeBestPresentations, majorityOf } from './finale';

const persons: Person[] = ['a', 'b', 'c', 'd', 'e'].map((id) => ({ id, name: id.toUpperCase(), emoji: '🙂', color: '#123456', photoUrl: null }));

function round(id: number, owner: string | null, presenter = 'e'): RoundRecord {
  return {
    id,
    number: id,
    presenterId: presenter,
    submissionId: `s${id}`,
    drawnAt: 0,
    startedAt: 0,
    closedAt: 0,
    countdownEndsAt: 0,
    revealedAt: owner ? 1 : null,
    revealedOwnerId: owner,
  };
}

function vote(roundId: number, voterId: string, guessPersonId: string | null, stars: number | null = null): VoteRecord {
  return { roundId, voterId, guessPersonId, stars, updatedAt: 0 };
}

const award = (awards: Award[], kind: AwardKind) => awards.find((a) => a.kind === kind)!;

describe('majorityOf', () => {
  it('needs a unique top with at least two guesses', () => {
    expect(majorityOf([vote(1, 'a', 'b'), vote(1, 'c', 'b'), vote(1, 'd', 'a')])).toBe('b');
    expect(majorityOf([vote(1, 'a', 'b'), vote(1, 'c', 'b'), vote(1, 'd', 'a'), vote(1, 'e', 'a')])).toBeNull();
    expect(majorityOf([vote(1, 'a', 'b')])).toBeNull();
    expect(majorityOf([])).toBeNull();
  });
});

describe('buildFinale', () => {
  // Round 1: owner a. b, c guess a (right), d guesses b; a's dummy vote guesses c.
  // Round 2: owner b. a guesses b (right), c, d guess a (majority, wrong).
  // Round 3: owner c, unrevealed: ignored entirely.
  const rounds = [round(1, 'a'), round(2, 'b'), round(3, null)];
  const votes = [
    vote(1, 'b', 'a', 5),
    vote(1, 'c', 'a', 4),
    vote(1, 'd', 'b', 3),
    vote(1, 'a', 'c', 1),
    vote(2, 'a', 'b', 2),
    vote(2, 'c', 'a', 2),
    vote(2, 'd', 'a'),
    vote(2, 'b', 'b', 5),
    vote(3, 'd', 'c', 5),
  ];
  const f = buildFinale(persons, rounds, votes);

  it('leaderboard: 1 point per hit, dummy votes and unrevealed rounds do not count', () => {
    expect(f.leaderboard.map((e) => [e.personId, e.points, e.rank])).toEqual([
      ['a', 1, 1],
      ['b', 1, 1],
      ['c', 1, 1],
      ['d', 0, 4],
      ['e', 0, 4],
    ]);
  });

  it('hellseher: most hits, ties shared', () => {
    expect(award(f.awards, 'hellseher')).toEqual({ kind: 'hellseher', winners: ['a', 'b', 'c'], value: 1 });
  });

  it('pokerface: own presentation guessed right least often, only for shown presentations', () => {
    // a: 2 of 3 right, b: 1 of 3 right; c's round is not revealed, d and e have none.
    expect(award(f.awards, 'pokerface')).toEqual({ kind: 'pokerface', winners: ['b'], value: 1 });
  });

  it('blindgaenger: zero hits, but only for people who guessed', () => {
    expect(award(f.awards, 'blindgaenger')).toEqual({ kind: 'blindgaenger', winners: ['d'], value: 0 });
  });

  it('herdentier: most guesses with the majority', () => {
    // Round 1 majority a (b, c with it); round 2 majority a (c, d with it).
    expect(award(f.awards, 'herdentier')).toEqual({ kind: 'herdentier', winners: ['c'], value: 2 });
  });

  it('stats carry the numbers behind the awards', () => {
    const s = Object.fromEntries(f.stats!.map((x) => [x.personId, x]));
    expect(s.c).toEqual({ personId: 'c', guesses: 2, hits: 1, majorityRounds: 2, withMajority: 2, ownGuessers: null, ownGuessedRight: null, talkRatingCount: 0, avgTalkStars: null });
    expect(s.a).toMatchObject({ guesses: 1, hits: 1, ownGuessers: 3, ownGuessedRight: 2 });
    expect(s.e).toMatchObject({ guesses: 0, hits: 0 });
  });

  it('guess network: who guessed whom how often, without dummy votes', () => {
    expect(f.guessNetwork).toEqual([
      { fromId: 'c', toId: 'a', count: 2, correct: 1 },
      { fromId: 'a', toId: 'b', count: 1, correct: 1 },
      { fromId: 'b', toId: 'a', count: 1, correct: 1 },
      { fromId: 'd', toId: 'a', count: 1, correct: 0 },
      { fromId: 'd', toId: 'b', count: 1, correct: 0 },
    ]);
  });

  it('round summaries and best presentation ignore the owner’s stars', () => {
    expect(f.rounds.map((r) => [r.roundId, r.ownerId, r.avgStars, r.ratingCount, r.correctCount])).toEqual([
      [1, 'a', 4, 3, 2],
      [2, 'b', 2, 2, 1],
    ]);
    expect(f.bestPresentations).toEqual([{ roundId: 1, ownerId: 'a', presenterId: 'e', avgStars: 4, ratingCount: 3 }]);
  });
});

describe('edge cases', () => {
  it('no revealed rounds: empty awards, network and best presentation, everybody on rank 1', () => {
    const f = buildFinale(persons, [round(1, null)], [vote(1, 'a', 'b', 5)]);
    expect(f.awards.map((a) => [a.kind, a.winners])).toEqual([
      ['hellseher', []],
      ['pokerface', []],
      ['blindgaenger', []],
      ['herdentier', []],
      ['rampensau', []],
    ]);
    expect(f.guessNetwork).toEqual([]);
    expect(f.bestPresentations).toEqual([]);
    expect(f.leaderboard.every((e) => e.rank === 1 && e.points === 0)).toBe(true);
  });

  it('nobody with zero hits: no Blindgänger; nobody hit: no Hellseher', () => {
    const allRight = buildFinale(persons, [round(1, 'a')], [vote(1, 'b', 'a'), vote(1, 'c', 'a')]);
    expect(award(allRight.awards, 'blindgaenger').winners).toEqual([]);
    expect(award(allRight.awards, 'hellseher').winners).toEqual(['b', 'c']);
    const allWrong = buildFinale(persons, [round(1, 'a')], [vote(1, 'b', 'c'), vote(1, 'c', 'b')]);
    expect(award(allWrong.awards, 'hellseher').winners).toEqual([]);
    expect(award(allWrong.awards, 'blindgaenger').winners).toEqual(['b', 'c']);
  });

  it('no majority in any round: no Herdentier', () => {
    const f = buildFinale(persons, [round(1, 'a')], [vote(1, 'b', 'a'), vote(1, 'c', 'd'), vote(1, 'd', 'c')]);
    expect(award(f.awards, 'herdentier').winners).toEqual([]);
    expect(f.stats!.every((s) => s.majorityRounds === 0)).toBe(true);
  });

  it('votes without a guess (stars only) count for stars, not for guesses or Blindgänger', () => {
    const f = buildFinale(persons, [round(1, 'a')], [vote(1, 'b', null, 5), vote(1, 'c', 'a', 3)]);
    expect(award(f.awards, 'blindgaenger').winners).toEqual([]);
    expect(f.rounds[0]).toMatchObject({ avgStars: 4, ratingCount: 2, correctCount: 1 });
    expect(f.guessNetwork).toHaveLength(1);
  });

  it('pokerface: zero right guesses wins, ties shared; a presentation nobody guessed on is skipped', () => {
    const f = buildFinale(
      persons,
      [round(1, 'a'), round(2, 'b'), round(3, 'c')],
      [vote(1, 'd', 'b'), vote(2, 'd', 'c'), vote(3, 'd', 'c')],
    );
    // a and b: 0 of 1 right; c: 1 of 1 right.
    expect(award(f.awards, 'pokerface')).toEqual({ kind: 'pokerface', winners: ['a', 'b'], value: 0 });
    const g = buildFinale(persons, [round(1, 'a'), round(2, 'b')], [vote(2, 'd', 'b')]);
    expect(award(g.awards, 'pokerface').winners).toEqual(['b']);
  });

  it('votes from or for removed persons are ignored', () => {
    const f = buildFinale(persons, [round(1, 'a')], [vote(1, 'ghost', 'a'), vote(1, 'b', 'ghost'), vote(1, 'c', 'a')]);
    expect(f.guessNetwork).toEqual([{ fromId: 'c', toId: 'a', count: 1, correct: 1 }]);
  });
});

describe('computeBestPresentations', () => {
  const summary = (roundId: number, avgStars: number | null, ratingCount: number) => ({
    roundId,
    number: roundId,
    presenterId: 'e',
    ownerId: 'a',
    avgStars,
    ratingCount,
    correctCount: 0,
  });

  it('a tie on the average goes to more ratings', () => {
    expect(computeBestPresentations([summary(1, 4.5, 2), summary(2, 4.5, 4), summary(3, 3, 9)]).map((b) => b.roundId)).toEqual([2]);
  });

  it('a full tie is shared; unrated rounds never win', () => {
    expect(computeBestPresentations([summary(1, 13 / 3, 3), summary(2, 13 / 3, 3), summary(3, null, 0)]).map((b) => b.roundId)).toEqual([
      1, 2,
    ]);
    expect(computeBestPresentations([summary(1, null, 0)])).toEqual([]);
  });
});

describe('Rampensau (R84)', () => {
  const talk = (roundId: number, voterId: string, talkStars: number): VoteRecord => ({
    roundId,
    voterId,
    guessPersonId: null,
    stars: null,
    talkStars,
    updatedAt: 0,
  });

  it('highest talk average wins; the presenter’s own stars never count, the owner’s do', () => {
    const f = buildFinale(
      persons,
      [round(1, 'a', 'b'), round(2, 'b', 'c')],
      // b: a (owner) 5 + c 4 = 4.5; b's own 1 is ignored. c: 4 + 4 = 4.
      [talk(1, 'a', 5), talk(1, 'c', 4), talk(1, 'b', 1), talk(2, 'a', 4), talk(2, 'd', 4)],
    );
    expect(award(f.awards, 'rampensau')).toEqual({ kind: 'rampensau', winners: ['b'], value: 4.5 });
    expect(f.stats!.find((s) => s.personId === 'b')).toMatchObject({ talkRatingCount: 2, avgTalkStars: 4.5 });
    expect(f.rounds[0]).toMatchObject({ avgTalkStars: 4.5, talkRatingCount: 2 });
  });

  it('pools all talks of one presenter and ignores unrevealed rounds', () => {
    const f = buildFinale(
      persons,
      [round(1, 'a', 'b'), round(2, 'c', 'b'), round(3, 'd', 'c'), round(4, null, 'e')],
      // b: 5, 3, 3 = 11/3; c: 4; e: unrevealed 5 does not count.
      [talk(1, 'a', 5), talk(2, 'a', 3), talk(2, 'd', 3), talk(3, 'a', 4), talk(4, 'a', 5)],
    );
    expect(award(f.awards, 'rampensau').winners).toEqual(['c']);
  });

  it('a tie on the average goes to more ratings, a full tie is shared', () => {
    const more = buildFinale(
      persons,
      [round(1, 'a', 'b'), round(2, 'b', 'c')],
      // b: 5 + 4 (2 ratings); c: 5 + 5 + 4 + 4 (4 ratings), both 4.5.
      [talk(1, 'a', 5), talk(1, 'c', 4), talk(2, 'a', 5), talk(2, 'b', 5), talk(2, 'd', 4), talk(2, 'e', 4)],
    );
    expect(award(more.awards, 'rampensau').winners).toEqual(['c']);

    const shared = buildFinale(
      persons,
      [round(1, 'a', 'b'), round(2, 'b', 'c')],
      [talk(1, 'a', 4), talk(1, 'c', 5), talk(2, 'a', 5), talk(2, 'd', 4)],
    );
    expect(award(shared.awards, 'rampensau')).toEqual({ kind: 'rampensau', winners: ['b', 'c'], value: 4.5 });
  });

  it('nobody qualifies without talk ratings', () => {
    const f = buildFinale(persons, [round(1, 'a', 'b')], [vote(1, 'c', 'a', 5)]);
    expect(award(f.awards, 'rampensau')).toEqual({ kind: 'rampensau', winners: [], value: 0 });
  });
});
