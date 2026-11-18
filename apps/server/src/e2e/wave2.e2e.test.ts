import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { Socket } from 'socket.io-client';
import { afterAll, describe, expect, it } from 'vitest';
import {
  API_PATHS,
  COMBO_THRESHOLD,
  RESET_ALL_CONFIRMATION,
  SOCKET_NAMESPACES,
  type AdminPersonDto,
  type AdminSettingsDto,
  type ComboEvent,
  type HostSnapshot,
  type Person,
  type PersonMeDto,
  type ProbeStatusDto,
  type ResetResponseDto,
  type SubmissionOverviewDto,
  type SubmissionStatusDto,
  type TopicResponseDto,
  type VoteSnapshot,
} from '@pribe/shared';
import { presentingState } from '../../../web/src/pages/vote/presenting';
import { api, call, cookiesOf, freePort, openSocket, request, ServerProcess, until } from './server';

/*
 * Wave 2 against the real server process (R80, R82–R85, R87, R88): login lock, a second host
 * client as remote, "Du präsentierst!" only on the presenter's phone, talk stars and the
 * Rampensau award, an emoji combo, a test run in the middle of the game, and the three resets.
 */

const PORT = await freePort();
const ADMIN_PASSWORD = 'e2e-admin-pw';
const INVITE = 'WELLE-2';
const COUNTDOWN_S = 1;
const TALK_LIMIT_S = 90;

const dataDir = mkdtempSync(path.join(tmpdir(), 'pribe-e2e-w2-'));
const server = new ServerProcess(PORT, {
  ADMIN_PASSWORD,
  PRIBE_SECRET: 'e2e-secret-wave2-0123456789',
  PUBLIC_URL: `http://localhost:${PORT}`,
  DATA_DIR: dataDir,
  // The login lock keys on the client IP; behind the trusted hop each scenario brings its own.
  TRUST_PROXY: 'true',
  LOG_LEVEL: 'warn',
});

afterAll(async () => {
  await server.kill();
  rmSync(dataDir, { recursive: true, force: true });
});

const PEOPLE = [
  { name: 'Wanda Wellenreiter', emoji: '🦊', color: '#ff6633' },
  { name: 'Xaver Xylophon', emoji: '🐙', color: '#3366ff' },
  { name: 'Yvonne Yogamatte', emoji: '🦄', color: '#cc33ff' },
  { name: 'Zacharias Zitrone', emoji: '🐸', color: '#33cc66' },
  { name: 'Ottilie Ohnedatei', emoji: '🐼', color: '#888888' },
];
/** Persons 0–2 submit; 3 and 4 present, so any drawn presentation is valid. */
const SUBMITTERS = [0, 1, 2];

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

const html = (title: string) => `<!doctype html><html><head><title>${title}</title></head><body><h1>${title}</h1></body></html>`;

async function adminLogin(base: string, password: string, ip: string) {
  const res = await fetch(`${base}${API_PATHS.auth.login}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': ip },
    body: JSON.stringify({ password }),
  });
  return { status: res.status, cookie: cookiesOf(res), retryAfter: res.headers.get('retry-after'), body: (await res.json()) as unknown };
}

describe('Pribe Welle 2 end-to-end (echter Server, Beamer + Fernbedienung + 5 Handys)', () => {
  it('Login-Sperre, Fernbedienung, Du präsentierst, Vortrags-Sterne, Combo, Probelauf und Reset-Wege', { timeout: 120_000 }, async () => {
    await server.start();
    const base = server.base;

    // ---- R87: 5 failures per IP lock the login, even for the right password; other IPs are unaffected ----
    const attacker = '203.0.113.66';
    for (let i = 1; i < 5; i++) expect((await adminLogin(base, 'falsch', attacker)).status).toBe(401);
    const locked = await adminLogin(base, 'falsch', attacker);
    expect(locked.status).toBe(429);
    expect(locked.body).toMatchObject({ error: 'LOGIN_LOCKED' });
    expect(Number(locked.retryAfter)).toBeGreaterThan(14 * 60);
    const stillLocked = await adminLogin(base, ADMIN_PASSWORD, attacker);
    expect(stillLocked.status).toBe(429);
    expect(stillLocked.cookie).toBe('');

    const beamerLogin = await adminLogin(base, ADMIN_PASSWORD, '198.51.100.10');
    expect(beamerLogin.status).toBe(200);
    const admin = beamerLogin.cookie;
    // The remote is a second device with its own admin session (R80, D30).
    const remoteLogin = await adminLogin(base, ADMIN_PASSWORD, '198.51.100.11');
    expect(remoteLogin.status).toBe(200);
    expect(remoteLogin.cookie).not.toBe(admin);

    expect(
      (
        await api(base, 'PUT', API_PATHS.admin.settings, {
          cookie: admin,
          json: { inviteCode: INVITE, submissionDeadline: Date.now() + 3_600_000, voteCountdownS: COUNTDOWN_S, talkTimeLimitS: TALK_LIMIT_S },
        })
      ).status,
    ).toBe(200);

    // ---- Persons, topics, photo, submissions ----
    const persons: Person[] = [];
    const cookies: string[] = [];
    for (const p of PEOPLE) {
      const reg = await api<PersonMeDto>(base, 'POST', API_PATHS.person.register, {
        json: { ...p, inviteCode: INVITE, password: 'geheim1' },
      });
      expect(reg.status).toBe(201);
      persons.push(reg.body.person!);
      cookies.push(cookiesOf(reg.res));
    }
    const topicOf = async (i: number) =>
      (await api<TopicResponseDto>(base, 'GET', API_PATHS.submit.topic, { cookie: cookies[i] })).body.topic?.index ?? null;
    for (const c of cookies) expect((await api(base, 'POST', API_PATHS.submit.topicSpin, { cookie: c })).status).toBe(200);
    const topicsBefore = await Promise.all(persons.map((_, i) => topicOf(i)));
    expect(topicsBefore.every((t) => t !== null)).toBe(true);

    const photoForm = new FormData();
    photoForm.append('photo', new Blob([PNG], { type: 'image/png' }), 'selfie.png');
    expect((await api(base, 'PUT', API_PATHS.person.photo, { cookie: cookies[0], form: photoForm })).status).toBe(200);

    for (const i of SUBMITTERS) {
      const form = new FormData();
      form.append('file', new Blob([html(`Vortrag ${i}`)]), `vortrag-${i}.html`);
      const res = await api<SubmissionStatusDto>(base, 'POST', API_PATHS.submit.upload, { cookie: cookies[i], form });
      expect(res.status).toBe(201);
    }

    const realData = async () => ({
      persons: (await api<AdminPersonDto[]>(base, 'GET', API_PATHS.admin.persons, { cookie: admin })).body.map((p) => p.id).sort(),
      submissions: (await api<SubmissionOverviewDto>(base, 'GET', API_PATHS.admin.submissions, { cookie: admin })).body.items
        .map((s) => s.id)
        .sort(),
      topics: await Promise.all(persons.map((_, i) => topicOf(i))),
    });

    // ---- Beamer, remote and 5 phones ----
    const combos: ComboEvent[] = [];
    const beamer = await openSocket(base, SOCKET_NAMESPACES.host, admin);
    beamer.on('reaction:combo', (e: ComboEvent) => combos.push(e));
    const beamerStates: HostSnapshot[] = [];
    beamer.on('state', (s: HostSnapshot) => beamerStates.push(s));
    const remote = await openSocket(base, SOCKET_NAMESPACES.host, remoteLogin.cookie);

    const phones: Socket[] = [];
    for (const c of cookies) phones.push(await openSocket(base, SOCKET_NAMESPACES.vote, c));
    const beamerState = () => request<HostSnapshot>(beamer, 'state:request');
    const phoneState = (i: number) => request<VoteSnapshot>(phones[i]!, 'state:request');
    await until(async () => (await beamerState()).connectedPersonIds.length === 5, 'all phones in the lobby');

    /**
     * The beamer follows every step the remote takes: waits for the first pushed state that
     * matches and drops it and everything before, so the next step cannot match an old state.
     */
    const beamerReaches = (pred: (s: HostSnapshot) => boolean, what: string) =>
      until(async () => {
        const i = beamerStates.findIndex(pred);
        return i >= 0 && beamerStates.splice(0, i + 1).at(-1)!;
      }, what);

    const flaggedPhones = async () => {
      const flagged: number[] = [];
      for (let i = 0; i < phones.length; i++) if (presentingState(await phoneState(i))) flagged.push(i);
      return flagged;
    };

    /** A full round driven only from the remote. `talk[i]` is phone i's talk rating; the presenter's own is refused. */
    const playRound = async (presenter: number, talk: number[], duringTalk?: () => Promise<void>) => {
      expect(await call(remote, 'round:draw', { presenterId: persons[presenter]!.id })).toEqual({ ok: true });
      await beamerReaches((s) => s.phase === 'drawing' && s.round?.presenterId === persons[presenter]!.id, 'beamer draws');

      // R82: only the presenter's phone is flagged, from the draw on.
      expect(await flaggedPhones()).toEqual([presenter]);
      expect(await call(remote, 'round:start')).toEqual({ ok: true });
      await beamerReaches((s) => s.phase === 'presenting', 'beamer presents');
      expect(await flaggedPhones()).toEqual([presenter]);
      const flag = presentingState(await phoneState(presenter))!;
      expect(flag.started).toBe(true);
      expect(flag.timeLimitEndsAt).toBe((await beamerState()).round!.timeLimitEndsAt);

      const roundId = (await beamerState()).round!.id;
      for (const [i, p] of phones.entries()) {
        const ack = await call(p, 'vote:cast', { roundId, stars: 4, talkStars: talk[i] });
        if (i === presenter) {
          expect(ack).toMatchObject({ ok: false, error: 'CANNOT_RATE_SELF' });
          expect(await call(p, 'vote:cast', { roundId, stars: 4 })).toMatchObject({ ok: true, data: { talkStars: null } });
        } else {
          expect(ack).toMatchObject({ ok: true, data: { talkStars: talk[i] } });
        }
      }

      await duringTalk?.();
      expect(await call(remote, 'round:close')).toEqual({ ok: true });
      await beamerReaches((s) => s.phase === 'countdown', 'beamer counts down');
      expect(await flaggedPhones()).toEqual([]);
      const revealed = await beamerReaches((s) => s.phase === 'reveal', 'beamer reveals');
      return revealed.reveal!;
    };

    // ---- R80: the remote starts the game ----
    expect(await call(remote, 'game:start')).toEqual({ ok: true });
    await beamerReaches((s) => s.phase === 'choosePresenter', 'beamer leaves the lobby');

    // ---- Round 1 with an emoji combo (R85) ----
    const r1Talk = [3, 3, 3, 5, 3]; // phone 3 presents; its own 5 must not count
    const reveal1 = await playRound(3, r1Talk, async () => {
      // Different emojis never add up to a combo …
      for (const [i, emoji] of ['😂', '👏', '🍅', '😂'].entries()) {
        expect(await call(phones[i]!, 'reaction:send', { emoji })).toEqual({ ok: true });
      }
      // … but one 🔥 from each of the 5 phones crosses the threshold.
      for (const p of phones.slice(0, COMBO_THRESHOLD)) expect(await call(p, 'reaction:send', { emoji: '🔥' })).toEqual({ ok: true });
      const combo = await until(async () => combos.at(-1), 'combo on the beamer');
      expect(combos).toHaveLength(1);
      expect(combo).toMatchObject({ emoji: '🔥', count: COMBO_THRESHOLD });
    });
    expect(reveal1.presenterId).toBe(persons[3]!.id);
    expect(reveal1.avgTalkStars).toBe(3);
    expect(reveal1.talkRatingCount).toBe(4);
    const combosSoFar = combos.length;

    // ---- R83: test run in the middle of the game leaves the real data untouched ----
    const before = await realData();
    const realState = await beamerState();
    expect((await api<ProbeStatusDto>(base, 'POST', API_PATHS.admin.probeStart, { cookie: admin })).body).toEqual({ active: true });
    const probeState = await until(async () => {
      const s = await beamerState();
      return s.probe && s;
    }, 'beamer in the test run');
    expect(probeState.phase).toBe('lobby');
    expect(probeState.persons.map((p) => p.id)).not.toEqual(expect.arrayContaining([persons[0]!.id]));
    expect(existsSync(path.join(dataDir, 'probelauf', 'pribe.sqlite'))).toBe(true);
    expect((await phoneState(0)).probe).toBe(true);
    // Resets refuse to run against the bots.
    expect((await api(base, 'POST', API_PATHS.admin.reset, { cookie: admin })).status).toBe(409);
    // The remote drives the test game like a real one.
    await until(async () => (await beamerState()).connectedPersonIds.length >= 2, 'bots in the lobby', 20_000);
    expect(await call(remote, 'game:start')).toEqual({ ok: true });
    expect(await request<{ presenterId: string }>(remote, 'presenter:spin')).toHaveProperty('presenterId');

    expect((await api<ProbeStatusDto>(base, 'POST', API_PATHS.admin.probeStop, { cookie: admin })).body).toEqual({ active: false });
    const back = await until(async () => {
      const s = await beamerState();
      return !s.probe && s;
    }, 'beamer back in the real game');
    expect(back.phase).toBe('reveal');
    expect(back.roundCount).toBe(realState.roundCount);
    expect(back.reveal).toEqual(reveal1);
    expect(back.persons).toEqual(realState.persons);
    expect(await realData()).toEqual(before);
    expect(existsSync(path.join(dataDir, 'probelauf'))).toBe(false);
    expect((await phoneState(0)).probe).toBe(false);
    expect(combos.length).toBe(combosSoFar);

    // ---- Round 2 and the finale from the remote (R80, R84) ----
    expect(await call(remote, 'round:next')).toEqual({ ok: true });
    const reveal2 = await playRound(4, [5, 5, 5, 5, 1]); // phone 4 presents and rates itself 1
    expect(reveal2.avgTalkStars).toBe(5);
    expect(reveal2.talkRatingCount).toBe(4);

    expect(await call(remote, 'finale:start')).toEqual({ ok: true });
    const finale = (await beamerReaches((s) => s.phase === 'finale', 'beamer in the finale')).finale!;
    expect(finale.awards.find((a) => a.kind === 'rampensau')).toEqual({ kind: 'rampensau', winners: [persons[4]!.id], value: 5 });
    expect(await call(remote, 'finale:step', { step: 3 })).toEqual({ ok: true });
    await beamerReaches((s) => s.finaleStep === 3, 'beamer follows the remote station');
    expect((await phoneState(0)).finale).toEqual(finale);

    // ---- R88: the three resets ----
    const gameReset = await api<ResetResponseDto>(base, 'POST', API_PATHS.admin.reset, { cookie: admin });
    expect(gameReset.body).toEqual({ rounds: 2, topics: 0, submissions: 0, persons: 0 });
    const fresh = await beamerReaches((s) => s.phase === 'lobby', 'beamer back in the lobby');
    expect(fresh.roundCount).toBe(0);
    expect(fresh.poolSize).toBe(SUBMITTERS.length);
    expect(fresh.presentedPersonIds).toEqual([]);
    expect(await realData()).toEqual(before);

    const topicReset = await api<ResetResponseDto>(base, 'POST', API_PATHS.admin.resetTopics, { cookie: admin });
    expect(topicReset.body).toEqual({ rounds: 0, topics: PEOPLE.length, submissions: 0, persons: 0 });
    expect((await realData()).topics).toEqual(PEOPLE.map(() => null));
    expect((await realData()).persons).toEqual(before.persons);

    expect((await api(base, 'POST', API_PATHS.admin.resetAll, { cookie: admin, json: { confirm: 'löschen?' } })).status).toBe(400);
    expect((await realData()).persons).toEqual(before.persons);
    const wipe = await api<ResetResponseDto>(base, 'POST', API_PATHS.admin.resetAll, {
      cookie: admin,
      json: { confirm: RESET_ALL_CONFIRMATION },
    });
    expect(wipe.body).toEqual({ rounds: 0, topics: 0, submissions: SUBMITTERS.length, persons: PEOPLE.length });
    const empty = await realData();
    expect(empty.persons).toEqual([]);
    expect(empty.submissions).toEqual([]);
    expect(readdirSync(path.join(dataDir, 'files'))).toEqual([]);
    expect(readdirSync(path.join(dataDir, 'avatars'))).toEqual([]);
    // Settings survive "Alles löschen" (D30).
    const settings = await api<AdminSettingsDto>(base, 'GET', API_PATHS.admin.settings, { cookie: admin });
    expect(settings.body).toMatchObject({ inviteCode: INVITE, talkTimeLimitS: TALK_LIMIT_S });
    await beamerReaches((s) => s.persons.length === 0, 'beamer without persons');

    expect((await adminLogin(base, ADMIN_PASSWORD, attacker)).status).toBe(429);

    beamer.close();
    remote.close();
    for (const p of phones) p.close();
  });
});
