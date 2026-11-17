import type { PersonId, SubmissionId } from '@pribe/shared';

/**
 * Draw rules (R42, R43, D17) as pure functions. Owners are resolved by HMAC comparison
 * before they get here and never leave the server.
 */

export interface PoolItem {
  id: SubmissionId;
  /** `null` when no current person matches the hash (e.g. the person was deleted). */
  ownerId: PersonId | null;
}

export interface DrawInput {
  personIds: PersonId[];
  /** How often each person has presented so far. */
  presentCounts: ReadonlyMap<PersonId, number>;
  pool: PoolItem[];
}

export type Rng = () => number;

export type DrawError = 'NO_SUBMISSIONS_LEFT' | 'ONLY_OWN_LEFT' | 'ALREADY_PRESENTED' | 'UNKNOWN_PERSON';

export type DrawChoice = { presenterId: PersonId; submissionId: SubmissionId };

const canTake = (personId: PersonId, item: PoolItem) => item.ownerId !== personId;

export function canDraw(personId: PersonId, pool: PoolItem[]): boolean {
  return pool.some((s) => canTake(personId, s));
}

/**
 * Persons who may present next: among everyone who can still draw a foreign submission,
 * those who presented least often. Everyone presents once before anyone presents twice
 * (a new "lap" starts once all who can draw have presented).
 */
export function eligiblePresenters(input: DrawInput): PersonId[] {
  const able = input.personIds.filter((p) => canDraw(p, input.pool));
  if (!able.length) return [];
  const count = (p: PersonId) => input.presentCounts.get(p) ?? 0;
  const min = Math.min(...able.map(count));
  return able.filter((p) => count(p) === min);
}

/** The evening is over when nobody can draw a foreign submission (pool empty, or only own ones left). */
export function isExhausted(input: DrawInput): boolean {
  return eligiblePresenters(input).length === 0;
}

/** Size of a maximum matching person → foreign submission (Kuhn's augmenting paths; n ≤ ~20). */
export function maxMatching(personIds: PersonId[], pool: PoolItem[]): number {
  const matchOf = new Map<SubmissionId, PersonId>();
  const tryAssign = (p: PersonId, seen: Set<SubmissionId>): boolean => {
    for (const s of pool) {
      if (!canTake(p, s) || seen.has(s.id)) continue;
      seen.add(s.id);
      const holder = matchOf.get(s.id);
      if (holder === undefined || tryAssign(holder, seen)) {
        matchOf.set(s.id, p);
        return true;
      }
    }
    return false;
  };
  let size = 0;
  for (const p of personIds) if (tryAssign(p, new Set())) size++;
  return size;
}

function pickRandom<T>(items: T[], rng: Rng): T {
  return items[Math.min(items.length - 1, Math.floor(rng() * items.length))]!;
}

/**
 * Among the given pairs keep those after which the rest of the lap still has the largest
 * possible matching, then pick one at random (D17).
 */
function bestPair(pairs: DrawChoice[], lap: PersonId[], pool: PoolItem[], rng: Rng): DrawChoice {
  let best = -1;
  let bestPairs: DrawChoice[] = [];
  for (const pair of pairs) {
    const score = maxMatching(
      lap.filter((p) => p !== pair.presenterId),
      pool.filter((s) => s.id !== pair.submissionId),
    );
    if (score > best) {
      best = score;
      bestPairs = [pair];
    } else if (score === best) {
      bestPairs.push(pair);
    }
  }
  return pickRandom(bestPairs, rng);
}

/** Wheel mode (R42): presenter and submission are chosen together. */
export function chooseWheel(input: DrawInput, rng: Rng = Math.random): DrawChoice | { error: DrawError } {
  if (!input.pool.length) return { error: 'NO_SUBMISSIONS_LEFT' };
  const lap = eligiblePresenters(input);
  if (!lap.length) return { error: 'ONLY_OWN_LEFT' };
  const pairs = lap.flatMap((p) =>
    input.pool.filter((s) => canTake(p, s)).map((s) => ({ presenterId: p, submissionId: s.id })),
  );
  return bestPair(pairs, lap, input.pool, rng);
}

/** Manual choice: the presenter is fixed, the submission is chosen to keep the lap solvable. */
export function chooseForPresenter(
  input: DrawInput,
  presenterId: PersonId,
  rng: Rng = Math.random,
): DrawChoice | { error: DrawError } {
  if (!input.personIds.includes(presenterId)) return { error: 'UNKNOWN_PERSON' };
  if (!input.pool.length) return { error: 'NO_SUBMISSIONS_LEFT' };
  if (!canDraw(presenterId, input.pool)) return { error: 'ONLY_OWN_LEFT' };
  const lap = eligiblePresenters(input);
  if (!lap.includes(presenterId)) return { error: 'ALREADY_PRESENTED' };
  const pairs = input.pool.filter((s) => canTake(presenterId, s)).map((s) => ({ presenterId, submissionId: s.id }));
  return bestPair(pairs, lap, input.pool, rng);
}

export function isValidChoice(input: DrawInput, choice: DrawChoice): boolean {
  const item = input.pool.find((s) => s.id === choice.submissionId);
  return !!item && canTake(choice.presenterId, item) && eligiblePresenters(input).includes(choice.presenterId);
}
