import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { io as connect, type Socket } from 'socket.io-client';
import {
  API_PATHS,
  SESSION_COOKIE_NAME,
  SOCKET_NAMESPACES,
  type Ack,
  type AdminPersonDto,
  type ComboEvent,
  type HostSnapshot,
} from '@pribe/shared';
import { buildApp } from '../app';
import type { Config } from '../config';
import { testConfig } from '../testing';
import { BOT_PROFILES } from './bots';
import { probeDir } from '.';

type Built = Awaited<ReturnType<typeof buildApp>>;
const apps: Built[] = [];
const sockets: Socket[] = [];

afterEach(async () => {
  for (const s of sockets.splice(0)) s.close();
  for (const b of apps.splice(0)) await b.app.close();
});

async function build(config: Config): Promise<Built> {
  const built = await buildApp(config, { probeBots: { timeScale: 0.01 } });
  apps.push(built);
  return built;
}

async function adminCookie(built: Built): Promise<string> {
  const res = await built.app.inject({ method: 'POST', url: API_PATHS.auth.login, payload: { password: 'test-password' } });
  const c = res.cookies.find((x) => x.name === SESSION_COOKIE_NAME)!;
  return `${c.name}=${c.value}`;
}

const post = (built: Built, cookie: string, url: string, payload: object = {}) =>
  built.app.inject({ method: 'POST', url, headers: { cookie }, payload });

/** Real data of the kind a test run must never touch: persons, submissions, topics, game state. */
function seedReal(built: Built) {
  const { repos, ownerHash, config } = built.ctx;
  const anna = repos.persons.create({ name: 'Anna', emoji: '🐸', color: '#123456' });
  repos.persons.create({ name: 'Ben', emoji: '🐼', color: '#654321' });
  writeFileSync(path.join(config.filesDir, 'real.html'), '<h1>echt</h1>');
  repos.submissions.replaceForOwner({ ownerHash: ownerHash(anna.id), kind: 'html', status: 'ready', filePath: 'real.html' });
  repos.topics.assign(ownerHash(anna.id));
  repos.settings.update({ talkTimeLimitS: 300, voteCountdownS: 25, inviteCode: 'ECHT' });
  repos.game.save('choosePresenter', {});
}

function dump(built: Built) {
  const { db, config } = built.ctx;
  const tables = ['persons', 'submissions', 'rounds', 'votes', 'game', 'settings', 'topic_assignments'];
  return {
    tables: Object.fromEntries(tables.map((t) => [t, db.prepare(`SELECT * FROM ${t} ORDER BY 1`).all()])),
    files: readdirSync(config.filesDir).sort(),
    paths: { dataDir: config.dataDir, filesDir: config.filesDir },
  };
}

async function waitFor<T>(fn: () => T | undefined | null | false, timeoutMs = 5000): Promise<T> {
  const until = Date.now() + timeoutMs;
  for (;;) {
    const v = fn();
    if (v) return v;
    if (Date.now() > until) throw new Error('timeout');
    await new Promise((r) => setTimeout(r, 20));
  }
}

describe('test run (R83)', () => {
  it('start and stop leave the real data untouched', async () => {
    const config = testConfig();
    const built = await build(config);
    seedReal(built);
    const before = dump(built);
    const cookie = await adminCookie(built);

    expect((await post(built, cookie, API_PATHS.admin.probeStart)).json()).toEqual({ active: true });
    expect((await post(built, cookie, API_PATHS.admin.probeStart)).statusCode).toBe(409);

    const persons = (await built.app.inject({ url: API_PATHS.admin.persons, headers: { cookie } })).json<AdminPersonDto[]>();
    expect(persons.map((p) => p.name).sort()).toEqual(BOT_PROFILES.map((p) => p.name).sort());
    const subs = (await built.app.inject({ url: API_PATHS.admin.submissions, headers: { cookie } })).json<{ items: { kind: string }[] }>();
    expect(subs.items.map((s) => s.kind).sort()).toEqual(['html', 'html', 'html', 'pptx', 'pptx']);
    expect(built.ctx.config.filesDir.startsWith(probeDir(config.dataDir))).toBe(true);

    // Resets belong to the real data and are refused while the bots play.
    for (const url of [API_PATHS.admin.reset, API_PATHS.admin.resetTopics]) {
      expect((await post(built, cookie, url)).statusCode).toBe(409);
    }
    expect((await post(built, cookie, API_PATHS.admin.resetAll, { confirm: 'LÖSCHEN' })).statusCode).toBe(409);

    expect((await post(built, cookie, API_PATHS.admin.probeStop)).json()).toEqual({ active: false });
    expect(dump(built)).toEqual(before);
    expect(existsSync(probeDir(config.dataDir))).toBe(false);
  });

  it('bots join, vote, rate the talk and fire a combo until the reveal', async () => {
    const built = await build(testConfig());
    await built.app.listen({ port: 0, host: '127.0.0.1' });
    const base = `http://127.0.0.1:${(built.app.server.address() as AddressInfo).port}`;
    const cookie = await adminCookie(built);

    const host = connect(`${base}${SOCKET_NAMESPACES.host}`, {
      transports: ['websocket'],
      reconnection: false,
      forceNew: true,
      extraHeaders: { cookie },
    });
    sockets.push(host);
    const latest: { snap: HostSnapshot | null } = { snap: null };
    const combos: ComboEvent[] = [];
    host.on('state', (s: HostSnapshot) => (latest.snap = s));
    host.on('reaction:combo', (e: ComboEvent) => combos.push(e));
    await new Promise<void>((resolve) => host.on('connect', () => resolve()));
    const call = (event: string, ...args: unknown[]) =>
      new Promise<Ack<unknown>>((resolve) => host.emit(event, ...args, resolve));

    await post(built, cookie, API_PATHS.admin.probeStart);
    built.ctx.repos.settings.update({ voteCountdownS: 1 });
    const lobby = await waitFor(() => latest.snap?.probe && latest.snap.connectedPersonIds.length === BOT_PROFILES.length && latest.snap);
    expect(lobby.phase).toBe('lobby');

    expect(await call('game:start')).toEqual({ ok: true });
    expect(await call('round:draw', { presenterId: lobby.persons[0]!.id })).toEqual({ ok: true });
    expect(await call('round:start')).toEqual({ ok: true });
    await waitFor(() => latest.snap?.round && latest.snap.round.votedPersonIds.length === BOT_PROFILES.length);
    await waitFor(() => combos.length > 0);

    expect(await call('round:close')).toEqual({ ok: true });
    const reveal = await waitFor(() => latest.snap?.phase === 'reveal' && latest.snap.reveal);
    expect(reveal.tally.length).toBeGreaterThan(0);
    expect(reveal.ratingCount).toBeGreaterThan(0);
    expect(reveal.talkRatingCount).toBeGreaterThan(0);
  });

  it('a restart during the test run comes back to the real game', async () => {
    const config = testConfig();
    const first = await build(config);
    seedReal(first);
    const before = dump(first);
    await post(first, await adminCookie(first), API_PATHS.admin.probeStart);
    expect(first.ctx.repos.persons.list()).toHaveLength(BOT_PROFILES.length);
    await first.app.close();
    apps.splice(apps.indexOf(first), 1);

    // A crash leaves the directory behind; the next start removes it.
    mkdirSync(probeDir(config.dataDir), { recursive: true });
    writeFileSync(path.join(probeDir(config.dataDir), 'pribe.sqlite'), 'leftover');

    const second = await build(config);
    expect(second.ctx.probe.active).toBe(false);
    expect(dump(second)).toEqual(before);
    expect(existsSync(probeDir(config.dataDir))).toBe(false);
  });
});
