import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { API_PATHS, SESSION_COOKIE_NAME } from '@pribe/shared';
import { buildApp } from '../app';
import { testConfig } from '../testing';

let built: Awaited<ReturnType<typeof buildApp>>;

beforeEach(async () => {
  const webDir = mkdtempSync(path.join(tmpdir(), 'pribe-web-'));
  writeFileSync(path.join(webDir, 'index.html'), '<!doctype html>');
  built = await buildApp(testConfig(), { dbFile: ':memory:', webDistDir: webDir });
});

afterEach(async () => {
  await built.app.close();
});

describe('host info', () => {
  it('requires the admin session', async () => {
    const res = await built.app.inject({ url: API_PATHS.hostInfo });
    expect(res.statusCode).toBe(401);
  });

  async function info() {
    const login = await built.app.inject({ method: 'POST', url: API_PATHS.auth.login, payload: { password: 'test-password' } });
    const c = login.cookies.find((x) => x.name === SESSION_COOKIE_NAME)!;
    const res = await built.app.inject({ url: API_PATHS.hostInfo, headers: { cookie: `${c.name}=${c.value}` } });
    expect(res.statusCode).toBe(200);
    return res.json();
  }

  it('returns plain PUBLIC_URL/vote without an invite code', async () => {
    built.ctx.repos.settings.update({ inviteCode: null });
    expect(await info()).toEqual({ voteUrl: 'http://localhost:3000/vote', registrationOpen: false });
  });

  it('puts the invite code into the vote URL', async () => {
    built.ctx.repos.settings.update({ inviteCode: 'party-26' });
    expect(await info()).toEqual({ voteUrl: 'http://localhost:3000/vote?code=party-26', registrationOpen: true });
  });
});
