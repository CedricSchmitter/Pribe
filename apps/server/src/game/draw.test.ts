import { describe, expect, it } from 'vitest';
import {
  chooseForPresenter,
  chooseWheel,
  eligiblePresenters,
  isExhausted,
  maxMatching,
  type DrawChoice,
  type DrawInput,
  type PoolItem,
  type Rng,
} from './draw';

/** Deterministic PRNG (mulberry32) so failing seeds can be replayed. */
function seeded(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const sub = (id: string, ownerId: string | null): PoolItem => ({ id, ownerId });

function input(personIds: string[], pool: PoolItem[], counts: Record<string, number> = {}): DrawInput {
  return { personIds, pool, presentCounts: new Map(Object.entries(counts)) };
}

function apply(state: DrawInput, choice: DrawChoice): DrawInput {
  const counts = new Map(state.presentCounts);
  counts.set(choice.presenterId, (counts.get(choice.presenterId) ?? 0) + 1);
  return { ...state, presentCounts: counts, pool: state.pool.filter((s) => s.id !== choice.submissionId) };
}

describe('manual draw', () => {
  it('never draws the own submission', () => {
    for (let seed = 0; seed < 200; seed++) {
      const r = chooseForPresenter(input(['a', 'b'], [sub('sa', 'a'), sub('sb', 'b')]), 'a', seeded(seed));
      expect(r).toEqual({ presenterId: 'a', submissionId: 'sb' });
    }
  });

  it('reports ONLY_OWN_LEFT when only the own submission is left', () => {
    expect(chooseForPresenter(input(['a', 'b'], [sub('sa', 'a')]), 'a')).toEqual({ error: 'ONLY_OWN_LEFT' });
  });

  it('reports NO_SUBMISSIONS_LEFT, UNKNOWN_PERSON', () => {
    expect(chooseForPresenter(input(['a', 'b'], []), 'a')).toEqual({ error: 'NO_SUBMISSIONS_LEFT' });
    expect(chooseForPresenter(input(['a'], [sub('sb', 'b')]), 'x')).toEqual({ error: 'UNKNOWN_PERSON' });
  });

  it('lets persons without a submission present', () => {
    expect(chooseForPresenter(input(['a', 'z'], [sub('sa', 'a')]), 'z')).toEqual({ presenterId: 'z', submissionId: 'sa' });
  });

  it('rejects a repeat presenter while others of the lap can still draw', () => {
    const s = input(['a', 'b', 'c'], [sub('sb', 'b'), sub('sc', 'c')], { a: 1 });
    expect(chooseForPresenter(s, 'a')).toEqual({ error: 'ALREADY_PRESENTED' });
  });

  it('allows a repeat presenter when the remaining newcomers only have their own left', () => {
    const s = input(['a', 'b'], [sub('sb', 'b')], { a: 1 });
    expect(chooseForPresenter(s, 'b')).toEqual({ error: 'ONLY_OWN_LEFT' });
    expect(chooseForPresenter(s, 'a')).toEqual({ presenterId: 'a', submissionId: 'sb' });
  });

  it('picks the submission that keeps the lap solvable', () => {
    // a already took b's; b must now take c's, otherwise c is left with only their own.
    const s = input(['a', 'b', 'c'], [sub('sa', 'a'), sub('sc', 'c')], { a: 1 });
    for (let seed = 0; seed < 100; seed++) {
      expect(chooseForPresenter(s, 'b', seeded(seed))).toEqual({ presenterId: 'b', submissionId: 'sc' });
    }
  });
});

describe('maxMatching', () => {
  it('counts foreign assignments only', () => {
    expect(maxMatching(['a'], [sub('sa', 'a')])).toBe(0);
    expect(maxMatching(['a', 'b'], [sub('sa', 'a'), sub('sb', 'b')])).toBe(2);
    expect(maxMatching(['a', 'b', 'c'], [sub('sa', 'a'), sub('sb', 'b')])).toBe(2);
    expect(maxMatching(['c'], [sub('sx', null)])).toBe(1);
  });
});

describe('wheel', () => {
  it('only spins persons who have not presented in this lap', () => {
    const s = input(['a', 'b', 'c'], [sub('sa', 'a'), sub('sc', 'c')], { a: 1 });
    expect(eligiblePresenters(s).sort()).toEqual(['b', 'c']);
  });

  it('avoids the classic dead end (a↔b swap leaves c with only their own)', () => {
    for (let seed = 0; seed < 300; seed++) {
      const rng = seeded(seed);
      let s = input(['a', 'b', 'c'], [sub('sa', 'a'), sub('sb', 'b'), sub('sc', 'c')]);
      const presenters: string[] = [];
      while (!isExhausted(s)) {
        const c = chooseWheel(s, rng);
        if ('error' in c) throw new Error(c.error);
        presenters.push(c.presenterId);
        s = apply(s, c);
      }
      expect(presenters.sort()).toEqual(['a', 'b', 'c']);
    }
  });

  it('ends at once for a single person with only their own submission', () => {
    const s = input(['a'], [sub('sa', 'a')]);
    expect(isExhausted(s)).toBe(true);
    expect(chooseWheel(s)).toEqual({ error: 'ONLY_OWN_LEFT' });
    expect(chooseWheel(input(['a', 'b'], []))).toEqual({ error: 'NO_SUBMISSIONS_LEFT' });
  });

  it('property: random evenings never draw own or twice, keep each lap solvable and drain the pool', () => {
    for (let seed = 1; seed <= 400; seed++) {
      const rng = seeded(seed);
      const n = 1 + Math.floor(rng() * 12);
      const personIds = Array.from({ length: n }, (_, i) => `p${i}`);
      const pool: PoolItem[] = [];
      for (const p of personIds) if (rng() < 0.7) pool.push(sub(`s-${p}`, p));
      const orphans = Math.floor(rng() * 4); // owners deleted or never on the list
      for (let i = 0; i < orphans; i++) pool.push(sub(`s-orphan${i}`, rng() < 0.5 ? null : `gone${i}`));

      let s = input(personIds, pool);
      const drawn = new Set<string>();
      let steps = 0;
      while (!isExhausted(s)) {
        const lap = eligiblePresenters(s);
        const before = maxMatching(lap, s.pool);
        const wheel = rng() < 0.5;
        const choice = wheel ? chooseWheel(s, rng) : chooseForPresenter(s, lap[Math.floor(rng() * lap.length)]!, rng);
        if ('error' in choice) throw new Error(`seed ${seed}: ${choice.error}`);

        const item = s.pool.find((x) => x.id === choice.submissionId)!;
        expect(item.ownerId, `seed ${seed}`).not.toBe(choice.presenterId);
        expect(drawn.has(item.id), `seed ${seed}`).toBe(false);
        expect(lap, `seed ${seed}`).toContain(choice.presenterId);
        drawn.add(item.id);

        const after = apply(s, choice);
        const restLap = lap.filter((p) => p !== choice.presenterId);
        // D17: if the lap had a full matching before, it still has one afterwards.
        if (before === Math.min(lap.length, s.pool.length)) {
          expect(maxMatching(restLap, after.pool), `seed ${seed}`).toBe(Math.min(restLap.length, after.pool.length));
        }
        s = after;
        if (++steps > 100) throw new Error(`seed ${seed}: no termination`);
      }
      // With two or more persons every submission has someone who may present it.
      if (n >= 2) expect(s.pool, `seed ${seed}`).toEqual([]);
      else expect(s.pool.every((x) => x.ownerId === personIds[0]), `seed ${seed}`).toBe(true);
    }
  });
});
