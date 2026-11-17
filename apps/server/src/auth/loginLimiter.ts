export interface LoginLimiterOptions {
  maxFailures: number;
  lockMs: number;
}

export const ADMIN_LOGIN_LIMIT: LoginLimiterOptions = { maxFailures: 5, lockMs: 15 * 60_000 };

interface Entry {
  failures: number;
  firstFailureAt: number;
  lockedUntil: number;
}

/**
 * In-memory failure counter per client key (IP); a restart clears all locks. Failures count
 * within `lockMs` of the first one, so a few typos spread over days never add up to a lock.
 */
export function createLoginLimiter({ maxFailures, lockMs }: LoginLimiterOptions = ADMIN_LOGIN_LIMIT) {
  const entries = new Map<string, Entry>();

  const current = (key: string, now: number): Entry | undefined => {
    const e = entries.get(key);
    if (!e) return undefined;
    const expired = e.lockedUntil ? e.lockedUntil <= now : e.firstFailureAt + lockMs <= now;
    if (expired) {
      entries.delete(key);
      return undefined;
    }
    return e;
  };

  return {
    /** Milliseconds until the lock ends, 0 when not locked. */
    lockedFor(key: string, now = Date.now()): number {
      const e = current(key, now);
      return e?.lockedUntil ? e.lockedUntil - now : 0;
    },
    /** Records a failure; returns the lock duration if this failure triggered the lock, else 0. */
    fail(key: string, now = Date.now()): number {
      const e = current(key, now) ?? { failures: 0, firstFailureAt: now, lockedUntil: 0 };
      e.failures += 1;
      if (e.failures >= maxFailures) e.lockedUntil = now + lockMs;
      entries.set(key, e);
      return e.lockedUntil ? e.lockedUntil - now : 0;
    },
    succeed(key: string): void {
      entries.delete(key);
    },
  };
}
export type LoginLimiter = ReturnType<typeof createLoginLimiter>;

export function lockMessage(ms: number): string {
  const minutes = Math.max(1, Math.ceil(ms / 60_000));
  return `Zu viele Fehlversuche. Der Login ist noch ${minutes} ${minutes === 1 ? 'Minute' : 'Minuten'} gesperrt.`;
}
