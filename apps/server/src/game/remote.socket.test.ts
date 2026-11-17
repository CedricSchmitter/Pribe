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
  type VoteSnapshot,
  type WheelSpunEvent,
} from '@pribe/shared';
import { buildApp } from '../app';
import { testConfig } from '../testing';

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

function nextState<S>(socket: Socket, match: (s: S) => boolean): Promise<S> {
  return new Promise((resolve) => {
    const on = (s: S) => {
      if (!match(s)) return;
      socket.off('state', on);
      resolve(s);
    };
    socket.on('state', on);
  });
}

const inPhase = (phase: string) => (s: { phase: string }) => s.phase === phase;

describe('remote as a second host client (R80, R82)', () => {
  it('drives a round and the finale; the beamer follows and only the presenter phone is flagged', async () => {
    const { repos, ownerHash } = built.ctx;
    repos.settings.update({ voteCountdownS: 1 });
    const mk = (name: string) => repos.persons.create({ name, emoji: '🙂', color: '#abcdef' });
    const [anna, ben, cleo] = [mk('Anna'), mk('Ben'), mk('Cleo')] as [Person, Person, Person];
    for (const p of [anna, ben]) {
      repos.submissions.replaceForOwner({ ownerHash: ownerHash(p.id), kind: 'html', status: 'ready', filePath: 'x.html' });
    }

    const login = await built.app.inject({ method: 'POST', url: API_PATHS.auth.login, payload: { password: 'test-password' } });
    const c = login.cookies.find((x) => x.name === SESSION_COOKIE_NAME)!;
    const admin = `${c.name}=${c.value}`;
    const beamer = await open(SOCKET_NAMESPACES.host, admin);
    const remote = await open(SOCKET_NAMESPACES.host, admin);

    const personCookie = async (p: Person) => {
      const res = await built.app.inject({ method: 'POST', url: API_PATHS.person.setPassword, payload: { personId: p.id, password: 'geheim' } });
      const pc = res.cookies.find((x) => x.name === PERSON_COOKIE_NAME)!;
      return `${pc.name}=${pc.value}`;
    };
    const phones = await Promise.all([anna, ben, cleo].map(async (p) => open(SOCKET_NAMESPACES.vote, await personCookie(p))));

    const choose = nextState<HostSnapshot>(beamer, inPhase('choosePresenter'));
    expect(await call(remote, 'game:start')).toEqual({ ok: true });
    await choose;

    const spun = new Promise<WheelSpunEvent>((resolve) => beamer.once('wheel:spun', resolve));
    const spin = await call<WheelSpunEvent>(remote, 'presenter:spin');
    expect(spin.ok).toBe(true);
    expect((await spun).presenterId).toBe(spin.ok && spin.data.presenterId);

    expect(await call(remote, 'finale:step', { step: 2 })).toMatchObject({ ok: false, error: 'WRONG_PHASE' });

    const drawing = nextState<HostSnapshot>(beamer, inPhase('drawing'));
    const phoneDrawing = Promise.all(phones.map((s) => nextState<VoteSnapshot>(s, inPhase('drawing'))));
    expect(await call(remote, 'round:draw', { presenterId: ben.id })).toEqual({ ok: true });
    expect((await drawing).round!.presenterId).toBe(ben.id);

    // Beamer animation and remote fallback race for the start: exactly one wins, nothing breaks.
    const presenting = Promise.all(phones.map((s) => nextState<VoteSnapshot>(s, inPhase('presenting'))));
    const starts = await Promise.all([call(beamer, 'round:start'), call(remote, 'round:start')]);
    expect(starts.filter((r) => r.ok)).toHaveLength(1);
    expect(starts.find((r) => !r.ok)).toMatchObject({ error: 'WRONG_PHASE' });

    // Presenter phone: round.presenterId === me; every other phone (the owner Anna included) sees someone else.
    for (const snaps of [await phoneDrawing, await presenting]) {
      expect(snaps.map((s) => s.round?.presenterId === s.me)).toEqual([false, true, false]);
      const neutral = snaps.map((s) => ({ ...s, me: null, serverTime: 0 }));
      expect(neutral[0]).toEqual(neutral[2]);
    }

    const countdown = nextState<HostSnapshot>(beamer, inPhase('countdown'));
    expect(await call(remote, 'round:close')).toEqual({ ok: true });
    await countdown;
    await nextState<HostSnapshot>(beamer, inPhase('reveal'));

    const finale = nextState<HostSnapshot>(beamer, inPhase('finale'));
    expect(await call(remote, 'finale:start')).toEqual({ ok: true });
    expect((await finale).finaleStep).toBe(0);

    const beamerAt3 = nextState<HostSnapshot>(beamer, (s) => s.finaleStep === 3);
    expect(await call(remote, 'finale:step', { step: 3 })).toEqual({ ok: true });
    await beamerAt3;
    const remoteAt2 = nextState<HostSnapshot>(remote, (s) => s.finaleStep === 2);
    expect(await call(beamer, 'finale:step', { step: 2 })).toEqual({ ok: true });
    await remoteAt2;
    expect(await call(remote, 'finale:step', { step: -1 })).toMatchObject({ ok: false, error: 'INVALID_PAYLOAD' });

    // A host that connects late (beamer reload) resumes at the shared station.
    const late = await call<HostSnapshot>(remote, 'state:request');
    expect(late.ok && late.data.finaleStep).toBe(2);
  });
});
