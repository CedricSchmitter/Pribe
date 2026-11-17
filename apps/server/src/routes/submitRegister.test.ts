import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  API_PATHS,
  AVATAR_MAX_BYTES,
  inviteLink,
  PHOTO_FIELD,
  type AdminPersonDto,
  type AdminSettingsDto,
  type Person,
  type PersonMeDto,
} from '@pribe/shared';
import { avatarsDir } from './submitPhoto';
import { setup } from './submit.testkit';

let t: Awaited<ReturnType<typeof setup>>;

beforeEach(async () => {
  t = await setup();
});
afterEach(async () => {
  await t.app.close();
});

const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(200, 7)]);
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(100, 3)]);

const register = (body: Record<string, unknown>) =>
  t.app.inject({
    method: 'POST',
    url: API_PATHS.person.register,
    payload: { name: 'Dora', emoji: '🦉', color: '#123456', password: 'dora-pw', ...body },
  });

async function setCode(code: string | null) {
  return t.admin('PUT', API_PATHS.admin.settings, { inviteCode: code });
}

function photoUpload(cookie: string | null, data: Buffer, filename = 'me.jpg') {
  const boundary = '----pribe-photo';
  const payload = Buffer.concat([
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="${PHOTO_FIELD}"; filename="${filename}"\r\n` +
        'Content-Type: image/jpeg\r\n\r\n',
    ),
    data,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  const headers: Record<string, string> = { 'content-type': `multipart/form-data; boundary=${boundary}` };
  if (cookie) headers.cookie = cookie;
  return t.app.inject({ method: 'PUT', url: API_PATHS.person.photo, payload, headers });
}

describe('invite code', () => {
  it('admin sets and changes the code; the settings carry PUBLIC_URL for links', async () => {
    const first = (await setCode('Party2026')).json() as AdminSettingsDto;
    expect(first).toMatchObject({ inviteCode: 'Party2026', publicUrl: 'http://localhost:3000' });
    expect(inviteLink(first.publicUrl, '/vote', first.inviteCode!)).toBe('http://localhost:3000/vote?code=Party2026');
    expect(((await setCode('neu-123')).json() as AdminSettingsDto).inviteCode).toBe('neu-123');
    expect((await setCode('a b')).statusCode).toBe(400);
    expect((await setCode('x')).statusCode).toBe(400);
    expect(((await setCode(null)).json() as AdminSettingsDto).inviteCode).toBeNull();
  });

  it('is never sent to phones', async () => {
    await setCode('Geheim42');
    const open = [API_PATHS.persons, API_PATHS.submit.status];
    for (const url of open) expect((await t.app.inject({ url })).body).not.toContain('Geheim42');
  });
});

describe('registration', () => {
  it('is rejected without a configured code, without a code and with a wrong code', async () => {
    expect((await register({ inviteCode: 'irgendwas' })).json()).toMatchObject({ error: 'INVALID_INVITE_CODE' });
    await setCode('Party2026');
    expect((await register({})).statusCode).toBe(400);
    const wrong = await register({ inviteCode: 'Party2025' });
    expect(wrong.statusCode).toBe(403);
    expect(wrong.json()).toMatchObject({ error: 'INVALID_INVITE_CODE' });
    // An old code stops working once the admin changes it.
    await setCode('Neu2026');
    expect((await register({ inviteCode: 'Party2026' })).statusCode).toBe(403);
    expect(t.ctx.repos.persons.list()).toEqual([]);
  });

  it('creates the person with password, logs in, and the code ignores case', async () => {
    await setCode('Party2026');
    const res = await register({ inviteCode: 'party2026' });
    expect(res.statusCode).toBe(201);
    const { person } = res.json() as PersonMeDto;
    expect(person).toMatchObject({ name: 'Dora', emoji: '🦉', color: '#123456', photoUrl: null });

    const cookie = t.cookieOf(res)!;
    const me = (await t.app.inject({ url: API_PATHS.person.me, headers: { cookie } })).json() as PersonMeDto;
    expect(me.person?.id).toBe(person!.id);
    expect((await t.app.inject({ url: API_PATHS.person.status(person!.id) })).json()).toEqual({ hasPassword: true });
    const login = await t.app.inject({
      method: 'POST',
      url: API_PATHS.person.login,
      payload: { personId: person!.id, password: 'dora-pw' },
    });
    expect(login.statusCode).toBe(200);
  });

  it('rejects a name that exists in any case, also for the admin', async () => {
    await setCode('Party2026');
    await t.addPerson('Anna');
    const dup = await register({ inviteCode: 'Party2026', name: 'aNNa' });
    expect(dup.statusCode).toBe(409);
    expect(dup.json()).toMatchObject({ error: 'NAME_TAKEN' });
    expect((await t.admin('POST', API_PATHS.admin.persons, { name: 'ANNA', emoji: '🐙', color: '#000000' })).statusCode).toBe(409);
    expect(t.ctx.repos.persons.list()).toHaveLength(1);
  });
});

describe('photo avatar', () => {
  async function registered(): Promise<{ person: Person; cookie: string }> {
    await setCode('Party2026');
    const res = await register({ inviteCode: 'Party2026' });
    return { person: (res.json() as PersonMeDto).person!, cookie: t.cookieOf(res)! };
  }

  it('stores a JPEG, serves it publicly and replaces the old file', async () => {
    const { person, cookie } = await registered();
    const res = await photoUpload(cookie, JPEG);
    expect(res.statusCode).toBe(200);
    const url = (res.json() as PersonMeDto).person!.photoUrl!;
    expect(url).toMatch(/^\/api\/avatars\/[0-9a-f-]{36}\.jpg$/);

    const served = await t.app.inject({ url });
    expect(served.statusCode).toBe(200);
    expect(served.headers['content-type']).toBe('image/jpeg');
    expect(Buffer.from(served.rawPayload).equals(JPEG)).toBe(true);
    expect(((await t.app.inject({ url: API_PATHS.persons })).json() as Person[])[0]!.photoUrl).toBe(url);

    const second = ((await photoUpload(cookie, PNG, 'x.png')).json() as PersonMeDto).person!.photoUrl!;
    expect(second).toMatch(/\.png$/);
    expect(readdirSync(avatarsDir(t.ctx))).toEqual([path.basename(second)]);
    expect((await t.app.inject({ url })).statusCode).toBe(404);
    expect(t.ctx.repos.persons.get(person.id)?.photoUrl).toBe(second);
  });

  it('checks type by content and size, and requires a login', async () => {
    const { cookie } = await registered();
    const fake = await photoUpload(cookie, Buffer.from('<svg onload="alert(1)"/>'), 'evil.jpg');
    expect(fake.statusCode).toBe(415);
    expect(fake.json()).toMatchObject({ error: 'UNSUPPORTED_IMAGE' });
    const big = Buffer.concat([JPEG, Buffer.alloc(AVATAR_MAX_BYTES, 1)]);
    expect((await photoUpload(cookie, big)).statusCode).toBe(413);
    expect((await photoUpload(null, JPEG)).statusCode).toBe(401);
    expect(existsSync(avatarsDir(t.ctx)) ? readdirSync(avatarsDir(t.ctx)) : []).toEqual([]);
  });

  it('the avatar endpoint only serves generated names', async () => {
    for (const url of ['/api/avatars/..%2Fpribe.sqlite', '/api/avatars/x.jpg', '/api/avatars/00000000-0000-0000-0000-000000000000.jpg']) {
      expect((await t.app.inject({ url })).statusCode, url).toBe(404);
    }
  });

  it('the person and the admin can remove the photo; deleting the person removes the file', async () => {
    const { person, cookie } = await registered();
    await photoUpload(cookie, JPEG);
    const own = await t.app.inject({ method: 'DELETE', url: API_PATHS.person.photo, headers: { cookie } });
    expect((own.json() as PersonMeDto).person!.photoUrl).toBeNull();
    expect(readdirSync(avatarsDir(t.ctx))).toEqual([]);

    await photoUpload(cookie, JPEG);
    expect((await t.admin('DELETE', API_PATHS.admin.personPhoto(person.id))).statusCode).toBe(204);
    const list = (await t.admin('GET', API_PATHS.admin.persons)).json() as AdminPersonDto[];
    expect(list[0]).toMatchObject({ photoUrl: null, emoji: '🦉', hasPassword: true });

    await photoUpload(cookie, JPEG);
    await t.admin('DELETE', API_PATHS.admin.person(person.id));
    expect(readdirSync(avatarsDir(t.ctx))).toEqual([]);
  });
});
