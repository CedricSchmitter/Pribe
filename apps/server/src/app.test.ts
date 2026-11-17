import { mkdtempSync, writeFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { io as connect, type Socket } from 'socket.io-client';
import { API_PATHS, SESSION_COOKIE_NAME, SOCKET_NAMESPACES } from '@pribe/shared';
import { buildApp } from './app';
import { adminGuard } from './auth/guards';
import { testConfig } from './testing';

let built: Awaited<ReturnType<typeof buildApp>>;
let webDir: string;

beforeEach(async () => {
  webDir = mkdtempSync(path.join(tmpdir(), 'pribe-web-'));
  writeFileSync(path.join(webDir, 'index.html'), '<!doctype html><title>Pribe</title>');
  built = await buildApp(testConfig(), { dbFile: ':memory:', webDistDir: webDir });
  built.app.register(async (scope) => {
    scope.addHook('onRequest', adminGuard(built.ctx.sessions));
    scope.get('/api/admin/__probe', async () => ({ ok: true }));
  });
});

afterEach(async () => {
  await built.app.close();
});

async function login(password = 'test-password') {
  return built.app.inject({ method: 'POST', url: API_PATHS.auth.login, payload: { password } });
}

function sessionCookie(res: Awaited<ReturnType<typeof login>>) {
  const c = res.cookies.find((x) => x.name === SESSION_COOKIE_NAME);
  return c ? `${c.name}=${c.value}` : '';
}

describe('http', () => {
  it('serves /api/health', async () => {
    const res = await built.app.inject({ url: API_PATHS.health });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ status: 'ok' });
  });

  it('serves index.html for the SPA routes and JSON 404 elsewhere', async () => {
    for (const url of ['/', '/admin', '/submit', '/host', '/vote', '/vote/x?y=1']) {
      const res = await built.app.inject({ url });
      expect(res.statusCode, url).toBe(200);
      expect(res.body).toContain('<title>Pribe</title>');
    }
    const api = await built.app.inject({ url: '/api/nope' });
    expect(api.statusCode).toBe(404);
    expect(api.json()).toMatchObject({ error: 'NOT_FOUND' });
    expect((await built.app.inject({ url: '/elsewhere' })).statusCode).toBe(404);
  });
});

describe('auth', () => {
  it('rejects a wrong or missing password', async () => {
    expect((await login('falsch')).statusCode).toBe(401);
    const res = await built.app.inject({ method: 'POST', url: API_PATHS.auth.login, payload: {} });
    expect(res.statusCode).toBe(400);
  });

  it('sets an httpOnly session cookie that passes the guard', async () => {
    const res = await login();
    expect(res.statusCode).toBe(200);
    const cookie = res.cookies.find((c) => c.name === SESSION_COOKIE_NAME);
    expect(cookie).toMatchObject({ httpOnly: true, sameSite: 'Lax', path: '/' });

    const me = await built.app.inject({ url: API_PATHS.auth.me, headers: { cookie: sessionCookie(res) } });
    expect(me.json()).toEqual({ authenticated: true });
    const ok = await built.app.inject({ url: '/api/admin/__probe', headers: { cookie: sessionCookie(res) } });
    expect(ok.statusCode).toBe(200);
  });

  it('guard rejects requests without or with a forged cookie', async () => {
    expect((await built.app.inject({ url: '/api/admin/__probe' })).statusCode).toBe(401);
    const forged = await built.app.inject({
      url: '/api/admin/__probe',
      headers: { cookie: `${SESSION_COOKIE_NAME}=99999999999999.abc` },
    });
    expect(forged.statusCode).toBe(401);
    expect(forged.json()).toMatchObject({ error: 'UNAUTHORIZED' });
  });

  it('logout clears the cookie', async () => {
    const res = await built.app.inject({ method: 'POST', url: API_PATHS.auth.logout });
    const cookie = res.cookies.find((c) => c.name === SESSION_COOKIE_NAME);
    expect(cookie?.value).toBe('');
  });
});

describe('socket namespaces', () => {
  let base: string;
  const sockets: Socket[] = [];

  beforeEach(async () => {
    await built.app.listen({ port: 0, host: '127.0.0.1' });
    base = `http://127.0.0.1:${(built.app.server.address() as AddressInfo).port}`;
  });
  afterEach(() => {
    for (const s of sockets.splice(0)) s.close();
  });

  function attempt(ns: string, cookie?: string): Promise<'connected' | string> {
    const socket = connect(`${base}${ns}`, {
      transports: ['websocket'],
      reconnection: false,
      extraHeaders: cookie ? { cookie } : {},
    });
    sockets.push(socket);
    return new Promise((resolve) => {
      socket.on('connect', () => resolve('connected'));
      socket.on('connect_error', (err) => resolve(err.message));
    });
  }

  it('vote is open', async () => {
    expect(await attempt(SOCKET_NAMESPACES.vote)).toBe('connected');
  });

  it('host requires the admin session', async () => {
    expect(await attempt(SOCKET_NAMESPACES.host)).toBe('UNAUTHORIZED');
    expect(await attempt(SOCKET_NAMESPACES.host, `${SESSION_COOKIE_NAME}=1.forged`)).toBe('UNAUTHORIZED');
    expect(await attempt(SOCKET_NAMESPACES.host, sessionCookie(await login()))).toBe('connected');
  });
});
