import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '@pribe/shared';
import { createRepositories, openDatabase, type Db, type Repositories } from '.';
import { MIGRATIONS } from './migrations';
import { migrate } from './database';

let db: Db;
let repos: Repositories;

beforeEach(() => {
  db = openDatabase(':memory:');
  repos = createRepositories(db);
});

const person = (name: string) => repos.persons.create({ name, emoji: '🦊', color: '#ff3366' });

describe('migrations', () => {
  it('sets user_version and is idempotent', () => {
    migrate(db);
    expect((db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version).toBe(
      MIGRATIONS.length,
    );
  });

  it('has no column for an original file name', () => {
    const cols = (db.prepare('PRAGMA table_info(submissions)').all() as { name: string }[]).map((c) => c.name);
    expect(cols).toContain('owner_hash');
    expect(cols.some((c) => /name/i.test(c))).toBe(false);
  });
});

describe('persons', () => {
  it('creates, lists, updates and removes', () => {
    const b = person('Bea');
    const a = person('anna');
    expect(repos.persons.list().map((p) => p.name)).toEqual(['anna', 'Bea']);
    expect(repos.persons.update(a.id, { name: 'Anna', emoji: '🐼', color: '#00ff00' })).toEqual({
      id: a.id,
      name: 'Anna',
      emoji: '🐼',
      color: '#00ff00',
      photoUrl: null,
    });
    expect(repos.persons.get(a.id)?.emoji).toBe('🐼');
    expect(repos.persons.remove(b.id)).toBe(true);
    expect(repos.persons.get(b.id)).toBeNull();
    expect(repos.persons.update('missing', { name: 'x', emoji: 'x', color: '#000000' })).toBeNull();
  });

  it('rejects duplicate names', () => {
    person('Anna');
    expect(() => person('Anna')).toThrow();
  });
});

describe('submissions', () => {
  it('replaces the previous submission of the same owner', () => {
    const first = repos.submissions.replaceForOwner({ ownerHash: 'h1', kind: 'html', status: 'ready', filePath: 'a.html' });
    expect(first.replaced).toBeNull();
    const second = repos.submissions.replaceForOwner({ ownerHash: 'h1', kind: 'pptx', status: 'converting', filePath: 'b.pptx' });
    expect(second.replaced?.id).toBe(first.submission.id);
    expect(second.submission.id).not.toBe(first.submission.id);
    expect(repos.submissions.list()).toHaveLength(1);
    expect(repos.submissions.findByOwnerHash('h1')?.kind).toBe('pptx');
  });

  it('updates status and counts', () => {
    const { submission } = repos.submissions.replaceForOwner({ ownerHash: 'h1', kind: 'pptx', status: 'converting', filePath: 'x.pptx' });
    repos.submissions.replaceForOwner({ ownerHash: 'h2', kind: 'html', status: 'ready', filePath: 'y.html' });
    const updated = repos.submissions.updateStatus(submission.id, { status: 'failed', error: 'Timeout' });
    expect(updated).toMatchObject({ status: 'failed', error: 'Timeout', filePath: 'x.pptx' });
    expect(repos.submissions.countByStatus()).toEqual({ converting: 0, ready: 1, failed: 1 });
    expect(repos.submissions.updateStatus('missing', { status: 'ready' })).toBeNull();
  });

  it('pool contains only ready, not yet drawn submissions', () => {
    const p = person('Anna');
    const a = repos.submissions.replaceForOwner({ ownerHash: 'h1', kind: 'html', status: 'ready', filePath: 'a' }).submission;
    const b = repos.submissions.replaceForOwner({ ownerHash: 'h2', kind: 'html', status: 'ready', filePath: 'b' }).submission;
    repos.submissions.replaceForOwner({ ownerHash: 'h3', kind: 'pptx', status: 'converting', filePath: 'c' });
    expect(repos.submissions.listPool().map((s) => s.id).sort()).toEqual([a.id, b.id].sort());
    repos.rounds.create({ presenterId: p.id, submissionId: a.id });
    expect(repos.submissions.listPool().map((s) => s.id)).toEqual([b.id]);
  });

  it('keeps the one guest presentation (R90) out of list, counts and pool, but resumable', () => {
    const own = repos.submissions.replaceForOwner({ ownerHash: 'h1', kind: 'html', status: 'ready', filePath: 'a' }).submission;
    const first = repos.submissions.replaceGuest({ kind: 'html', status: 'ready', filePath: 'g' });
    expect(first.replaced).toBeNull();
    const second = repos.submissions.replaceGuest({ kind: 'pptx', status: 'converting', filePath: 'g.pptx' });
    expect(second.replaced?.id).toBe(first.submission.id);
    expect(repos.submissions.getGuest()?.id).toBe(second.submission.id);
    expect(repos.submissions.list().map((s) => s.id)).toEqual([own.id]);
    expect(repos.submissions.countByStatus()).toEqual({ converting: 0, ready: 1, failed: 0 });
    expect(repos.submissions.listConverting().map((s) => s.id)).toEqual([second.submission.id]);
    repos.submissions.updateStatus(second.submission.id, { status: 'ready' });
    expect(repos.submissions.listPool().map((s) => s.id)).toEqual([own.id]);
    expect(repos.submissions.findByOwnerHash('h1')?.id).toBe(own.id);
  });
});

describe('guest', () => {
  it('stores settings, falls back when the picked person is deleted and resets', () => {
    expect(repos.guest.get()).toEqual({ enabled: false, personId: null, name: '', emoji: '🎁', color: '#ff3366', photoFile: null });
    const anna = person('Anna');
    repos.guest.update({ enabled: true, personId: anna.id, name: 'Gast' });
    repos.guest.setPhotoFile('x.png');
    repos.persons.remove(anna.id);
    expect(repos.guest.get()).toMatchObject({ enabled: true, personId: null, name: 'Gast', photoFile: 'x.png' });
    expect(repos.guest.reset()).toBe('x.png');
    expect(repos.guest.get()).toMatchObject({ enabled: false, name: '', photoFile: null });
  });
});

describe('game', () => {
  it('starts in the lobby and persists phase and state', () => {
    expect(repos.game.get().phase).toBe('lobby');
    repos.game.save('presenting', { reserved: 'x' });
    expect(repos.game.get()).toMatchObject({ phase: 'presenting', state: { reserved: 'x' } });
  });
});

describe('rounds and votes', () => {
  it('numbers rounds, patches timestamps and stores the owner only when revealed', () => {
    const p = person('Anna');
    const q = person('Ben');
    const s1 = repos.submissions.replaceForOwner({ ownerHash: 'h1', kind: 'html', status: 'ready', filePath: 'a' }).submission;
    const s2 = repos.submissions.replaceForOwner({ ownerHash: 'h2', kind: 'html', status: 'ready', filePath: 'b' }).submission;
    const r1 = repos.rounds.create({ presenterId: p.id, submissionId: s1.id });
    const r2 = repos.rounds.create({ presenterId: q.id, submissionId: s2.id });
    expect([r1.number, r2.number]).toEqual([1, 2]);
    expect(r1.revealedOwnerId).toBeNull();
    expect(repos.rounds.update(r1.id, { startedAt: 10, revealedOwnerId: q.id })).toMatchObject({
      startedAt: 10,
      revealedOwnerId: q.id,
      closedAt: null,
    });
    expect(repos.rounds.latest()?.id).toBe(r2.id);
    expect(() => repos.rounds.create({ presenterId: p.id, submissionId: s1.id })).toThrow();
  });

  it('upserts votes partially and cascades on reset', () => {
    const p = person('Anna');
    const q = person('Ben');
    const s = repos.submissions.replaceForOwner({ ownerHash: 'h1', kind: 'html', status: 'ready', filePath: 'a' }).submission;
    const r = repos.rounds.create({ presenterId: p.id, submissionId: s.id });

    repos.votes.upsert({ roundId: r.id, voterId: q.id, guessPersonId: p.id });
    expect(repos.votes.upsert({ roundId: r.id, voterId: q.id, stars: 4 })).toMatchObject({ guessPersonId: p.id, stars: 4 });
    expect(repos.votes.upsert({ roundId: r.id, voterId: q.id, guessPersonId: null })).toMatchObject({ guessPersonId: null, stars: 4 });
    expect(() => repos.votes.upsert({ roundId: r.id, voterId: q.id, stars: 6 })).toThrow();
    expect(repos.votes.listForRound(r.id)).toHaveLength(1);

    repos.rounds.removeAll();
    expect(repos.votes.listAll()).toHaveLength(0);
    expect(repos.rounds.create({ presenterId: p.id, submissionId: s.id }).number).toBe(1);
  });
});

describe('settings', () => {
  it('has the defaults and updates partially', () => {
    expect(repos.settings.get()).toEqual(DEFAULT_SETTINGS);
    expect(repos.settings.update({ talkTimeLimitS: 300 })).toEqual({ ...DEFAULT_SETTINGS, talkTimeLimitS: 300 });
    expect(repos.settings.update({ submissionDeadline: 123 }).talkTimeLimitS).toBe(300);
  });
});
