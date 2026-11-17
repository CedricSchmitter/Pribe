/**
 * Demo data for a local evening (`npm run demo:seed [-- --force]`): 8 persons with emoji,
 * color, password, topic and partly a photo, 5 HTML and 2 PPTX presentations from demo/.
 * Everything goes through the real HTTP API of an in-process server on a free port, using
 * the DATA_DIR from .env / the environment. Stop `npm start` first: both would share the DB.
 */
import { readFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { fileURLToPath } from 'node:url';
import { crc32, deflateSync } from 'node:zlib';
import { strFromU8, unzipSync } from 'fflate';
import {
  API_PATHS,
  type AdminPersonDto,
  type Person,
  type PersonMeDto,
  type SubmissionStatusDto,
  type TopicResponseDto,
} from '@pribe/shared';
import { buildApp } from '../apps/server/src/app';
import { loadDotEnv, parseConfig } from '../apps/server/src/config';

const DEMO_PASSWORD = 'demo';
const DEMO_INVITE_CODE = 'PRIBE-DEMO';

const DEMO_DIR = fileURLToPath(new URL('../demo/', import.meta.url));

interface DemoPerson {
  name: string;
  emoji: string;
  color: string;
  /** `admin`: created in /admin, sets the password on first visit; `register`: invite code (D27). */
  via: 'admin' | 'register';
  photo?: boolean;
  file?: string;
}

const PEOPLE: DemoPerson[] = [
  { name: 'Anna', emoji: '🦊', color: '#ff6633', via: 'admin', file: 'html/montage-verbieten.html' },
  { name: 'Ben', emoji: '🐙', color: '#3366ff', via: 'admin', file: 'pptx/buero-pflanzen.pptx' },
  { name: 'Cleo', emoji: '🦄', color: '#cc33ff', via: 'register', photo: true, file: 'html/katze-als-ceo.html' },
  { name: 'Dennis', emoji: '🐸', color: '#33cc66', via: 'register', file: 'pptx/kaffeemaschine.pptx' },
  { name: 'Emma', emoji: '🐼', color: '#888888', via: 'admin', photo: true, file: 'html/meeting-nicken.html' },
  { name: 'Finn', emoji: '🦁', color: '#f89939', via: 'register', file: 'html/socken-mythos.html' },
  { name: 'Greta', emoji: '🐝', color: '#e3a735', via: 'register', photo: true, file: 'html/perfekter-sonntag.html' },
  // Presents without a presentation of their own (R43).
  { name: 'Hugo', emoji: '🐢', color: '#2779c4', via: 'admin' },
];

/** 256×256 PNG: a filled circle in `color` on a darker ring, with a lighter highlight. */
function avatarPng(color: string): Buffer {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16)) as [number, number, number];
  const size = 256;
  const raw = Buffer.alloc((size * 3 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 3 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const d = Math.hypot(x - 128, y - 128);
      const hl = Math.hypot(x - 96, y - 92) < 36;
      const f = d < 100 ? (hl ? 1.5 : 1) : d < 120 ? 0.55 : 0.25;
      const o = y * (size * 3 + 1) + 1 + x * 3;
      raw[o] = Math.min(255, r * f);
      raw[o + 1] = Math.min(255, g * f);
      raw[o + 2] = Math.min(255, b * f);
    }
  }
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type, 'latin1'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(td));
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr.set([8, 2, 0, 0, 0], 8);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const cookieOf = (res: Response) =>
  res.headers
    .getSetCookie()
    .map((c) => c.split(';')[0])
    .join('; ');

async function main() {
  const force = process.argv.includes('--force');
  loadDotEnv();
  const config = parseConfig(process.env);
  const { app } = await buildApp({ ...config, logLevel: 'warn' });
  await app.listen({ port: 0, host: '127.0.0.1' });
  const base = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;

  const call = async <T>(method: string, url: string, opts: { cookie?: string; json?: unknown; form?: FormData } = {}) => {
    const headers: Record<string, string> = {};
    if (opts.cookie) headers.cookie = opts.cookie;
    if (opts.json !== undefined) headers['content-type'] = 'application/json';
    const res = await fetch(`${base}${url}`, {
      method,
      headers,
      body: opts.json !== undefined ? JSON.stringify(opts.json) : opts.form,
    });
    if (!res.ok) throw new Error(`${method} ${url}: ${res.status} ${await res.text()}`);
    const text = await res.text();
    return { body: (text ? JSON.parse(text) : null) as T, res };
  };

  try {
    const admin = cookieOf((await call('POST', API_PATHS.auth.login, { json: { password: config.adminPassword } })).res);

    const existing = (await call<AdminPersonDto[]>('GET', API_PATHS.admin.persons, { cookie: admin })).body;
    if (existing.length > 0) {
      if (!force) {
        throw new Error(
          `In ${config.dataDir} gibt es schon ${existing.length} Personen. ` +
            'Mit "npm run demo:seed -- --force" werden Spiel, Einreichungen und Personen gelöscht und neu angelegt.',
        );
      }
      await call('POST', API_PATHS.admin.reset, { cookie: admin, json: { deleteSubmissions: true } });
      for (const p of existing) await call('DELETE', API_PATHS.admin.person(p.id), { cookie: admin });
      console.log(`--force: ${existing.length} Personen, Spiel und Einreichungen gelöscht.`);
    }

    await call('PUT', API_PATHS.admin.settings, {
      cookie: admin,
      json: {
        submissionDeadline: Date.now() + 7 * 24 * 3_600_000,
        talkTimeLimitS: 180,
        voteCountdownS: 20,
        inviteCode: DEMO_INVITE_CODE,
      },
    });

    const pptxIds: string[] = [];
    for (const p of PEOPLE) {
      let person: Person;
      let cookie: string;
      if (p.via === 'admin') {
        person = (await call<Person>('POST', API_PATHS.admin.persons, { cookie: admin, json: { name: p.name, emoji: p.emoji, color: p.color } })).body;
        const set = await call<PersonMeDto>('POST', API_PATHS.person.setPassword, { json: { personId: person.id, password: DEMO_PASSWORD } });
        cookie = cookieOf(set.res);
      } else {
        const reg = await call<PersonMeDto>('POST', API_PATHS.person.register, {
          json: { name: p.name, emoji: p.emoji, color: p.color, inviteCode: DEMO_INVITE_CODE, password: DEMO_PASSWORD },
        });
        person = reg.body.person!;
        cookie = cookieOf(reg.res);
      }

      if (p.photo) {
        const form = new FormData();
        form.append('photo', new Blob([avatarPng(p.color)], { type: 'image/png' }), 'avatar.png');
        await call('PUT', API_PATHS.person.photo, { cookie, form });
      }

      const topic = (await call<TopicResponseDto>('POST', API_PATHS.submit.topicSpin, { cookie })).body.topic!;

      let line = `${p.emoji} ${p.name.padEnd(7)} ${p.via === 'admin' ? 'Admin  ' : 'Einl.  '} Thema: ${topic.title}`;
      if (p.file) {
        const form = new FormData();
        form.append('file', new Blob([readFileSync(`${DEMO_DIR}${p.file}`)]), p.file.split('/').pop()!);
        const sub = (await call<SubmissionStatusDto>('POST', API_PATHS.submit.upload, { cookie, form })).body;
        if (sub.kind === 'pptx') pptxIds.push(sub.submissionId);
        line += ` | ${sub.kind}`;
      } else {
        line += ' | ohne Einreichung';
      }
      console.log(line);
    }

    // PPTX: wait for the metadata cleanup and check what the beamer would download (D23).
    for (const id of pptxIds) {
      const deadline = Date.now() + 30_000;
      let status = 'converting';
      while (status === 'converting' && Date.now() < deadline) {
        status = (await call<SubmissionStatusDto>('GET', API_PATHS.submit.submission(id))).body.status;
        if (status === 'converting') await new Promise((r) => setTimeout(r, 100));
      }
      if (status !== 'ready') throw new Error(`PPTX ${id} ist ${status}`);
      const res = await fetch(`${base}${API_PATHS.file(id)}`, { headers: { cookie: admin } });
      const name = /filename="([^"]+)"/.exec(res.headers.get('content-disposition') ?? '')?.[1] ?? '?';
      const core = strFromU8(unzipSync(new Uint8Array(await res.arrayBuffer()))['docProps/core.xml']!);
      const creator = /<dc:creator>([\s\S]*?)<\/dc:creator>/.exec(core)?.[1];
      const modifiedBy = /<cp:lastModifiedBy>([\s\S]*?)<\/cp:lastModifiedBy>/.exec(core)?.[1];
      if (creator || modifiedBy) throw new Error(`PPTX ${id}: Metadaten nicht geleert (${creator} / ${modifiedBy})`);
      console.log(`PPTX bereit als ${name}: Autor und „zuletzt geändert von“ leer.`);
    }

    console.log(
      `\n${PEOPLE.length} Personen (Passwort für alle: "${DEMO_PASSWORD}"), ${PEOPLE.filter((p) => p.file).length} Einreichungen, ` +
        `Einladungscode ${DEMO_INVITE_CODE}, Einsendeschluss in 7 Tagen.\nDaten: ${config.dataDir}`,
    );
  } finally {
    await app.close();
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
