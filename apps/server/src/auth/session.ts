import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { SESSION_COOKIE_NAME } from '@pribe/shared';

export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Stateless admin session: `<expiresAt>.<signature>`. The signing key is derived from
 * PRIBE_SECRET with a fixed label so a session token can never equal an owner hash.
 */
export function createSessionCodec(secret: string, now: () => number = Date.now) {
  const key = createHmac('sha256', secret).update('pribe-admin-session').digest();
  const sign = (payload: string) => createHmac('sha256', key).update(payload).digest('base64url');

  return {
    issue(): { token: string; expiresAt: number } {
      const expiresAt = now() + SESSION_TTL_MS;
      const payload = `admin:${expiresAt}`;
      return { token: `${expiresAt}.${sign(payload)}`, expiresAt };
    },
    verify(token: string | undefined | null): boolean {
      if (!token) return false;
      const dot = token.indexOf('.');
      if (dot <= 0) return false;
      const expiresAt = Number(token.slice(0, dot));
      if (!Number.isSafeInteger(expiresAt) || expiresAt <= now()) return false;
      const expected = Buffer.from(sign(`admin:${expiresAt}`));
      const given = Buffer.from(token.slice(dot + 1));
      return expected.length === given.length && timingSafeEqual(expected, given);
    },
    verifyCookieHeader(header: string | undefined): boolean {
      if (!header) return false;
      return this.verify(readCookie(header, SESSION_COOKIE_NAME));
    },
  };
}

// @fastify/cookie's parse needs a registered Fastify instance, which the Socket.IO handshake has not.
export function readCookie(header: string, name: string): string | undefined {
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq > 0 && part.slice(0, eq).trim() === name) {
      const value = part.slice(eq + 1).trim();
      try {
        return decodeURIComponent(value);
      } catch {
        return value;
      }
    }
  }
  return undefined;
}
export type SessionCodec = ReturnType<typeof createSessionCodec>;

export function passwordMatches(given: string, expected: string): boolean {
  // Hash first so the comparison is constant-time regardless of length.
  const a = createHash('sha256').update(given).digest();
  const b = createHash('sha256').update(expected).digest();
  return timingSafeEqual(a, b);
}
