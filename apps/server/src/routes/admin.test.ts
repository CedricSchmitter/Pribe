import { readdirSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { API_PATHS, type Person, type SubmissionOverviewDto, type SubmissionStatusDto } from '@pribe/shared';
import { HTML, PPTX, setup } from './submit.testkit';

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

describe('reset', () => {
  async function playOneRound(voter: Person, presenter: Person, submissionId: string) {
    const round = t.ctx.repos.rounds.create({ presenterId: presenter.id, submissionId });
    t.ctx.repos.votes.upsert({ roundId: round.id, voterId: voter.id, guessPersonId: presenter.id, stars: 4 });
    t.ctx.repos.game.save('reveal', { some: 'state' });
  }

  it('deletes rounds and votes, keeps submissions by default', async () => {
    const anna = await t.addPerson('Anna');
    const ben = await t.addPerson('Ben');
    const sub = (await t.upload(anna.id, 'x.html', HTML)).json() as SubmissionStatusDto;
    await playOneRound(anna, ben, sub.submissionId);

    const res = await t.admin('POST', API_PATHS.admin.reset, { deleteSubmissions: false });
    expect(res.json()).toEqual({ submissionsDeleted: 0 });
    expect(t.ctx.repos.rounds.list()).toEqual([]);
    expect(t.ctx.repos.votes.listAll()).toEqual([]);
    expect(t.ctx.repos.game.get()).toMatchObject({ phase: 'lobby', state: {} });
    expect(t.ctx.repos.submissions.list()).toHaveLength(1);
    expect(t.ctx.repos.persons.list()).toHaveLength(2);
    expect(readdirSync(t.ctx.config.filesDir)).toEqual([`${sub.submissionId}.html`]);
  });

  it('optionally deletes submissions and their files', async () => {
    const anna = await t.addPerson('Anna');
    const ben = await t.addPerson('Ben');
    const sub = (await t.upload(anna.id, 'x.html', HTML)).json() as SubmissionStatusDto;
    await t.upload(ben.id, 'x.html', HTML);
    await playOneRound(anna, ben, sub.submissionId);

    const res = await t.admin('POST', API_PATHS.admin.reset, { deleteSubmissions: true });
    expect(res.json()).toEqual({ submissionsDeleted: 2 });
    expect(t.ctx.repos.submissions.list()).toEqual([]);
    expect(t.ctx.repos.rounds.list()).toEqual([]);
    expect(readdirSync(t.ctx.config.filesDir)).toEqual([]);
    expect(t.ctx.repos.persons.list()).toHaveLength(2);
  });
});
