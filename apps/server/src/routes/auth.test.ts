import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { API_PATHS } from '@pribe/shared';
import { PASSWORD, setup } from './submit.testkit';

let t: Awaited<ReturnType<typeof setup>>;

const RIGHT = 'test-password';

async function start(env: Record<string, string> = {}) {
  t = await setup(env);
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'], now: 1_000_000 });
});
afterEach(async () => {
  vi.useRealTimers();
  await t.app.close();
});

const login = (password: string, opts: { ip?: string; forwardedFor?: string } = {}) =>
  t.app.inject({
    method: 'POST',
    url: API_PATHS.auth.login,
    payload: { password },
    remoteAddress: opts.ip ?? '10.0.0.1',
    headers: opts.forwardedFor ? { 'x-forwarded-for': opts.forwardedFor } : {},
  });

async function failTimes(n: number, opts?: Parameters<typeof login>[1]) {
  for (let i = 0; i < n; i++) await login('falsch', opts);
}

describe('admin login lock (R87)', () => {
  it('locks after the 5th failure and names the remaining time', async () => {
    await start();
    for (let i = 0; i < 4; i++) expect((await login('falsch')).statusCode).toBe(401);

    const fifth = await login('falsch');
    expect(fifth.statusCode).toBe(429);
    expect(fifth.json()).toMatchObject({ error: 'LOGIN_LOCKED', message: expect.stringContaining('15 Minuten') });
    expect(fifth.headers['retry-after']).toBe('900');

    const right = await login(RIGHT);
    expect(right.statusCode).toBe(429);
    expect(right.cookies).toEqual([]);

    vi.advanceTimersByTime(14 * 60_000 + 1);
    expect((await login(RIGHT)).json()).toMatchObject({ message: expect.stringContaining('1 Minute gesperrt') });
  });

  it('lets the right password in once the lock has expired', async () => {
    await start();
    await failTimes(5);
    vi.advanceTimersByTime(15 * 60_000);
    expect((await login(RIGHT)).statusCode).toBe(200);
  });

  it('starts a fresh count after the lock has expired', async () => {
    await start();
    await failTimes(5);
    vi.advanceTimersByTime(15 * 60_000);
    expect((await login('falsch')).statusCode).toBe(401);
  });

  it('a successful login resets the counter', async () => {
    await start();
    await failTimes(4);
    expect((await login(RIGHT)).statusCode).toBe(200);
    await failTimes(4);
    expect((await login(RIGHT)).statusCode).toBe(200);
  });

  it('forgets failures older than the lock window', async () => {
    await start();
    await failTimes(4);
    vi.advanceTimersByTime(15 * 60_000);
    expect((await login('falsch')).statusCode).toBe(401);
  });

  it('counts per IP', async () => {
    await start();
    await failTimes(5, { ip: '10.0.0.1' });
    expect((await login(RIGHT, { ip: '10.0.0.2' })).statusCode).toBe(200);
  });

  it('ignores X-Forwarded-For unless TRUST_PROXY is set', async () => {
    await start();
    await failTimes(5, { ip: '127.0.0.1', forwardedFor: '203.0.113.1' });
    expect((await login(RIGHT, { ip: '127.0.0.1', forwardedFor: '203.0.113.2' })).statusCode).toBe(429);
  });

  it('with TRUST_PROXY takes the client from X-Forwarded-For, ignoring what the client forged', async () => {
    await start({ TRUST_PROXY: 'true' });
    await failTimes(5, { ip: '127.0.0.1', forwardedFor: '203.0.113.1' });
    expect((await login(RIGHT, { ip: '127.0.0.1', forwardedFor: '203.0.113.1' })).statusCode).toBe(429);
    expect((await login(RIGHT, { ip: '127.0.0.1', forwardedFor: '203.0.113.2' })).statusCode).toBe(200);
    expect((await login(RIGHT, { ip: '127.0.0.1', forwardedFor: '198.51.100.9, 203.0.113.1' })).statusCode).toBe(429);
  });

  it('does not apply to person passwords', async () => {
    await start();
    const anna = await t.addPerson('Anna');
    await t.personCookie(anna.id);
    for (let i = 0; i < 6; i++) {
      const res = await t.app.inject({
        method: 'POST',
        url: API_PATHS.person.login,
        payload: { personId: anna.id, password: 'falsch!!' },
        remoteAddress: '10.0.0.1',
      });
      expect(res.json()).toMatchObject({ error: 'WRONG_PASSWORD' });
    }
    const ok = await t.app.inject({
      method: 'POST',
      url: API_PATHS.person.login,
      payload: { personId: anna.id, password: PASSWORD },
      remoteAddress: '10.0.0.1',
    });
    expect(ok.statusCode).toBe(200);
    expect((await login(RIGHT)).statusCode).toBe(200);
  });
});
