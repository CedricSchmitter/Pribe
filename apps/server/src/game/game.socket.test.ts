import type { AddressInfo } from 'node:net';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { io as connect, type Socket } from 'socket.io-client';
import {
  API_PATHS,
  PERSON_COOKIE_NAME,
  SESSION_COOKIE_NAME,
  SOCKET_NAMESPACES,
  type Ack,
  type HostSnapshot,
  type Person,
  type ReactionEvent,
  type VoteSnapshot,
} from '@pribe/shared';
import { buildApp } from '../app';
import { testConfig } from '../testing';
import { REACTION_THROTTLE } from '.';

let built: Awaited<ReturnType<typeof buildApp>>;
let base: string;
const sockets: Socket[] = [];

beforeEach(async () => {
  built = await buildApp(testConfig(), { dbFile: ':memory:' });
  await built.app.listen({ port: 0, host: '127.0.0.1' });
  base = `http://127.0.0.1:${(built.app.server.address() as AddressInfo).port}`;
});

afterEach(async () => {
  for (const s of sockets.splice(0)) s.close();
  await built.app.close();
});

async function open(ns: string, cookie?: string): Promise<Socket> {
  const socket = connect(`${base}${ns}`, { transports: ['websocket'], reconnection: false, forceNew: true, extraHeaders: cookie ? { cookie } : {} });
  sockets.push(socket);
  await new Promise<void>((resolve, reject) => {
    socket.on('connect', () => resolve());
    socket.on('connect_error', reject);
  });
  return socket;
}

function call<T = void>(socket: Socket, event: string, ...args: unknown[]): Promise<Ack<T>> {
  return new Promise((resolve) => socket.emit(event, ...args, resolve));
}

function nextState<S extends { phase: string }>(socket: Socket, phase: string): Promise<S> {
  return new Promise((resolve) => {
    const on = (s: S) => {
      if (s.phase !== phase) return;
      socket.off('state', on);
      resolve(s);
    };
    socket.on('state', on);
  });
}

describe('game over sockets', () => {
  it('host + 3 phones play one round; owner phone is indistinguishable until the reveal', async () => {
    const { repos, ownerHash } = built.ctx;
    repos.settings.update({ voteCountdownS: 1 });
    const mk = (name: string) => repos.persons.create({ name, emoji: '🙂', color: '#abcdef' });
    const persons: Person[] = [mk('Anna'), mk('Ben'), mk('Cleo'), mk('Dan')];
    const [anna, ben, cleo, dan] = persons as [Person, Person, Person, Person];
    for (const p of [anna, ben, cleo]) {
      repos.submissions.replaceForOwner({ ownerHash: ownerHash(p.id), kind: 'html', status: 'ready', filePath: 'x.html' });
    }

    const login = await built.app.inject({ method: 'POST', url: API_PATHS.auth.login, payload: { password: 'test-password' } });
    const c = login.cookies.find((x) => x.name === SESSION_COOKIE_NAME)!;
    const host = await open(SOCKET_NAMESPACES.host, `${c.name}=${c.value}`);
    const reactions: ReactionEvent[] = [];
    host.on('reaction', (e: ReactionEvent) => reactions.push(e));

    const personCookie = async (p: Person) => {
      const res = await built.app.inject({
        method: 'POST',
        url: API_PATHS.person.setPassword,
        payload: { personId: p.id, password: 'geheim' },
      });
      const pc = res.cookies.find((x) => x.name === PERSON_COOKIE_NAME)!;
      return `${pc.name}=${pc.value}`;
    };
    const phoneCookies = await Promise.all([anna, ben, cleo].map(personCookie));
    const phones = await Promise.all(phoneCookies.map((cookie) => open(SOCKET_NAMESPACES.vote, cookie)));
    const received = new Map<Socket, VoteSnapshot[]>(phones.map((s) => [s, []]));
    for (const s of phones) s.on('state', (snap: VoteSnapshot) => received.get(s)!.push(snap));

    const lobby = new Promise<HostSnapshot>((resolve) => {
      host.on('state', (s: HostSnapshot) => s.connectedPersonIds.length === 3 && resolve(s));
    });
    for (const [i, p] of [anna, ben, cleo].entries()) {
      expect(await call(phones[i]!, 'vote:identify', { personId: p.id })).toEqual({ ok: true });
    }
    expect((await lobby).connectedPersonIds.sort()).toEqual([anna.id, ben.id, cleo.id].sort());
    expect(await call(phones[0]!, 'vote:identify', { personId: 'nope' })).toMatchObject({ ok: false, error: 'UNKNOWN_PERSON' });

    expect(await call(host, 'game:start')).toEqual({ ok: true });
    expect(await call(host, 'round:draw', { presenterId: dan.id })).toEqual({ ok: true });
    const presenting = nextState<VoteSnapshot>(phones[0]!, 'presenting');
    expect(await call(host, 'round:start')).toEqual({ ok: true });
    const roundId = (await presenting).round!.id;

    const hostState = await call<HostSnapshot>(host, 'state:request');
    if (!hostState.ok) throw new Error(hostState.error);
    const ownerId = persons.find((p) => repos.submissions.findByOwnerHash(ownerHash(p.id))?.id === hostState.data.round!.submission.id)!.id;

    // Everyone guesses Anna with 4 stars, the owner included.
    for (const s of phones) {
      expect(await call(s, 'vote:cast', { roundId, guessPersonId: anna.id, stars: 4 })).toEqual({
        ok: true,
        data: { roundId, guessPersonId: anna.id, stars: 4, talkStars: null },
      });
    }
    expect(await call(phones[1]!, 'vote:cast', { roundId, stars: 9 })).toMatchObject({ ok: false, error: 'INVALID_PAYLOAD' });

    // Reactions are forwarded to the host and throttled per phone.
    const acks = [];
    for (let i = 0; i < REACTION_THROTTLE.capacity + 2; i++) acks.push(await call(phones[2]!, 'reaction:send', { emoji: '🔥' }));
    expect(acks.filter((a) => a.ok)).toHaveLength(REACTION_THROTTLE.capacity);
    expect(acks.at(-1)).toMatchObject({ ok: false, error: 'RATE_LIMITED' });
    expect(await call(phones[1]!, 'reaction:send', { emoji: '👏' })).toEqual({ ok: true });

    const revealed = Promise.all(phones.map((s) => nextState<VoteSnapshot>(s, 'reveal')));
    const hostRevealed = nextState<HostSnapshot>(host, 'reveal');
    expect(await call(host, 'round:close')).toEqual({ ok: true });
    const [hostReveal, phoneReveals] = await Promise.all([hostRevealed, revealed]);

    expect(reactions.length).toBe(REACTION_THROTTLE.capacity + 1);
    expect(reactions[0]).toMatchObject({ emoji: '🔥', personId: cleo.id });

    // Before the reveal every phone received the same sequence of snapshots apart from its own identity.
    const neutral = (s: VoteSnapshot) => ({ ...s, me: null, serverTime: 0 });
    const preReveal = phones.map((s) => received.get(s)!.filter((x) => x.phase !== 'reveal').map(neutral));
    expect(preReveal[1]).toEqual(preReveal[0]);
    expect(preReveal[2]).toEqual(preReveal[0]);
    for (const snaps of preReveal) {
      expect(snaps.every((s) => s.reveal === null && s.myOutcome === null)).toBe(true);
      expect(JSON.stringify(snaps)).not.toContain(ownerHash(ownerId));
    }

    const reveal = hostReveal.reveal!;
    expect(reveal.ownerId).toBe(ownerId);
    expect(reveal.presenterId).toBe(dan.id);
    const counting = [anna, ben, cleo].filter((p) => p.id !== ownerId);
    expect(reveal.tally).toEqual([{ personId: anna.id, count: counting.length }]);
    expect(reveal.correctVoterIds.sort()).toEqual(ownerId === anna.id ? counting.map((p) => p.id).sort() : []);
    expect(reveal.avgStars).toBe(4);
    expect(reveal.ratingCount).toBe(2);

    for (const [i, p] of [anna, ben, cleo].entries()) {
      const expected = p.id === ownerId ? 'owner' : ownerId === anna.id ? 'correct' : 'wrong';
      expect(phoneReveals[i]!.myOutcome).toBe(expected);
    }

    const finale = nextState<HostSnapshot>(host, 'finale');
    expect(await call(host, 'finale:start')).toEqual({ ok: true });
    const board = (await finale).finale!.leaderboard;
    expect(board.reduce((sum, e) => sum + e.points, 0)).toBe(reveal.correctVoterIds.length);
  });

  it('an admin reset mid-countdown sends the lobby to open screens and drops the countdown (R14)', async () => {
    const { repos, ownerHash } = built.ctx;
    repos.settings.update({ voteCountdownS: 1 });
    const anna = repos.persons.create({ name: 'Anna', emoji: '🙂', color: '#abcdef' });
    const ben = repos.persons.create({ name: 'Ben', emoji: '🙂', color: '#abcdef' });
    repos.submissions.replaceForOwner({ ownerHash: ownerHash(anna.id), kind: 'html', status: 'ready', filePath: 'x.html' });

    const login = await built.app.inject({ method: 'POST', url: API_PATHS.auth.login, payload: { password: 'test-password' } });
    const c = login.cookies.find((x) => x.name === SESSION_COOKIE_NAME)!;
    const adminCookie = `${c.name}=${c.value}`;
    const host = await open(SOCKET_NAMESPACES.host, adminCookie);
    const phone = await open(SOCKET_NAMESPACES.vote);

    expect(await call(host, 'game:start')).toEqual({ ok: true });
    expect(await call(host, 'round:draw', { presenterId: ben.id })).toEqual({ ok: true });
    expect(await call(host, 'round:start')).toEqual({ ok: true });
    expect(await call(host, 'round:close')).toEqual({ ok: true });

    const hostLobby = nextState<HostSnapshot>(host, 'lobby');
    const phoneLobby = nextState<VoteSnapshot>(phone, 'lobby');
    const reset = await built.app.inject({ method: 'POST', url: API_PATHS.admin.reset, headers: { cookie: adminCookie }, payload: {} });
    expect(reset.statusCode).toBe(200);
    expect((await hostLobby).round).toBeNull();
    expect((await phoneLobby).roundCount).toBe(0);

    // The old countdown must not fire into the new game.
    const states: string[] = [];
    host.on('state', (s: HostSnapshot) => states.push(s.phase));
    await new Promise((r) => setTimeout(r, 1300));
    expect(states).toEqual([]);
    expect(repos.game.get().phase).toBe('lobby');
  });

  it('surprise guest: reveal, talk and the way back reach host and phones (R90)', async () => {
    const { repos, ownerHash } = built.ctx;
    const anna = repos.persons.create({ name: 'Anna', emoji: '🙂', color: '#abcdef' });
    const ben = repos.persons.create({ name: 'Ben', emoji: '🙂', color: '#abcdef' });
    repos.submissions.replaceForOwner({ ownerHash: ownerHash(anna.id), kind: 'html', status: 'ready', filePath: 'x.html' });
    repos.guest.update({ enabled: true, name: 'Die Chefin', emoji: '🎩', color: '#ffd000' });
    const guestSub = repos.submissions.replaceGuest({ kind: 'html', status: 'ready', filePath: 'g.html' }).submission;

    const login = await built.app.inject({ method: 'POST', url: API_PATHS.auth.login, payload: { password: 'test-password' } });
    const c = login.cookies.find((x) => x.name === SESSION_COOKIE_NAME)!;
    const host = await open(SOCKET_NAMESPACES.host, `${c.name}=${c.value}`);
    const phone = await open(SOCKET_NAMESPACES.vote);
    const phoneSnaps: VoteSnapshot[] = [];
    phone.on('state', (s: VoteSnapshot) => phoneSnaps.push(s));

    expect(await call(host, 'game:start')).toEqual({ ok: true });
    expect(await call(host, 'round:draw', { presenterId: ben.id })).toEqual({ ok: true });
    expect(await call(host, 'round:start')).toEqual({ ok: true });
    expect(await call(host, 'guest:start')).toMatchObject({ ok: false, error: 'WRONG_PHASE' });
    expect(await call(host, 'round:close')).toEqual({ ok: true });
    built.ctx.repos.game.save('reveal', {});
    expect(await call(host, 'finale:start')).toEqual({ ok: true });
    expect(await call(host, 'finale:step', { step: 3 })).toEqual({ ok: true });

    const hostGuest = nextState<HostSnapshot>(host, 'guest');
    const phoneGuest = nextState<VoteSnapshot>(phone, 'guest');
    expect(await call(host, 'guest:start')).toEqual({ ok: true });
    expect((await hostGuest).guest?.presentation.id).toBe(guestSub.id);
    expect((await phoneGuest).guest).toMatchObject({ name: 'Die Chefin', presentingSince: null });

    expect(await call(host, 'guest:present')).toEqual({ ok: true });
    const talking = await call<HostSnapshot>(host, 'state:request');
    if (!talking.ok) throw new Error(talking.error);
    expect(talking.data.guest?.presentingSince).toEqual(expect.any(Number));

    expect(await call(host, 'finale:step', { step: 7 })).toMatchObject({ ok: false, error: 'WRONG_PHASE' });
    const back = nextState<VoteSnapshot>(phone, 'finale');
    expect(await call(host, 'guest:back')).toEqual({ ok: true });
    expect((await back).roundCount).toBe(1);
    const finale = await call<HostSnapshot>(host, 'state:request');
    if (!finale.ok) throw new Error(finale.error);
    expect(finale.data.finaleStep).toBe(3);
    // The phones learn about the guest only once it is on stage, and never get its file.
    const json = JSON.stringify(phoneSnaps);
    expect(json).not.toContain(guestSub.id);
    expect(json).not.toContain('guestReady');
    expect(phoneSnaps.filter((s) => s.phase !== 'guest').every((s) => s.guest === null)).toBe(true);
  });
});
