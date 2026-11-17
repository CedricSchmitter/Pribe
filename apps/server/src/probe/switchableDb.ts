import type { Db } from '../db';

/**
 * A `Db` that forwards to whichever database is current. Repositories prepare their
 * statements on every call, so swapping the target points every repository, route and the
 * game engine at the test-run database at once (R83) without rebuilding them.
 */
export function createSwitchableDb(initial: Db) {
  let current = initial;
  const db = new Proxy({} as Db, {
    get(_target, key) {
      const value: unknown = Reflect.get(current, key, current);
      return typeof value === 'function' ? value.bind(current) : value;
    },
  });
  return {
    db,
    get current() {
      return current;
    },
    use(next: Db) {
      current = next;
    },
  };
}
export type SwitchableDb = ReturnType<typeof createSwitchableDb>;
