import type {
  Award,
  BestPresentation,
  FinaleResult,
  GuessEdge,
  Person,
  PersonId,
  PlayerStats,
  RoundSummary,
} from '@pribe/shared';
import type { Repositories, RoundRecord, VoteRecord } from '../db';
import { computeLeaderboard } from './scoring';

/*
 * Award rules (R63), all over revealed rounds only and without the owner's dummy vote (D07):
 * - Hellseher: most hits; needs at least one hit. Ties: all share it.
 * - Pokerface: own shown presentation guessed right least often (absolute count). Only
 *   persons whose presentation was shown and got at least one counting guess. Ties: all.
 * - Blindgänger: 0 hits with at least one guess (nobody who never tipped). Ties: all.
 * - Herdentier: most guesses that matched the round's majority; needs at least one.
 *   A round has a majority when one person got strictly the most guesses, and at least
 *   two of them — a lone guess is not a herd. Ties: all.
 * An award nobody qualifies for has no winners.
 */

interface RevealedRound {
  round: RoundRecord;
  ownerId: PersonId;
  /** Votes with a guess that count: no owner's dummy vote, known voter and guess. */
  guesses: VoteRecord[];
  /** Ratings that count (D16). */
  stars: number[];
}

function revealedRounds(persons: Person[], rounds: RoundRecord[], votes: VoteRecord[]): RevealedRound[] {
  const known = new Set(persons.map((p) => p.id));
  return rounds
    .filter((r) => r.revealedAt !== null && r.revealedOwnerId !== null)
    .map((round) => {
      const ownerId = round.revealedOwnerId!;
      const counting = votes.filter((v) => v.roundId === round.id && v.voterId !== ownerId && known.has(v.voterId));
      return {
        round,
        ownerId,
        guesses: counting.filter((v) => v.guessPersonId !== null && known.has(v.guessPersonId)),
        stars: counting.map((v) => v.stars).filter((s): s is number => s !== null),
      };
    });
}

/** The person with strictly the most guesses (at least two), else `null`. */
export function majorityOf(guesses: VoteRecord[]): PersonId | null {
  const counts = new Map<PersonId, number>();
  for (const v of guesses) counts.set(v.guessPersonId!, (counts.get(v.guessPersonId!) ?? 0) + 1);
  const sorted = [...counts].sort((a, b) => b[1] - a[1]);
  const [top, second] = sorted;
  if (!top || top[1] < 2 || (second && second[1] === top[1])) return null;
  return top[0];
}

function computeStats(persons: Person[], revealed: RevealedRound[]): PlayerStats[] {
  const stats = new Map<PersonId, PlayerStats>(
    persons.map((p) => [
      p.id,
      { personId: p.id, guesses: 0, hits: 0, majorityRounds: 0, withMajority: 0, ownGuessers: null, ownGuessedRight: null },
    ]),
  );
  for (const r of revealed) {
    const majority = majorityOf(r.guesses);
    let right = 0;
    for (const v of r.guesses) {
      const s = stats.get(v.voterId)!;
      s.guesses++;
      if (v.guessPersonId === r.ownerId) {
        s.hits++;
        right++;
      }
      if (majority) {
        s.majorityRounds++;
        if (v.guessPersonId === majority) s.withMajority++;
      }
    }
    const owner = stats.get(r.ownerId);
    if (owner) {
      owner.ownGuessers = (owner.ownGuessers ?? 0) + r.guesses.length;
      owner.ownGuessedRight = (owner.ownGuessedRight ?? 0) + right;
    }
  }
  return [...stats.values()];
}

function pick(kind: Award['kind'], candidates: PlayerStats[], metric: (s: PlayerStats) => number, best: 'max' | 'min'): Award {
  if (candidates.length === 0) return { kind, winners: [], value: 0 };
  const values = candidates.map(metric);
  const value = best === 'max' ? Math.max(...values) : Math.min(...values);
  return { kind, winners: candidates.filter((s) => metric(s) === value).map((s) => s.personId), value };
}

export function computeAwards(stats: PlayerStats[]): Award[] {
  const hellseher = pick('hellseher', stats.filter((s) => s.hits > 0), (s) => s.hits, 'max');
  const pokerface = pick('pokerface', stats.filter((s) => (s.ownGuessers ?? 0) > 0), (s) => s.ownGuessedRight!, 'min');
  const blindgaenger = pick('blindgaenger', stats.filter((s) => s.guesses > 0 && s.hits === 0), () => 0, 'max');
  const herdentier = pick('herdentier', stats.filter((s) => s.withMajority > 0), (s) => s.withMajority, 'max');
  return [hellseher, pokerface, blindgaenger, herdentier];
}

export function computeGuessNetwork(revealed: RevealedRound[]): GuessEdge[] {
  const edges = new Map<string, GuessEdge>();
  for (const r of revealed) {
    for (const v of r.guesses) {
      const key = `${v.voterId}>${v.guessPersonId}`;
      const e = edges.get(key) ?? { fromId: v.voterId, toId: v.guessPersonId!, count: 0, correct: 0 };
      e.count++;
      if (v.guessPersonId === r.ownerId) e.correct++;
      edges.set(key, e);
    }
  }
  return [...edges.values()].sort((a, b) => b.count - a.count || a.fromId.localeCompare(b.fromId) || a.toId.localeCompare(b.toId));
}

function computeRoundSummaries(revealed: RevealedRound[]): RoundSummary[] {
  return revealed.map((r) => ({
    roundId: r.round.id,
    number: r.round.number,
    presenterId: r.round.presenterId,
    ownerId: r.ownerId,
    avgStars: r.stars.length ? r.stars.reduce((a, b) => a + b, 0) / r.stars.length : null,
    ratingCount: r.stars.length,
    correctCount: r.guesses.filter((v) => v.guessPersonId === r.ownerId).length,
  }));
}

/** Highest average (R65); a tie goes to more ratings, a remaining tie is shared. */
export function computeBestPresentations(rounds: RoundSummary[]): BestPresentation[] {
  const rated = rounds.filter((r): r is RoundSummary & { avgStars: number } => r.avgStars !== null);
  if (rated.length === 0) return [];
  // Averages are compared as fractions so 4.1 vs 4.1 never splits on float noise.
  const sum = (r: RoundSummary & { avgStars: number }) => Math.round(r.avgStars * r.ratingCount);
  const cmp = (a: (typeof rated)[number], b: (typeof rated)[number]) =>
    sum(b) * a.ratingCount - sum(a) * b.ratingCount || b.ratingCount - a.ratingCount;
  const sorted = [...rated].sort(cmp);
  return sorted
    .filter((r) => cmp(r, sorted[0]!) === 0)
    .map((r) => ({ roundId: r.roundId, ownerId: r.ownerId, presenterId: r.presenterId, avgStars: r.avgStars, ratingCount: r.ratingCount }));
}

export function buildFinale(persons: Person[], rounds: RoundRecord[], votes: VoteRecord[]): FinaleResult {
  const revealed = revealedRounds(persons, rounds, votes);
  const stats = computeStats(persons, revealed);
  const summaries = computeRoundSummaries(revealed);
  return {
    leaderboard: computeLeaderboard(persons, rounds, votes),
    awards: computeAwards(stats),
    guessNetwork: computeGuessNetwork(revealed),
    bestPresentations: computeBestPresentations(summaries),
    rounds: summaries,
    stats,
  };
}

/** Leaderboard, awards, guess network and best presentation from revealed rounds (P7). */
export function computeFinale(repos: Repositories): FinaleResult {
  return buildFinale(repos.persons.list(), repos.rounds.list(), repos.votes.listAll());
}
