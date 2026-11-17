import { describe, expect, it } from 'vitest';
import { SESSION_COOKIE_NAME } from '@pribe/shared';
import { createSessionCodec, passwordMatches, SESSION_TTL_MS } from './session';

const SECRET = 'test-secret-0123456789';

describe('session codec', () => {
  it('verifies its own tokens', () => {
    const codec = createSessionCodec(SECRET);
    expect(codec.verify(codec.issue().token)).toBe(true);
  });

  it('rejects tampered, foreign, empty and expired tokens', () => {
    let now = 1_000;
    const codec = createSessionCodec(SECRET, () => now);
    const { token } = codec.issue();
    const [exp, sig] = token.split('.');
    expect(codec.verify(`${Number(exp) + 1}.${sig}`)).toBe(false);
    expect(codec.verify(`${exp}.${sig}x`)).toBe(false);
    expect(createSessionCodec(`${SECRET}x`, () => now).verify(token)).toBe(false);
    expect(codec.verify('')).toBe(false);
    expect(codec.verify(undefined)).toBe(false);
    expect(codec.verify('garbage')).toBe(false);
    now += SESSION_TTL_MS + 1;
    expect(codec.verify(token)).toBe(false);
  });

  it('reads the token from a cookie header', () => {
    const codec = createSessionCodec(SECRET);
    const { token } = codec.issue();
    expect(codec.verifyCookieHeader(`foo=1; ${SESSION_COOKIE_NAME}=${token}`)).toBe(true);
    expect(codec.verifyCookieHeader('foo=1')).toBe(false);
    expect(codec.verifyCookieHeader(undefined)).toBe(false);
  });
});

describe('passwordMatches', () => {
  it('compares exactly', () => {
    expect(passwordMatches('geheim', 'geheim')).toBe(true);
    expect(passwordMatches('geheim ', 'geheim')).toBe(false);
    expect(passwordMatches('', 'geheim')).toBe(false);
  });
});
