import { existsSync, readdirSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { API_PATHS, type Person, type SubmissionOverviewDto, type SubmissionStatusDto } from '@pribe/shared';
import { HTML, PPTX, setup } from './submit.testkit';
import { avatarsDir, replacePhoto } from './submitPhoto';

let t: Awaited<ReturnType<typeof setup>>;

beforeEach(async () => {
  t = await setup();
});
afterEach(async () => {
  await t.app.close();
});

describe('guard', () => {
  it('every admin route requires the session', async () => {
    for (const [method, url] of [
      ['GET', API_PATHS.admin.persons],
      ['POST', API_PATHS.admin.persons],
      ['PUT', API_PATHS.admin.person('x')],
      ['DELETE', API_PATHS.admin.person('x')],
      ['GET', API_PATHS.admin.settings],
      ['PUT', API_PATHS.admin.settings],
      ['GET', API_PATHS.admin.submissions],
      ['POST', API_PATHS.admin.reset],
      ['POST', API_PATHS.admin.resetTopics],
      ['POST', API_PATHS.admin.resetAll],
    ] as const) {
      const res = await t.app.inject({ method, url, payload: {} });
      expect(res.statusCode, `${method} ${url}`).toBe(401);
    }
  });
});

describe('persons', () => {
  it('creates, updates and deletes', async () => {
    const anna = await t.addPerson('Anna');
    expect(anna).toMatchObject({ name: 'Anna', emoji: '🦊', color: '#ff3366' });

    const upd = await t.admin('PUT', API_PATHS.admin.person(anna.id), { name: 'Anna B.', emoji: '🐙', color: '#00aa88' });
    expect(upd.json()).toEqual({ id: anna.id, name: 'Anna B.', emoji: '🐙', color: '#00aa88', photoUrl: null });

    expect((await t.admin('DELETE', API_PATHS.admin.person(anna.id))).statusCode).toBe(204);
    expect((await t.admin('GET', API_PATHS.admin.persons)).json()).toEqual([]);
    expect((await t.admin('DELETE', API_PATHS.admin.person(anna.id))).statusCode).toBe(404);
  });

  it('validates input and rejects duplicate names', async () => {
    await t.addPerson('Anna');
    expect((await t.admin('POST', API_PATHS.admin.persons, { name: '', emoji: '🦊', color: '#ff3366' })).statusCode).toBe(400);
    expect((await t.admin('POST', API_PATHS.admin.persons, { name: 'X', emoji: '🦊', color: 'red' })).statusCode).toBe(400);
    const dup = await t.admin('POST', API_PATHS.admin.persons, { name: 'Anna', emoji: '🐙', color: '#000000' });
    expect(dup.statusCode).toBe(409);
  });

  it('deleting a person also deletes their submission and file', async () => {
    const anna = await t.addPerson('Anna');
    await t.upload(anna.id, 'x.html', HTML);
    await t.admin('DELETE', API_PATHS.admin.person(anna.id));
    expect(t.ctx.repos.submissions.list()).toEqual([]);
    expect(readdirSync(t.ctx.config.filesDir)).toEqual([]);
  });

  it('refuses to delete persons once the game has started', async () => {
    const anna = await t.addPerson('Anna');
    t.ctx.repos.game.save('choosePresenter');
    expect((await t.admin('DELETE', API_PATHS.admin.person(anna.id))).json()).toMatchObject({ error: 'WRONG_PHASE' });
  });
});

describe('settings', () => {
  it('returns defaults and saves partial updates', async () => {
    const publicUrl = 'http://localhost:3000';
    expect((await t.admin('GET', API_PATHS.admin.settings)).json()).toEqual({
      submissionDeadline: null,
      talkTimeLimitS: 0,
      voteCountdownS: 20,
      inviteCode: null,
      publicUrl,
    });
    const deadline = Date.UTC(2026, 11, 1, 18, 0);
    const res = await t.admin('PUT', API_PATHS.admin.settings, { submissionDeadline: deadline, talkTimeLimitS: 300 });
    expect(res.json()).toEqual({ submissionDeadline: deadline, talkTimeLimitS: 300, voteCountdownS: 20, inviteCode: null, publicUrl });
    expect((await t.admin('PUT', API_PATHS.admin.settings, { voteCountdownS: 0 })).statusCode).toBe(400);
  });
});

describe('submission overview', () => {
  it('shows count, kind and status, but no owner and no timestamps', async () => {
    const anna = await t.addPerson('Anna');
    const ben = await t.addPerson('Ben');
    await t.upload(anna.id, 'x.html', HTML);
    await t.upload(ben.id, 'x.pptx', PPTX);
    await t.ctx.conversion.close();

    const res = await t.admin('GET', API_PATHS.admin.submissions);
    const dto = res.json() as SubmissionOverviewDto;
    expect(dto.total).toBe(2);
    expect(dto.byStatus).toEqual({ converting: 0, ready: 2, failed: 0 });
    for (const item of dto.items) expect(Object.keys(item).sort()).toEqual(['id', 'kind', 'status']);
    expect(dto.items.map((i) => i.kind).sort()).toEqual(['html', 'pptx']);
    for (const secret of [anna.id, ben.id, t.ctx.ownerHash(anna.id), 'Anna', 'Ben']) {
      expect(res.body).not.toContain(secret);
    }
  });
});

describe('reset (R88)', () => {
  const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const settings = { submissionDeadline: Date.UTC(2026, 11, 1), talkTimeLimitS: 300, voteCountdownS: 15, inviteCode: 'PRIBE' };

  /** Anna and Ben with photo, topic and submission; one round with a vote. */
  async function fullEvening() {
    const anna = await t.addPerson('Anna');
    const ben = await t.addPerson('Ben');
    const subs: SubmissionStatusDto[] = [];
    for (const p of [anna, ben]) {
      subs.push((await t.upload(p.id, 'x.html', HTML)).json() as SubmissionStatusDto);
      await replacePhoto(t.ctx, p.id, PNG, 'png');
      t.ctx.repos.topics.assign(t.ctx.ownerHash(p.id));
    }
    await t.admin('PUT', API_PATHS.admin.settings, settings);
    const round = t.ctx.repos.rounds.create({ presenterId: ben.id, submissionId: subs[0]!.submissionId });
    t.ctx.repos.votes.upsert({ roundId: round.id, voterId: anna.id, guessPersonId: ben.id, stars: 4 });
    t.ctx.repos.game.save('reveal', { some: 'state' });
    return { anna, ben, subs };
  }

  const topicCount = (...persons: Person[]) =>
    persons.filter((p) => t.ctx.repos.topics.get(t.ctx.ownerHash(p.id))).length;
  const avatars = () => (existsSync(avatarsDir(t.ctx)) ? readdirSync(avatarsDir(t.ctx)) : []);

  it('game reset: back to a fresh lobby, persons, submissions, files and topics stay', async () => {
    const { anna, ben, subs } = await fullEvening();
    expect(t.ctx.repos.submissions.listPool()).toHaveLength(1);

    const res = await t.admin('POST', API_PATHS.admin.reset, {});
    expect(res.json()).toEqual({ rounds: 1, topics: 0, submissions: 0, persons: 0 });
    expect(t.ctx.repos.rounds.list()).toEqual([]);
    expect(t.ctx.repos.votes.listAll()).toEqual([]);
    expect(t.ctx.repos.game.get()).toMatchObject({ phase: 'lobby', state: {} });
    expect(t.ctx.repos.submissions.listPool().map((s) => s.id).sort()).toEqual(subs.map((s) => s.submissionId).sort());
    expect(t.ctx.repos.persons.list()).toHaveLength(2);
    expect(topicCount(anna, ben)).toBe(2);
    expect(readdirSync(t.ctx.config.filesDir)).toHaveLength(2);
    expect(avatars()).toHaveLength(2);
  });

  it('topic reset: frees every topic, nothing else changes', async () => {
    const { anna, ben } = await fullEvening();

    const res = await t.admin('POST', API_PATHS.admin.resetTopics, {});
    expect(res.json()).toEqual({ rounds: 0, topics: 2, submissions: 0, persons: 0 });
    expect(topicCount(anna, ben)).toBe(0);
    expect(t.ctx.repos.rounds.list()).toHaveLength(1);
    expect(t.ctx.repos.votes.listAll()).toHaveLength(1);
    expect(t.ctx.repos.game.get().phase).toBe('reveal');
    expect(t.ctx.repos.submissions.list()).toHaveLength(2);
    expect(t.ctx.repos.persons.list()).toHaveLength(2);
    expect(avatars()).toHaveLength(2);
  });

  it('delete all: needs the typed confirmation', async () => {
    await fullEvening();
    for (const body of [{}, { confirm: 'löschen' }, { confirm: 'JA' }]) {
      expect((await t.admin('POST', API_PATHS.admin.resetAll, body)).statusCode).toBe(400);
    }
    expect(t.ctx.repos.persons.list()).toHaveLength(2);
  });

  it('delete all: removes persons, submissions, files, photos, topics and the game, keeps settings', async () => {
    const { anna, ben } = await fullEvening();

    const res = await t.admin('POST', API_PATHS.admin.resetAll, { confirm: 'LÖSCHEN' });
    expect(res.json()).toEqual({ rounds: 1, topics: 2, submissions: 2, persons: 2 });
    expect(t.ctx.repos.persons.list()).toEqual([]);
    expect(t.ctx.repos.submissions.list()).toEqual([]);
    expect(t.ctx.repos.rounds.list()).toEqual([]);
    expect(t.ctx.repos.votes.listAll()).toEqual([]);
    expect(topicCount(anna, ben)).toBe(0);
    expect(t.ctx.repos.game.get()).toMatchObject({ phase: 'lobby', state: {} });
    expect(readdirSync(t.ctx.config.filesDir)).toEqual([]);
    expect(avatars()).toEqual([]);
    expect((await t.admin('GET', API_PATHS.admin.settings)).json()).toMatchObject(settings);
  });
});
