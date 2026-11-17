import { createHmac, randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from 'node:crypto';
import { PERSON_COOKIE_NAME, type Person, type PersonId } from '@pribe/shared';
import type { PersonsRepo } from '../db/repos/persons';
import { readCookie } from './session';

export const PERSON_SESSION_TTL_MS = 180 * 24 * 60 * 60 * 1000;

const SCRYPT_PARAMS: ScryptOptions = { N: 16384, r: 8, p: 1 };
const KEY_LEN = 32;

function scryptAsync(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    scrypt(password, salt, KEY_LEN, SCRYPT_PARAMS, (err, key) => (err ? reject(err) : resolve(key))),
  );
}

/** `scrypt$<salt>$<key>` (base64url). */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scryptAsync(password, salt);
  return `scrypt$${salt.toString('base64url')}$${key.toString('base64url')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, salt, key] = stored.split('$');
  if (scheme !== 'scrypt' || !salt || !key) return false;
  const expected = Buffer.from(key, 'base64url');
  const actual = await scryptAsync(password, Buffer.from(salt, 'base64url'));
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

/**
 * Stateless personal session (D25): `<personId>.<expiresAt>.<signature>`. The signature
 * covers the stored password hash, so an admin password reset ends every session.
 */
export function createPersonSessions(secret: string, persons: PersonsRepo, now: () => number = Date.now) {
  const key = createHmac('sha256', secret).update('pribe-person-session').digest();
  const sign = (personId: string, expiresAt: number, passwordHash: string) =>
    createHmac('sha256', key).update(`person:${personId}:${expiresAt}:${passwordHash}`).digest('base64url');

  const verify = (token: string | undefined | null): Person | null => {
    if (!token) return null;
    const [personId, rawExpiry, signature] = token.split('.');
    if (!personId || !rawExpiry || !signature) return null;
    const expiresAt = Number(rawExpiry);
    if (!Number.isSafeInteger(expiresAt) || expiresAt <= now()) return null;
    const passwordHash = persons.getPasswordHash(personId);
    if (!passwordHash) return null;
    const expected = Buffer.from(sign(personId, expiresAt, passwordHash));
    const given = Buffer.from(signature);
    if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
    return persons.get(personId);
  };

  return {
    issue(personId: PersonId, passwordHash: string): { token: string; expiresAt: number } {
      const expiresAt = now() + PERSON_SESSION_TTL_MS;
      return { token: `${personId}.${expiresAt}.${sign(personId, expiresAt, passwordHash)}`, expiresAt };
    },
    verify,
    fromCookieHeader(header: string | undefined): Person | null {
      return header ? verify(readCookie(header, PERSON_COOKIE_NAME)) : null;
    },
  };
}
export type PersonSessions = ReturnType<typeof createPersonSessions>;
