import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { strToU8, zipSync } from 'fflate';
import { API_PATHS, PERSON_COOKIE_NAME, SESSION_COOKIE_NAME, UPLOAD_FIELDS, type Person } from '@pribe/shared';
import { buildApp } from '../app';
import { testConfig } from '../testing';

export const HTML = '<!doctype html><html><body><h1>Folie 1</h1></body></html>';
export const PPTX = Buffer.from(
  zipSync({
    '[Content_Types].xml': strToU8('<Types/>'),
    'docProps/core.xml': strToU8('<cp:coreProperties xmlns:cp="c" xmlns:dc="d"><dc:creator>Anna</dc:creator></cp:coreProperties>'),
    'ppt/slides/slide1.xml': strToU8('<p:sld/>'),
  }),
);
export const PASSWORD = 'geheim123';

export async function setup(env: Record<string, string> = {}) {
  const webDir = mkdtempSync(path.join(tmpdir(), 'pribe-web-'));
  writeFileSync(path.join(webDir, 'index.html'), '<!doctype html><title>Pribe</title>');
  const built = await buildApp(testConfig(env), { dbFile: ':memory:', webDistDir: webDir });
  const { app } = built;

  const login = await app.inject({ method: 'POST', url: API_PATHS.auth.login, payload: { password: 'test-password' } });
  const c = login.cookies.find((x) => x.name === SESSION_COOKIE_NAME)!;
  const cookie = `${c.name}=${c.value}`;

  const admin = (method: 'GET' | 'POST' | 'PUT' | 'DELETE', url: string, payload?: unknown) =>
    app.inject({ method, url, payload: payload as object | undefined, headers: { cookie } });

  async function addPerson(name: string): Promise<Person> {
    const res = await admin('POST', API_PATHS.admin.persons, { name, emoji: '🦊', color: '#ff3366' });
    return res.json() as Person;
  }

  const cookieOf = (res: Awaited<ReturnType<typeof app.inject>>) => {
    const pc = res.cookies.find((x) => x.name === PERSON_COOKIE_NAME);
    return pc?.value ? `${pc.name}=${pc.value}` : null;
  };

  const personCookies = new Map<string, string>();

  /** Sets the password on first use and returns the person cookie. */
  async function personCookie(personId: string): Promise<string> {
    const known = personCookies.get(personId);
    if (known) return known;
    const res = await app.inject({
      method: 'POST',
      url: API_PATHS.person.setPassword,
      payload: { personId, password: PASSWORD },
    });
    const pc = cookieOf(res);
    if (!pc) throw new Error(`setPassword failed: ${res.body}`);
    personCookies.set(personId, pc);
    return pc;
  }

  /** `personId` null uploads without a person cookie. */
  async function upload(personId: string | null, filename: string, content: string | Buffer) {
    const boundary = '----pribe-test-boundary';
    const body = Buffer.concat([
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="${UPLOAD_FIELDS.file}"; filename="${filename}"\r\n` +
          'Content-Type: application/octet-stream\r\n\r\n',
      ),
      Buffer.isBuffer(content) ? content : Buffer.from(content),
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);
    const headers: Record<string, string> = { 'content-type': `multipart/form-data; boundary=${boundary}` };
    if (personId) headers.cookie = await personCookie(personId);
    return app.inject({ method: 'POST', url: API_PATHS.submit.upload, payload: body, headers });
  }

  async function asPerson(personId: string, method: 'GET' | 'POST', url: string) {
    return app.inject({ method, url, headers: { cookie: await personCookie(personId) } });
  }

  return { ...built, cookie, admin, addPerson, upload, personCookie, cookieOf, asPerson };
}
