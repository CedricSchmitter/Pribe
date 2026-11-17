/** Token bucket per key (R53): short bursts allowed, sustained spam is dropped. */
export function createThrottle(opts: { capacity: number; refillPerSecond: number; now?: () => number }) {
  const now = opts.now ?? Date.now;
  const buckets = new Map<string, { tokens: number; at: number }>();
  return {
    take(key: string): boolean {
      const t = now();
      const b = buckets.get(key) ?? { tokens: opts.capacity, at: t };
      b.tokens = Math.min(opts.capacity, b.tokens + ((t - b.at) / 1000) * opts.refillPerSecond);
      b.at = t;
      const allowed = b.tokens >= 1;
      if (allowed) b.tokens -= 1;
      buckets.set(key, b);
      return allowed;
    },
    forget(key: string): void {
      buckets.delete(key);
    },
  };
}
