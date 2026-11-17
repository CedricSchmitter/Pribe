import type { GuessTally, LeaderboardEntry, MyVote, Person, PersonId, RevealOutcome, RevealResult } from '@pribe/shared';
import type { RoundRecord, VoteRecord } from '../db';

/** Votes that count: the owner's dummy vote never does (R52, R60, D07, D16). */
export function countingVotes(votes: VoteRecord[], ownerId: PersonId | null): VoteRecord[] {
  return votes.filter((v) => v.voterId !== ownerId);
}

export function computeReveal(round: RoundRecord, votes: VoteRecord[], ownerId: PersonId): RevealResult {
  const counting = countingVotes(votes, ownerId);
  const tallyMap = new Map<PersonId, number>();
  for (const v of counting) {
    if (v.guessPersonId) tallyMap.set(v.guessPersonId, (tallyMap.get(v.guessPersonId) ?? 0) + 1);
  }
  const tally: GuessTally[] = [...tallyMap]
    .map(([personId, count]) => ({ personId, count }))
    .sort((a, b) => b.count - a.count || a.personId.localeCompare(b.personId));
  const ratings = counting.map((v) => v.stars).filter((s): s is number => s !== null);
  return {
    roundId: round.id,
    ownerId,
    presenterId: round.presenterId ?? '',
    tally,
    correctVoterIds: counting.filter((v) => v.guessPersonId === ownerId).map((v) => v.voterId),
    avgStars: ratings.length ? ratings.reduce((a, b) => a + b, 0) / ratings.length : null,
    ratingCount: ratings.length,
  };
}

export function outcomeFor(personId: PersonId, ownerId: PersonId, vote: MyVote | null): RevealOutcome {
  if (personId === ownerId) return 'owner';
  if (!vote?.guessPersonId) return 'noGuess';
  return vote.guessPersonId === ownerId ? 'correct' : 'wrong';
}

/** 1 point per correct guess over all revealed rounds (D08); competition ranking. */
export function computeLeaderboard(persons: Person[], rounds: RoundRecord[], votes: VoteRecord[]): LeaderboardEntry[] {
  const ownerByRound = new Map(rounds.filter((r) => r.revealedAt !== null).map((r) => [r.id, r.revealedOwnerId]));
  const points = new Map<PersonId, number>(persons.map((p) => [p.id, 0]));
  for (const v of votes) {
    const owner = ownerByRound.get(v.roundId);
    if (!owner || v.voterId === owner || v.guessPersonId !== owner || !points.has(v.voterId)) continue;
    points.set(v.voterId, points.get(v.voterId)! + 1);
  }
  const name = new Map(persons.map((p) => [p.id, p.name]));
  const sorted = [...points]
    .map(([personId, pts]) => ({ personId, points: pts }))
    .sort((a, b) => b.points - a.points || name.get(a.personId)!.localeCompare(name.get(b.personId)!));
  return sorted.map((e) => ({ ...e, rank: 1 + sorted.filter((o) => o.points > e.points).length }));
}
