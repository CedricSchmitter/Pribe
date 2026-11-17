import type { AddressInfo } from 'node:net';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { io as connect, type Socket } from 'socket.io-client';
import {
  API_PATHS,
  FREE_TOPIC_TITLE,
  PERSON_COOKIE_NAME,
  SOCKET_NAMESPACES,
  TOPICS,
  type Ack,
  type AdminPersonDto,
  type PersonMeDto,
  type SubmissionStatusDto,
  type TopicResponseDto,
  type VoteSnapshot,
} from '@pribe/shared';
import { HTML, PASSWORD, setup } from './submit.testkit';

let t: Awaited<ReturnType<typeof setup>>;

beforeEach(async () => {
  t = await setup();
});
afterEach(async () => {
  await t.app.close();
});

const post = (url: string, payload: unknown, cookie?: string) =>
  t.app.inject({ method: 'POST', url, payload: payload as object, headers: cookie ? { cookie } : {} });

const me = async (cookie?: string) =>
  ((await t.app.inject({ url: API_PATHS.person.me, headers: cookie ? { cookie } : {} })).json() as PersonMeDto).person;

describe('personal password', () => {
  it('first visit sets a password, later visits log in with it', async () => {
    const anna = await t.addPerson('Anna');
    expect((await t.app.inject({ url: API_PATHS.person.status(anna.id) })).json()).toEqual({ hasPassword: false });
    expect((await post(API_PATHS.person.login, { personId: anna.id, password: PASSWORD })).json()).toMatchObject({
      error: 'PASSWORD_NOT_SET',
    });

    const set = await post(API_PATHS.person.setPassword, { personId: anna.id, password: PASSWORD });
    expect(set.statusCode).toBe(200);
    const cookie = set.cookies.find((c) => c.name === PERSON_COOKIE_NAME)!;
    expect(cookie).toMatchObject({ httpOnly: true, sameSite: 'Lax', path: '/' });
    expect((await me(t.cookieOf(set)!))?.id).toBe(anna.id);

    expect((await t.app.inject({ url: API_PATHS.person.status(anna.id) })).json()).toEqual({ hasPassword: true });
    const again = await post(API_PATHS.person.setPassword, { personId: anna.id, password: 'kapern' });
    expect(again.statusCode).toBe(409);

    const login = await post(API_PATHS.person.login, { personId: anna.id, password: PASSWORD });
    expect(login.statusCode).toBe(200);
    expect((await me(t.cookieOf(login)!))?.name).toBe('Anna');

    const stored = t.ctx.repos.persons.getPasswordHash(anna.id)!;
    expect(stored.startsWith('scrypt$')).toBe(true);
    expect(stored).not.toContain(PASSWORD);
  });

  it('rejects a wrong password, short passwords, unknown persons and forged cookies', async () => {
    const anna = await t.addPerson('Anna');
    await t.personCookie(anna.id);
    const wrong = await post(API_PATHS.person.login, { personId: anna.id, password: 'falsch!!' });
    expect(wrong.statusCode).toBe(401);
    expect(wrong.json()).toMatchObject({ error: 'WRONG_PASSWORD' });
    expect(t.cookieOf(wrong)).toBeNull();

    const ben = await t.addPerson('Ben');
    expect((await post(API_PATHS.person.setPassword, { personId: ben.id, password: '123' })).statusCode).toBe(400);
    expect((await post(API_PATHS.person.login, { personId: 'nope', password: PASSWORD })).statusCode).toBe(404);

    expect(await me()).toBeNull();
    expect(await me(`${PERSON_COOKIE_NAME}=${anna.id}.99999999999999.abc`)).toBeNull();
    // An admin cookie is no person cookie.
    expect(await me(t.cookie)).toBeNull();
  });

  it('logout clears the cookie', async () => {
    const anna = await t.addPerson('Anna');
    await t.personCookie(anna.id);
    const res = await post(API_PATHS.person.logout, {});
    expect(res.cookies.find((c) => c.name === PERSON_COOKIE_NAME)?.value).toBe('');
  });

  it('admin reset ends sessions; the person sets a new password and keeps submission and topic', async () => {
    const anna = await t.addPerson('Anna');
    const oldCookie = await t.personCookie(anna.id);
    const topic = ((await post(API_PATHS.submit.topicSpin, {}, oldCookie)).json() as TopicResponseDto).topic;
    const sub = (await t.upload(anna.id, 'x.html', HTML)).json() as SubmissionStatusDto;

    const list = (await t.admin('GET', API_PATHS.admin.persons)).json() as AdminPersonDto[];
    expect(list).toEqual([expect.objectContaining({ id: anna.id, hasPassword: true })]);
    expect(JSON.stringify(list)).not.toContain('scrypt');

    expect((await t.app.inject({ method: 'POST', url: API_PATHS.admin.personPasswordReset(anna.id) })).statusCode).toBe(401);
    expect((await t.admin('POST', API_PATHS.admin.personPasswordReset(anna.id))).statusCode).toBe(204);
    expect(await me(oldCookie)).toBeNull();
    expect((await t.app.inject({ url: API_PATHS.person.status(anna.id) })).json()).toEqual({ hasPassword: false });

    const fresh = await post(API_PATHS.person.setPassword, { personId: anna.id, password: 'neues-pw' });
    const cookie = t.cookieOf(fresh)!;
    const mine = await t.app.inject({ url: API_PATHS.submit.mine, headers: { cookie } });
    expect((mine.json() as SubmissionStatusDto).submissionId).toBe(sub.submissionId);
    const again = (await t.app.inject({ url: API_PATHS.submit.topic, headers: { cookie } })).json() as TopicResponseDto;
    expect(again.topic).toEqual(topic);
  });
});

describe('topic roulette', () => {
  it('needs a login', async () => {
    expect((await post(API_PATHS.submit.topicSpin, {})).statusCode).toBe(401);
    expect((await t.app.inject({ url: API_PATHS.submit.topic })).statusCode).toBe(401);
  });

  it('never hands out a topic twice, then gives "Freies Thema"; returning shows the same topic', async () => {
    const results: (number | null)[] = [];
    for (let i = 0; i < TOPICS.length + 2; i++) {
      const p = await t.addPerson(`P${i}`);
      const cookie = await t.personCookie(p.id);
      expect(((await t.app.inject({ url: API_PATHS.submit.topic, headers: { cookie } })).json() as TopicResponseDto).topic).toBeNull();
      const { topic } = (await post(API_PATHS.submit.topicSpin, {}, cookie)).json() as TopicResponseDto;
      results.push(topic!.index);
      if (topic!.index === null) expect(topic!.title).toBe(FREE_TOPIC_TITLE);
      else expect(topic!.title).toBe(TOPICS[topic!.index]);

      // Spinning again or coming back yields the same topic.
      expect(((await post(API_PATHS.submit.topicSpin, {}, cookie)).json() as TopicResponseDto).topic).toEqual(topic);
      expect(((await t.app.inject({ url: API_PATHS.submit.topic, headers: { cookie } })).json() as TopicResponseDto).topic).toEqual(topic);
    }
    const assigned = results.slice(0, TOPICS.length);
    expect(new Set(assigned).size).toBe(TOPICS.length);
    expect(assigned.every((i) => i !== null)).toBe(true);
    expect(results.slice(TOPICS.length)).toEqual([null, null]);
  });

  it('is stored under the owner hash, not the person id', async () => {
    const anna = await t.addPerson('Anna');
    await post(API_PATHS.submit.topicSpin, {}, await t.personCookie(anna.id));
    const dump = JSON.stringify(t.ctx.db.prepare('SELECT * FROM topic_assignments').all());
    expect(dump).toContain(t.ctx.ownerHash(anna.id));
    expect(dump).not.toContain(anna.id);
  });
});

describe('vote socket identity', () => {
  let base: string;
  const sockets: Socket[] = [];

  beforeEach(async () => {
    await t.app.listen({ port: 0, host: '127.0.0.1' });
    base = `http://127.0.0.1:${(t.app.server.address() as AddressInfo).port}`;
  });
  afterEach(() => {
    for (const s of sockets.splice(0)) s.close();
  });

  async function openVote(cookie?: string): Promise<{ socket: Socket; first: VoteSnapshot }> {
    const socket = connect(`${base}${SOCKET_NAMESPACES.vote}`, {
      transports: ['websocket'],
      reconnection: false,
      forceNew: true,
      extraHeaders: cookie ? { cookie } : {},
    });
    sockets.push(socket);
    const first = await new Promise<VoteSnapshot>((resolve, reject) => {
      socket.once('state', resolve);
      socket.on('connect_error', reject);
    });
    return { socket, first };
  }

  const identify = (socket: Socket, personId: string | null) =>
    new Promise<Ack>((resolve) => socket.emit('vote:identify', { personId }, resolve));

  it('takes the identity from the person cookie only', async () => {
    const anna = await t.addPerson('Anna');
    const ben = await t.addPerson('Ben');

    const anon = await openVote();
    expect(anon.first.me).toBeNull();
    expect(await identify(anon.socket, anna.id)).toMatchObject({ ok: false, error: 'NOT_IDENTIFIED' });

    const withCookie = await openVote(await t.personCookie(anna.id));
    expect(withCookie.first.me).toBe(anna.id);
    expect(await identify(withCookie.socket, ben.id)).toMatchObject({ ok: false, error: 'NOT_IDENTIFIED' });
    expect(await identify(withCookie.socket, anna.id)).toEqual({ ok: true });

    const forged = await openVote(`${PERSON_COOKIE_NAME}=${ben.id}.99999999999999.abc`);
    expect(forged.first.me).toBeNull();
  });
});
