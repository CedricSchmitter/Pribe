import { createHmac } from 'node:crypto';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import type { Socket } from 'socket.io-client';
import { afterAll, describe, expect, it } from 'vitest';
import {
  API_PATHS,
  SOCKET_NAMESPACES,
  type Award,
  type FinaleResult,
  type HostSnapshot,
  type Person,
  type PersonMeDto,
  type ReactionEvent,
  type RevealResult,
  type SubmissionStatusDto,
  type TopicResponseDto,
  type VoteSnapshot,
  type WheelSpunEvent,
} from '@pribe/shared';
import { api, call, cookiesOf, freePort, openSocket, request, ServerProcess, until } from './server';

/*
 * Whole evening against the real server process (R4, R22, R40–R47, R50–R55, R60–R65,
 * D05, D07, D08, D16, D17): 5 phones, 4 submitted presentations (2 HTML, 2 PPTX), one
 * person without a submission, a forced dead end, a hard restart mid-countdown, finale.
 */

const PORT = await freePort();
const ADMIN_PASSWORD = 'e2e-admin-pw';
const SECRET = 'e2e-secret-0123456789abcdef';
const INVITE = 'PARTY-42';
const COUNTDOWN_S = 2;
const TALK_LIMIT_S = 60;

const dataDir = mkdtempSync(path.join(tmpdir(), 'pribe-e2e-'));
const server = new ServerProcess(PORT, {
  ADMIN_PASSWORD,
  PRIBE_SECRET: SECRET,
  PUBLIC_URL: `http://localhost:${PORT}`,
  DATA_DIR: dataDir,
  LOG_LEVEL: 'info',
});

afterAll(async () => {
  await server.kill();
  rmSync(dataDir, { recursive: true, force: true });
});

// Distinctive names and file names, so a leak shows up in any log, row or header.
const PEOPLE = [
  { name: 'Annegret Zwiebelfisch', emoji: '🦊', color: '#ff6633', file: 'annegret-geheimvortrag.html', kind: 'html' },
  { name: 'Bartholomae Quarkspeise', emoji: '🐙', color: '#3366ff', file: 'bartholomae-folien-final-v3.pptx', kind: 'pptx' },
  { name: 'Cosima Kartoffelpuffer', emoji: '🦄', color: '#cc33ff', file: 'cosima-meisterwerk.htm', kind: 'html' },
  { name: 'Dragomir Pfannkuchen', emoji: '🐸', color: '#33cc66', file: 'dragomir-praesentation.pptx', kind: 'pptx' },
  { name: 'Eleonore Ohnefolien', emoji: '🐼', color: '#888888', file: null, kind: null },
] as const;
const ORIGINAL_FILES = [...PEOPLE.map((p) => p.file).filter((f): f is NonNullable<typeof f> => !!f), 'cosima-erster-entwurf.html'];

const ownerHashOf = (personId: string) => createHmac('sha256', SECRET).update(personId, 'utf8').digest('hex');

const html = (title: string) =>
  `<!doctype html><html><head><title>${title}</title></head><body><h1>${title}</h1>` +
  `<script>document.addEventListener('keydown', () => {});</script></body></html>`;

/** A minimal OOXML package with author metadata, like PowerPoint writes it. */
function pptxWithAuthor(author: string): Uint8Array {
  return zipSync({
    '[Content_Types].xml': strToU8(
      '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"></Types>',
    ),
    'docProps/core.xml': strToU8(
      '<?xml version="1.0"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" ' +
        'xmlns:dc="http://purl.org/dc/elements/1.1/">' +
        `<dc:title>Vortrag</dc:title><dc:creator>${author}</dc:creator><cp:lastModifiedBy>${author}</cp:lastModifiedBy>` +
        '</cp:coreProperties>',
    ),
    'docProps/app.xml': strToU8(
      `<?xml version="1.0"?><Properties><Company>Firma von ${author}</Company><Manager>Chef von ${author}</Manager></Properties>`,
    ),
    'ppt/presentation.xml': strToU8('<?xml version="1.0"?><p:presentation/>'),
  });
}

/** 1×1 PNG. */
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

interface Phone {
  idx: number;
  person: Person;
  cookie: string;
  socket: Socket;
  /** Every event the phone received over all its sockets, in order. */
  events: { event: string; payload: unknown }[];
}

interface CastPlan {
  guessPersonId?: string | null;
  stars?: number | null;
}

describe('Pribe-Abend end-to-end (echter Server, Host + 5 Handys)', () => {
  it('spielt den ganzen Abend inkl. Sackgasse, Neustart und Finale', { timeout: 180_000 }, async () => {
    await server.start();
    const base = server.base;

    // ---- Admin: login, settings, two persons created by the admin ----
    expect((await api(base, 'POST', API_PATHS.auth.login, { json: { password: 'falsch' } })).status).toBe(401);
    const login = await api(base, 'POST', API_PATHS.auth.login, { json: { password: ADMIN_PASSWORD } });
    expect(login.status).toBe(200);
    const admin = cookiesOf(login.res);
    expect((await api(base, 'GET', API_PATHS.admin.settings)).status).toBe(401);

    const settings = await api(base, 'PUT', API_PATHS.admin.settings, {
      cookie: admin,
      json: {
        inviteCode: INVITE,
        submissionDeadline: Date.now() + 3_600_000,
        voteCountdownS: COUNTDOWN_S,
        talkTimeLimitS: TALK_LIMIT_S,
      },
    });
    expect(settings.status).toBe(200);

    const persons: Person[] = [];
    const cookies: string[] = [];
    for (const p of PEOPLE.slice(0, 2)) {
      const created = await api<Person>(base, 'POST', API_PATHS.admin.persons, {
        cookie: admin,
        json: { name: p.name, emoji: p.emoji, color: p.color },
      });
      expect(created.status).toBe(201);
      const set = await api<PersonMeDto>(base, 'POST', API_PATHS.person.setPassword, {
        json: { personId: created.body.id, password: 'geheim1' },
      });
      expect(set.status).toBe(200);
      persons.push(created.body);
      cookies.push(cookiesOf(set.res));
    }

    // ---- Self-registration with the invite code (D27) ----
    const wrongCode = await api(base, 'POST', API_PATHS.person.register, {
      json: { name: 'Eindringling', emoji: '👻', color: '#000000', inviteCode: 'falsch', password: 'geheim1' },
    });
    expect(wrongCode.status).toBe(403);
    for (const p of PEOPLE.slice(2)) {
      const reg = await api<PersonMeDto>(base, 'POST', API_PATHS.person.register, {
        json: { name: p.name, emoji: p.emoji, color: p.color, inviteCode: INVITE.toLowerCase(), password: 'geheim1' },
      });
      expect(reg.status).toBe(201);
      persons.push(reg.body.person!);
      cookies.push(cookiesOf(reg.res));
    }
    const nameOf = (id: string) => persons.find((p) => p.id === id)!.name;
    const idxOf = (id: string) => persons.findIndex((p) => p.id === id);

    // Photo avatar for one person (D27).
    const photoForm = new FormData();
    photoForm.append('photo', new Blob([PNG], { type: 'image/png' }), 'cosima-selfie.png');
    const photo = await api<PersonMeDto>(base, 'PUT', API_PATHS.person.photo, { cookie: cookies[2], form: photoForm });
    expect(photo.status).toBe(200);
    expect(photo.body.person!.photoUrl).toMatch(/^\/api\/avatars\/[0-9a-f-]{36}\.png$/);
    persons[2] = photo.body.person!;
    expect((await api(base, 'GET', photo.body.person!.photoUrl!)).status).toBe(200);

    // ---- Topic roulette (D26): everyone gets a different topic, and keeps it ----
    const topics: (number | null)[] = [];
    for (const c of cookies) {
      const t = await api<TopicResponseDto>(base, 'POST', API_PATHS.submit.topicSpin, { cookie: c });
      expect(t.status).toBe(200);
      topics.push(t.body.topic!.index);
      const again = await api<TopicResponseDto>(base, 'POST', API_PATHS.submit.topicSpin, { cookie: c });
      expect(again.body.topic!.index).toBe(t.body.topic!.index);
    }
    expect(new Set(topics).size).toBe(topics.length);

    // ---- Uploads: HTML and PPTX, a replaced upload, original names dropped (R20–R24) ----
    const upload = async (i: number, fileName: string, data: Uint8Array | string) => {
      const form = new FormData();
      form.append('file', new Blob([typeof data === 'string' ? data : Buffer.from(data)]), fileName);
      return api<SubmissionStatusDto>(base, 'POST', API_PATHS.submit.upload, { cookie: cookies[i], form });
    };
    expect((await upload(0, 'x.html', 'kein html')).status).toBe(415);
    expect((await upload(0, 'x.pdf', '%PDF-1.4')).status).toBe(415);

    const first = await upload(2, 'cosima-erster-entwurf.html', html('Entwurf'));
    expect(first.status).toBe(201);
    const submissionOf = new Map<number, string>();
    for (const [i, p] of PEOPLE.entries()) {
      if (!p.file) continue;
      const res = await upload(i, p.file, p.kind === 'html' ? html(`Vortrag ${i}`) : pptxWithAuthor(p.name));
      expect(res.status).toBe(201);
      expect(res.body.kind).toBe(p.kind);
      expect(res.body.status).toBe(p.kind === 'html' ? 'ready' : 'converting');
      submissionOf.set(i, res.body.submissionId);
    }
    // Re-upload replaced Cosima's first draft (D09).
    expect(submissionOf.get(2)).not.toBe(first.body.submissionId);
    expect((await api(base, 'GET', API_PATHS.submit.submission(first.body.submissionId))).status).toBe(404);

    for (const id of submissionOf.values()) {
      await until(
        async () => (await api<SubmissionStatusDto>(base, 'GET', API_PATHS.submit.submission(id))).body.status === 'ready',
        `submission ${id} ready`,
      );
    }
    const mine = await api<SubmissionStatusDto>(base, 'GET', API_PATHS.submit.mine, { cookie: cookies[1] });
    expect(mine.body.submissionId).toBe(submissionOf.get(1));
    expect((await api(base, 'GET', API_PATHS.submit.mine, { cookie: cookies[4] })).status).toBe(404);
    const status = await api<{ submissionCount: number; uploadsOpen: boolean }>(base, 'GET', API_PATHS.submit.status);
    expect(status.body).toMatchObject({ submissionCount: 4, uploadsOpen: true });

    const ownerIdxOfSubmission = (id: string) => [...submissionOf].find(([, s]) => s === id)![0];

    // Admin overview without owners (R13).
    const overview = await api<{ total: number }>(base, 'GET', API_PATHS.admin.submissions, { cookie: admin });
    expect(overview.body.total).toBe(4);
    expectNoIdentity(JSON.stringify(overview.body), persons);

    // ---- Files: PPTX metadata cleared, download name unrelated to the owner (D23) ----
    for (const i of [1, 3]) {
      const id = submissionOf.get(i)!;
      expect((await api(base, 'GET', API_PATHS.file(id))).status).toBe(401);
      const res = await fetch(`${base}${API_PATHS.file(id)}`, { headers: { cookie: admin } });
      expect(res.status).toBe(200);
      const disposition = res.headers.get('content-disposition') ?? '';
      const fileName = /filename="([^"]+)"/.exec(disposition)?.[1];
      expect(fileName).toMatch(/^[0-9a-f]{16}\.pptx$/);
      for (const p of persons) {
        expect(fileName).not.toContain(ownerHashOf(p.id).slice(0, 16));
        expect(disposition).not.toContain(p.id);
      }
      expectNoIdentity(disposition, persons);
      const entries = unzipSync(new Uint8Array(await res.arrayBuffer()));
      const core = strFromU8(entries['docProps/core.xml']!);
      const app = strFromU8(entries['docProps/app.xml']!);
      expect(core).toContain('<dc:creator></dc:creator>');
      expect(core).toContain('<cp:lastModifiedBy></cp:lastModifiedBy>');
      expect(core).toContain('<dc:title>Vortrag</dc:title>');
      expect(app).toContain('<Company></Company>');
      expect(core + app).not.toContain(PEOPLE[i]!.name);
    }
    const htmlFile = await fetch(`${base}${API_PATHS.file(submissionOf.get(0)!)}`, { headers: { cookie: admin } });
    expect(htmlFile.headers.get('content-security-policy')).toBe('sandbox allow-scripts');
    expect(htmlFile.headers.get('content-disposition')).toBeNull();

    // ---- Lobby: host + 5 phones (R40, R50) ----
    const reactions: ReactionEvent[] = [];
    const wheelEvents: WheelSpunEvent[] = [];
    const connectHost = async () => {
      const s = await openSocket(base, SOCKET_NAMESPACES.host, admin);
      s.on('reaction', (e: ReactionEvent) => reactions.push(e));
      s.on('wheel:spun', (e: WheelSpunEvent) => wheelEvents.push(e));
      return s;
    };
    await expect(openSocket(base, SOCKET_NAMESPACES.host, '')).rejects.toThrow();
    let host = await connectHost();

    const phones: Phone[] = [];
    const connectPhone = async (phone: Omit<Phone, 'socket'> & { socket?: Socket }) => {
      const s = await openSocket(base, SOCKET_NAMESPACES.vote, phone.cookie);
      s.onAny((event: string, payload: unknown) => phone.events.push({ event, payload }));
      phone.socket = s;
    };
    for (const [idx, person] of persons.entries()) {
      const phone = { idx, person, cookie: cookies[idx]!, events: [] } as unknown as Phone;
      await connectPhone(phone);
      phones.push(phone);
    }
    const hostState = () => request<HostSnapshot>(host, 'state:request');
    const lobby = await until(async () => {
      const s = await hostState();
      return s.connectedPersonIds.length === 5 && s;
    }, 'all phones in the lobby');
    expect(lobby.phase).toBe('lobby');
    expect(lobby.connectedPersonIds.sort()).toEqual(persons.map((p) => p.id).sort());
    const phoneState = await request<VoteSnapshot>(phones[0]!.socket, 'state:request');
    expect(phoneState.me).toBe(persons[0]!.id);
    // A phone cannot pose as somebody else (D25).
    expect(await call(phones[0]!.socket, 'vote:identify', { personId: persons[1]!.id })).toMatchObject({ ok: false });

    const info = await api<{ voteUrl: string; registrationOpen: boolean }>(base, 'GET', API_PATHS.hostInfo, { cookie: admin });
    expect(info.body).toEqual({ voteUrl: `http://localhost:${PORT}/vote?code=${INVITE}`, registrationOpen: true });

    expect(await call(phones[0]!.socket, 'reaction:send', { emoji: '🔥' })).toMatchObject({ ok: false, error: 'WRONG_PHASE' });

    // ---- Game start closes uploads (D16) ----
    expect(await call(host, 'game:start')).toEqual({ ok: true });
    const late = await upload(4, 'eleonore-zu-spaet.html', html('Zu spät'));
    expect(late.status).toBe(403);
    expect((late.body as { error: string }).error).toBe('UPLOADS_CLOSED');

    // ---- Rounds ----
    const finalVotes = new Map<number, Map<number, CastPlan>>(); // roundId -> phone idx -> merged vote
    const roundOwner = new Map<number, number>(); // roundId -> owner idx
    const roundPresenter = new Map<number, number>();
    const reveals: RevealResult[] = [];

    const wrongFor = (i: number, owner: number) => [0, 1, 2, 3, 4].find((j) => j !== owner && j !== i)!;
    /** Two casts per phone and round, so every phone gets the same number of events. */
    const plan = (n: number, i: number, owner: number): [CastPlan, CastPlan] => {
      const id = (j: number) => persons[j]!.id;
      if (i === owner) return [{ guessPersonId: id(i), stars: 1 }, { guessPersonId: id(i) }]; // dummy guess on itself
      const stars = n + 1;
      switch (i) {
        case 0:
          return [{ guessPersonId: id(wrongFor(i, owner)), stars }, { guessPersonId: id(owner) }]; // changes to right
        case 1:
          return n <= 2 ? [{ guessPersonId: id(owner), stars }, { stars }] : [{ guessPersonId: id(wrongFor(i, owner)), stars }, { stars }];
        case 2:
          return [{ guessPersonId: id(owner), stars }, { guessPersonId: id(wrongFor(i, owner)) }]; // changes to wrong
        case 3:
          return n === 3 ? [{ guessPersonId: id(owner), stars }, { stars }] : [{ guessPersonId: id(wrongFor(i, owner)), stars }, { stars }];
        default:
          return n === 1 ? [{ stars }, { stars }] : [{ guessPersonId: id(wrongFor(i, owner)), stars }, { stars }];
      }
    };

    const reconnectAll = async () => {
      host = await connectHost();
      for (const p of phones) await connectPhone(p);
    };

    const playRound = async (n: number, opts: { restartInCountdown?: boolean } = {}) => {
      const drawn = await hostState();
      expect(drawn.phase).toBe('drawing');
      const round = drawn.round!;
      expect(round.number).toBe(n);
      expect(round.startedAt).toBeNull();
      const owner = ownerIdxOfSubmission(round.submission.id);
      const presenter = idxOf(round.presenterId);
      expect(owner).not.toBe(presenter); // never the own presentation (R43)
      expect(round.submission.kind).toBe(PEOPLE[owner]!.kind);
      expect(round.submission.url).toBe(API_PATHS.file(round.submission.id));
      roundOwner.set(round.id, owner);
      roundPresenter.set(round.id, presenter);

      expect(await call(host, 'round:start')).toEqual({ ok: true });
      const presenting = await hostState();
      expect(presenting.phase).toBe('presenting');
      expect(presenting.round!.timeLimitEndsAt).toBe(presenting.round!.startedAt! + TALK_LIMIT_S * 1000);

      const merged = new Map<number, CastPlan>();
      finalVotes.set(round.id, merged);
      const cast = async (step: 0 | 1) => {
        for (const p of phones) {
          const payload = plan(n, p.idx, owner)[step];
          const ack = await call<{ roundId: number }>(p.socket, 'vote:cast', { roundId: round.id, ...payload });
          expect(ack).toMatchObject({ ok: true, data: { roundId: round.id } });
          merged.set(p.idx, { ...merged.get(p.idx), ...payload });
        }
      };
      await cast(0);
      expect((await hostState()).round!.votedPersonIds.sort()).toEqual(persons.map((p) => p.id).sort());

      // Live reaction (R46, R53).
      const before = reactions.length;
      expect(await call(phones[n % 5]!.socket, 'reaction:send', { emoji: '😂' })).toEqual({ ok: true });
      await until(async () => reactions.length > before, 'reaction on the host');
      expect(reactions.at(-1)).toMatchObject({ emoji: '😂', personId: persons[n % 5]!.id });

      expect(await call(host, 'round:close')).toEqual({ ok: true });
      const countdown = await hostState();
      expect(countdown.phase).toBe('countdown');
      expect(countdown.round!.countdownEndsAt).toBe(countdown.round!.closedAt! + COUNTDOWN_S * 1000);
      await cast(1); // votes may still change during the countdown (R51)

      if (opts.restartInCountdown) {
        await server.kill();
        await server.start();
        await reconnectAll();
      }

      const revealed = await until(async () => {
        const s = await hostState();
        return s.phase === 'reveal' && s;
      }, `reveal of round ${n}`);
      const reveal = revealed.reveal!;
      reveals.push(reveal);

      // Expected reveal from our own bookkeeping (R47, R60, D07, D16).
      const counting = [...merged].filter(([i]) => i !== owner);
      const tally = new Map<string, number>();
      for (const [, v] of counting) if (v.guessPersonId) tally.set(v.guessPersonId, (tally.get(v.guessPersonId) ?? 0) + 1);
      expect(reveal.ownerId).toBe(persons[owner]!.id);
      expect(reveal.presenterId).toBe(persons[presenter]!.id);
      expect(Object.fromEntries(reveal.tally.map((t) => [t.personId, t.count]))).toEqual(Object.fromEntries(tally));
      expect(reveal.correctVoterIds.sort()).toEqual(
        counting.filter(([, v]) => v.guessPersonId === persons[owner]!.id).map(([i]) => persons[i]!.id).sort(),
      );
      expect(reveal.avgStars).toBe(n + 1); // the owner's 1 star does not count
      expect(reveal.ratingCount).toBe(4);

      for (const p of phones) {
        const s = await request<VoteSnapshot>(p.socket, 'state:request');
        const v = merged.get(p.idx)!;
        const expected =
          p.idx === owner ? 'owner' : !v.guessPersonId ? 'noGuess' : v.guessPersonId === persons[owner]!.id ? 'correct' : 'wrong';
        expect(s.phase).toBe('reveal');
        expect(s.myOutcome).toBe(expected); // drives green/red + vibration (R54)
        expect(s.reveal).toEqual(reveal);
      }
      expect(await call(p0(), 'vote:cast', { roundId: round.id, stars: 5 })).toMatchObject({ ok: false, error: 'VOTING_CLOSED' });
      return { owner, presenter };
    };
    const p0 = () => phones[0]!.socket;

    // Round 1: manual draw for the person without a submission (R43).
    expect(await call(host, 'round:draw', { presenterId: persons[4]!.id })).toEqual({ ok: true });
    const r1 = await playRound(1);
    expect(r1.presenter).toBe(4);

    // Round 2: the revealed owner presents next; the server restarts mid-countdown (R4).
    expect(await call(host, 'round:next')).toEqual({ ok: true });
    expect(await call(host, 'round:draw', { presenterId: persons[4]!.id })).toMatchObject({ ok: false, error: 'ALREADY_PRESENTED' });
    expect(await call(host, 'round:draw', { presenterId: persons[r1.owner]!.id })).toEqual({ ok: true });
    const r2 = await playRound(2, { restartInCountdown: true });

    // Round 3.
    expect(await call(host, 'round:next')).toEqual({ ok: true });
    expect(await call(host, 'round:draw', { presenterId: persons[r2.owner]!.id })).toEqual({ ok: true });
    await playRound(3);

    // Dead end (D17): only the last presentation's owner chooses → "Jemand anderes muss ziehen".
    expect(await call(host, 'round:next')).toEqual({ ok: true });
    const shownOwners = new Set(roundOwner.values());
    const lastOwner = [...submissionOf.keys()].find((i) => !shownOwners.has(i))!;
    const stuck = await call(host, 'round:draw', { presenterId: persons[lastOwner]!.id });
    expect(stuck).toEqual({ ok: false, error: 'ONLY_OWN_LEFT', message: 'Jemand anderes muss ziehen.' });
    expect((await hostState()).phase).toBe('choosePresenter');

    // Round 4: the wheel resolves it (R42).
    const spun = await request<WheelSpunEvent>(host, 'presenter:spin');
    expect(spun.presenterId).not.toBe(persons[lastOwner]!.id);
    expect(spun.candidateIds).not.toContain(persons[lastOwner]!.id);
    await until(async () => wheelEvents.length > 0, 'wheel event');
    expect(wheelEvents.at(-1)).toEqual(spun);
    expect(await call(host, 'round:draw', { presenterId: spun.presenterId })).toEqual({ ok: true });
    const r4 = await playRound(4);
    expect(r4.owner).toBe(lastOwner);

    // Pool empty: the wheel has nothing left; the finale starts.
    expect(await call(host, 'round:next')).toEqual({ ok: true });
    expect((await hostState()).poolSize).toBe(0);
    expect(await call(host, 'presenter:spin')).toMatchObject({ ok: false, error: 'NO_SUBMISSIONS_LEFT' });
    expect(await call(host, 'finale:start')).toEqual({ ok: true });

    // ---- Finale (R62–R65, D08, D28) ----
    const finale = (await hostState()).finale!;
    const expected = expectedFinale(persons, finalVotes, roundOwner);
    expect(Object.fromEntries(finale.leaderboard.map((e) => [e.personId, e.points]))).toEqual(expected.points);
    expect(finale.leaderboard.map((e) => e.points)).toEqual([...finale.leaderboard.map((e) => e.points)].sort((a, b) => b - a));
    expect(finale.leaderboard[0]!.rank).toBe(1);
    const sortAward = (a: Award) => ({ ...a, winners: [...a.winners].sort() });
    expect(finale.awards.map(sortAward)).toEqual(expected.awards.map(sortAward));
    expect(sortEdges(finale.guessNetwork)).toEqual(sortEdges(expected.network));
    const lastRoundId = [...roundOwner.keys()].at(-1)!;
    expect(finale.bestPresentations).toEqual([
      {
        roundId: lastRoundId,
        ownerId: persons[r4.owner]!.id,
        presenterId: persons[r4.presenter]!.id,
        avgStars: 5,
        ratingCount: 4,
      },
    ]);
    for (const p of phones) {
      const s = await request<VoteSnapshot>(p.socket, 'state:request');
      expect(s.phase).toBe('finale');
      expect(s.finale).toEqual(finale);
    }

    // ---- Anonymity on the phones before every reveal (R22, R52, D07) ----
    const hashes = persons.map((p) => ownerHashOf(p.id));
    const submissionIds = [...submissionOf.values()];
    for (const p of phones) {
      expect(new Set(p.events.map((e) => e.event))).toEqual(new Set(['state']));
      for (const { payload } of p.events) {
        const s = payload as VoteSnapshot;
        if (s.phase === 'reveal' || s.phase === 'finale') continue;
        expect(s.reveal).toBeNull();
        expect(s.myOutcome).toBeNull();
        expect(s.finale).toBeNull();
        const json = JSON.stringify(s);
        for (const h of hashes) expect(json).not.toContain(h);
        for (const id of submissionIds) expect(json).not.toContain(id);
        if (s.round) {
          expect(Object.keys(s.round)).not.toContain('submission');
          const owner = persons[roundOwner.get(s.round.id)!]!;
          // Strip what legitimately names people (person list, presenters, own identity and guess).
          const { persons: _p, presentedPersonIds: _pp, me: _me, myVote: _mv, ...rest } = s;
          const stripped = JSON.stringify({ ...rest, round: { ...s.round, presenterId: null } });
          expect(stripped).not.toContain(owner.id);
          expect(stripped).not.toContain(owner.name);
        }
      }
    }
    // The owner's phone saw exactly what everyone else saw (apart from its own identity and vote).
    const neutral = (s: VoteSnapshot) => JSON.stringify({ ...s, me: null, myVote: null, serverTime: 0 });
    const timeline = (p: Phone) =>
      p.events
        .map((e) => e.payload as VoteSnapshot)
        .filter((s) => s.phase !== 'reveal' && s.phase !== 'finale')
        .map(neutral)
        .filter((s, i, all) => i === 0 || s !== all[i - 1]); // a repeated snapshot (reconnect) carries nothing new
    const reference = timeline(phones[0]!);
    expect(reference.length).toBeGreaterThan(10);
    for (const p of phones.slice(1)) expect(timeline(p)).toEqual(reference);

    // ---- Logs, DB and files: no names, no original file names (R22) ----
    expect(server.logs).toContain('incoming request'); // the check below only means something with logs present
    for (const p of persons) expect(server.logs).not.toContain(p.name);
    for (const f of ORIGINAL_FILES) expect(server.logs).not.toContain(f);

    const db = new DatabaseSync(path.join(dataDir, 'pribe.sqlite'), { readOnly: true });
    try {
      for (const table of ['submissions', 'topic_assignments']) {
        const rows = JSON.stringify(db.prepare(`SELECT * FROM ${table}`).all());
        expectNoIdentity(rows, persons);
        for (const p of persons) expect(rows).not.toContain(p.id);
      }
    } finally {
      db.close();
    }
    for (const file of readdirSync(dataDir).filter((f) => f.startsWith('pribe.sqlite'))) {
      const bytes = readFileSync(path.join(dataDir, file)).toString('latin1');
      for (const f of ORIGINAL_FILES) expect(bytes).not.toContain(f);
    }
    for (const f of readdirSync(path.join(dataDir, 'files'))) expect(f).toMatch(/^[0-9a-f-]{36}\.(html|pptx)$/);
    for (const f of readdirSync(path.join(dataDir, 'avatars'))) expect(f).toMatch(/^[0-9a-f-]{36}\.png$/);

    host.close();
    for (const p of phones) p.socket.close();
  });
});

function expectNoIdentity(text: string, persons: Person[]): void {
  for (const p of persons) expect(text).not.toContain(p.name);
  for (const f of ORIGINAL_FILES) expect(text).not.toContain(f);
}

type Edge = FinaleResult['guessNetwork'][number];
const sortEdges = (edges: Edge[]) => [...edges].sort((a, b) => `${a.fromId}${a.toId}`.localeCompare(`${b.fromId}${b.toId}`));

/** Independent recomputation of the finale from the test's own vote bookkeeping (D08, D28). */
function expectedFinale(persons: Person[], votes: Map<number, Map<number, CastPlan>>, owners: Map<number, number>) {
  const id = (i: number) => persons[i]!.id;
  const points: Record<string, number> = Object.fromEntries(persons.map((p) => [p.id, 0]));
  const guesses: Record<string, number> = Object.fromEntries(persons.map((p) => [p.id, 0]));
  const withMajority: Record<string, number> = Object.fromEntries(persons.map((p) => [p.id, 0]));
  const guessedRight: Record<string, number | null> = Object.fromEntries(persons.map((p) => [p.id, null]));
  const edges = new Map<string, Edge>();

  for (const [roundId, byPhone] of votes) {
    const owner = owners.get(roundId)!;
    const counting = [...byPhone].filter(([i, v]) => i !== owner && v.guessPersonId);
    const counts = new Map<string, number>();
    for (const [, v] of counting) counts.set(v.guessPersonId!, (counts.get(v.guessPersonId!) ?? 0) + 1);
    const top = [...counts].sort((a, b) => b[1] - a[1]);
    const majority = top[0] && top[0][1] >= 2 && (!top[1] || top[1][1] < top[0][1]) ? top[0][0] : null;
    let right = 0;
    for (const [i, v] of counting) {
      const hit = v.guessPersonId === id(owner);
      guesses[id(i)]!++;
      if (hit) {
        points[id(i)]!++;
        right++;
      }
      if (majority && v.guessPersonId === majority) withMajority[id(i)]!++;
      const key = `${id(i)}>${v.guessPersonId}`;
      const e = edges.get(key) ?? { fromId: id(i), toId: v.guessPersonId!, count: 0, correct: 0 };
      e.count++;
      if (hit) e.correct++;
      edges.set(key, e);
    }
    if (counting.length > 0) guessedRight[id(owner)] = (guessedRight[id(owner)] ?? 0) + right;
  }

  const best = (kind: Award['kind'], ids: string[], metric: (id: string) => number, dir: 'max' | 'min'): Award => {
    if (!ids.length) return { kind, winners: [], value: 0 };
    const values = ids.map(metric);
    const value = dir === 'max' ? Math.max(...values) : Math.min(...values);
    return { kind, winners: ids.filter((x) => metric(x) === value), value };
  };
  const all = persons.map((p) => p.id);
  const awards: Award[] = [
    best('hellseher', all.filter((x) => points[x]! > 0), (x) => points[x]!, 'max'),
    best('pokerface', all.filter((x) => guessedRight[x] !== null), (x) => guessedRight[x]!, 'min'),
    best('blindgaenger', all.filter((x) => guesses[x]! > 0 && points[x] === 0), () => 0, 'max'),
    best('herdentier', all.filter((x) => withMajority[x]! > 0), (x) => withMajority[x]!, 'max'),
  ];
  return { points, awards, network: [...edges.values()] };
}
