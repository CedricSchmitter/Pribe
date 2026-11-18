import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { strFromU8, unzipSync } from 'fflate';
import { API_PATHS, PHOTO_FIELD, UPLOAD_FIELDS, type AdminGuestDto, type SubmissionOverviewDto, type SubmitStatusDto } from '@pribe/shared';
import { HTML, PPTX, setup } from './submit.testkit';
import { avatarsDir } from './submitPhoto';

let t: Awaited<ReturnType<typeof setup>>;

beforeEach(async () => {
  t = await setup();
});
afterEach(async () => {
  await t.app.close();
});

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64)]);

function multipart(method: 'POST' | 'PUT', url: string, field: string, filename: string, content: string | Buffer) {
  const boundary = '----pribe-guest-boundary';
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${field}"; filename="${filename}"\r\nContent-Type: application/octet-stream\r\n\r\n`),
    Buffer.isBuffer(content) ? content : Buffer.from(content),
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  return t.app.inject({ method, url, payload: body, headers: { cookie: t.cookie, 'content-type': `multipart/form-data; boundary=${boundary}` } });
}

const uploadGuest = (filename: string, content: string | Buffer) => multipart('POST', API_PATHS.admin.guestPresentation, UPLOAD_FIELDS.file, filename, content);

async function waitReady(): Promise<AdminGuestDto> {
  for (let i = 0; i < 200; i++) {
    const g = (await t.admin('GET', API_PATHS.admin.guest)).json<AdminGuestDto>();
    if (g.presentation?.status !== 'converting') return g;
    await new Promise((r) => setTimeout(r, 20));
  }
  throw new Error('guest presentation stuck in converting');
}

describe('surprise guest (R90)', () => {
  it('requires the admin session', async () => {
    for (const [method, url] of [
      ['GET', API_PATHS.admin.guest],
      ['PUT', API_PATHS.admin.guest],
      ['PUT', API_PATHS.admin.guestPhoto],
      ['DELETE', API_PATHS.admin.guestPhoto],
      ['POST', API_PATHS.admin.guestPresentation],
      ['DELETE', API_PATHS.admin.guestPresentation],
    ] as const) {
      expect((await t.app.inject({ method, url, payload: {} })).statusCode, `${method} ${url}`).toBe(401);
    }
  });

  it('an own guest with photo and HTML is ready, but no player and not in pool, overview or counts', async () => {
    const anna = await t.addPerson('Anna');
    await t.upload(anna.id, 'anna.html', HTML);

    expect((await t.admin('GET', API_PATHS.admin.guest)).json()).toMatchObject({ enabled: false, ready: false, presentation: null });
    await t.admin('PUT', API_PATHS.admin.guest, { enabled: true, name: 'Die Chefin', emoji: '🎩', color: '#ffd000' });
    expect((await multipart('PUT', API_PATHS.admin.guestPhoto, PHOTO_FIELD, 'g.png', PNG)).statusCode).toBe(200);
    const res = await uploadGuest('geheim.html', HTML);
    expect(res.statusCode).toBe(201);
    const guest = res.json<AdminGuestDto>();
    expect(guest).toMatchObject({ enabled: true, name: 'Die Chefin', ready: true, presentation: { kind: 'html', status: 'ready' } });
    expect(guest.photoUrl).toMatch(/^\/api\/avatars\/[0-9a-f-]{36}\.png$/);
    expect((await t.app.inject({ url: guest.photoUrl! })).statusCode).toBe(200);

    const { repos } = t.ctx;
    expect(repos.persons.list().map((p) => p.name)).toEqual(['Anna']);
    expect(repos.submissions.listPool()).toHaveLength(1);
    const overview = (await t.admin('GET', API_PATHS.admin.submissions)).json<SubmissionOverviewDto>();
    expect(overview.total).toBe(1);
    expect(overview.byStatus.ready).toBe(1);
    expect((await t.app.inject({ url: API_PATHS.submit.status })).json<SubmitStatusDto>().submissionCount).toBe(1);

    // Served like any presentation, to the beamer only.
    const file = API_PATHS.file(repos.submissions.getGuest()!.id);
    expect((await t.app.inject({ url: file })).statusCode).toBe(401);
    const served = await t.admin('GET', file);
    expect(served.statusCode).toBe(200);
    expect(served.headers['content-security-policy']).toBe('sandbox allow-scripts');
    // The original file name is not kept anywhere (R22).
    expect(readdirSync(t.ctx.config.filesDir).join()).not.toContain('geheim');
  });

  it('a guest who also submitted normally keeps both, without an owner_hash clash', async () => {
    const anna = await t.addPerson('Anna');
    await t.upload(anna.id, 'anna.html', HTML);
    await t.admin('PUT', API_PATHS.admin.guest, { enabled: true, personId: anna.id });
    await uploadGuest('gast.html', HTML);
    const g = (await t.admin('GET', API_PATHS.admin.guest)).json<AdminGuestDto>();
    expect(g.ready).toBe(true);
    expect(t.ctx.repos.submissions.findByOwnerHash(t.ctx.ownerHash(anna.id))).not.toBeNull();
    expect(t.ctx.repos.submissions.list()).toHaveLength(1);

    expect((await t.admin('PUT', API_PATHS.admin.guest, { personId: 'nobody' })).statusCode).toBe(404);
  });

  it('cleans PPTX metadata like a normal upload and replaces the old file', async () => {
    await uploadGuest('a.html', HTML);
    const oldId = t.ctx.repos.submissions.getGuest()!.id;
    expect((await uploadGuest('b.pptx', PPTX)).statusCode).toBe(201);
    const g = await waitReady();
    expect(g.presentation).toEqual({ kind: 'pptx', status: 'ready', error: null });
    const sub = t.ctx.repos.submissions.getGuest()!;
    expect(sub.id).not.toBe(oldId);
    expect(readdirSync(t.ctx.config.filesDir)).toEqual([`${sub.id}.pptx`]);
    const res = await t.admin('GET', API_PATHS.file(sub.id));
    const core = strFromU8(unzipSync(new Uint8Array(res.rawPayload))['docProps/core.xml']!);
    expect(core).not.toContain('Anna');

    expect((await uploadGuest('x.txt', 'hallo')).statusCode).toBe(415);
    expect((await uploadGuest('x.html', 'kein html')).statusCode).toBe(415);
  });

  it('cannot be replaced or removed while the guest is on stage', async () => {
    await uploadGuest('a.html', HTML);
    t.ctx.repos.game.save('guest', { guest: { presentingSince: null } });
    expect((await uploadGuest('b.html', HTML)).statusCode).toBe(409);
    expect((await t.admin('DELETE', API_PATHS.admin.guestPresentation)).statusCode).toBe(409);
  });

  it('the game reset keeps the guest, „Alles löschen“ removes it with its files', async () => {
    await t.admin('PUT', API_PATHS.admin.guest, { enabled: true, name: 'Gast' });
    await multipart('PUT', API_PATHS.admin.guestPhoto, PHOTO_FIELD, 'g.png', PNG);
    await uploadGuest('a.html', HTML);
    const photo = t.ctx.repos.guest.get().photoFile!;

    await t.admin('POST', API_PATHS.admin.reset, {});
    expect((await t.admin('GET', API_PATHS.admin.guest)).json<AdminGuestDto>().ready).toBe(true);

    const all = await t.admin('POST', API_PATHS.admin.resetAll, { confirm: 'LÖSCHEN' });
    expect(all.json()).toMatchObject({ submissions: 0 });
    expect((await t.admin('GET', API_PATHS.admin.guest)).json()).toMatchObject({ enabled: false, name: '', photoUrl: null, presentation: null, ready: false });
    expect(readdirSync(t.ctx.config.filesDir)).toEqual([]);
    expect(existsSync(path.join(avatarsDir(t.ctx), photo))).toBe(false);
  });
});
