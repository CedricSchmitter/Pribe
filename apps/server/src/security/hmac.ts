import { createHmac, timingSafeEqual } from 'node:crypto';
import type { PersonId } from '@pribe/shared';

/** `HMAC-SHA256(personId, PRIBE_SECRET)` as hex — the only stored link between a person and a submission (R22, D05). */
export function ownerHash(personId: PersonId, secret: string): string {
  return createHmac('sha256', secret).update(personId, 'utf8').digest('hex');
}

export function isOwner(personId: PersonId, hash: string, secret: string): boolean {
  const a = Buffer.from(ownerHash(personId, secret), 'hex');
  const b = Buffer.from(hash, 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
}
