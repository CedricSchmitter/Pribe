import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { isOwner, ownerHash } from './hmac';

const SECRET = 'test-secret-0123456789';

describe('ownerHash', () => {
  it('is HMAC-SHA256(personId, secret) in hex', () => {
    const expected = createHmac('sha256', SECRET).update('person-1').digest('hex');
    expect(ownerHash('person-1', SECRET)).toBe(expected);
    expect(ownerHash('person-1', SECRET)).toMatch(/^[0-9a-f]{64}$/);
  });

  it('is deterministic and differs per person and secret', () => {
    expect(ownerHash('a', SECRET)).toBe(ownerHash('a', SECRET));
    expect(ownerHash('a', SECRET)).not.toBe(ownerHash('b', SECRET));
    expect(ownerHash('a', SECRET)).not.toBe(ownerHash('a', `${SECRET}x`));
  });

  it('isOwner compares against the stored hash', () => {
    const hash = ownerHash('a', SECRET);
    expect(isOwner('a', hash, SECRET)).toBe(true);
    expect(isOwner('b', hash, SECRET)).toBe(false);
    expect(isOwner('a', 'not-hex', SECRET)).toBe(false);
  });
});
