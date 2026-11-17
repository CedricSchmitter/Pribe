import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { API_PATHS, SESSION_COOKIE_NAME } from '@pribe/shared';
import { buildApp } from '../app';
import { testConfig } from '../testing';
import { downloadName, PPTX_CONTENT_TYPE } from './files';

let built: Awaited<ReturnType<typeof buildApp>>;
let cookie: string;

beforeEach(async () => {
  const webDir = mkdtempSync(path.join(tmpdir(), 'pribe-web-'));
  writeFileSync(path.join(webDir, 'index.html'), '<!doctype html>');
  built = await buildApp(testConfig(), { dbFile: ':memory:', webDistDir: webDir });
  const res = await built.app.inject({ method: 'POST', url: API_PATHS.auth.login, payload: { password: 'test-password' } });
  const c = res.cookies.find((x) => x.name === SESSION_COOKIE_NAME)!;
  cookie = `${c.name}=${c.value}`;
});

afterEach(async () => {
  await built.app.close();
});

function addFile(kind: 'html' | 'pptx', status: 'ready' | 'converting' | 'failed', content: string) {
  const ext = kind;
  const { submission } = built.ctx.repos.submissions.replaceForOwner({
    ownerHash: `${kind}-${status}-${Math.random()}`,
    kind,
    status,
    filePath: null,
  });
  const filePath = `${submission.id}.${ext}`;
  writeFileSync(path.join(built.ctx.config.filesDir, filePath), content);
  built.ctx.repos.submissions.updateStatus(submission.id, { status, filePath });
  return submission.id;
}

describe('file endpoint', () => {
  it('requires the host/admin session', async () => {
    const id = addFile('pptx', 'ready', 'PK');
    expect((await built.app.inject({ url: API_PATHS.file(id) })).statusCode).toBe(401);
    const forged = await built.app.inject({ url: API_PATHS.file(id), headers: { cookie: `${SESSION_COOKIE_NAME}=1.x` } });
    expect(forged.statusCode).toBe(401);
  });

  it('serves HTML sandboxed so it never runs same-origin', async () => {
    const id = addFile('html', 'ready', '<h1>Hallo</h1>');
    const res = await built.app.inject({ url: API_PATHS.file(id), headers: { cookie } });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toBe('text/html; charset=utf-8');
    expect(res.headers['content-security-policy']).toBe('sandbox allow-scripts');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.body).toBe('<h1>Hallo</h1>');
  });

  it('serves PPTX as a download named by a per-submission hash', async () => {
    const id = addFile('pptx', 'ready', 'PK-pptx');
    const res = await built.app.inject({ url: API_PATHS.file(id), headers: { cookie } });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toBe(PPTX_CONTENT_TYPE);
    expect(res.headers['content-security-policy']).toBeUndefined();
    expect(res.body).toBe('PK-pptx');

    const name = downloadName(built.ctx.config.secret, id);
    expect(name).toMatch(/^[0-9a-f]{16}$/);
    expect(res.headers['content-disposition']).toBe(`attachment; filename="${name}.pptx"`);
    const sub = built.ctx.repos.submissions.get(id)!;
    expect(sub.ownerHash).not.toContain(name);
    expect(res.headers['content-disposition']).not.toContain(id);
  });

  it('answers 404 for unknown, converting or failed submissions', async () => {
    for (const id of ['nope', addFile('pptx', 'converting', 'x'), addFile('pptx', 'failed', 'x')]) {
      const res = await built.app.inject({ url: API_PATHS.file(id), headers: { cookie } });
      expect(res.statusCode, id).toBe(404);
    }
  });

  it('never leaves filesDir', async () => {
    const { submission } = built.ctx.repos.submissions.replaceForOwner({
      ownerHash: 'evil',
      kind: 'pptx',
      status: 'ready',
      filePath: '../pribe.sqlite',
    });
    const res = await built.app.inject({ url: API_PATHS.file(submission.id), headers: { cookie } });
    expect(res.statusCode).toBe(404);
  });
});
