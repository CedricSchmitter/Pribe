import type { PersonId, RoundId } from './domain';

export interface LeaderboardEntry {
  personId: PersonId;
  points: number;
  /** Competition ranking: ties share a rank (1, 1, 3, …). */
  rank: number;
}

export const AWARD_KINDS = ['hellseher', 'pokerface', 'blindgaenger', 'herdentier'] as const;
export type AwardKind = (typeof AWARD_KINDS)[number];

export const AWARD_LABELS_DE: Record<AwardKind, { title: string; description: string }> = {
  hellseher: { title: 'Hellseher', description: 'Die meisten Treffer' },
  pokerface: { title: 'Pokerface', description: 'Eigene Präsentation am seltensten erraten' },
  blindgaenger: { title: 'Blindgänger', description: 'Kein einziger Treffer' },
  herdentier: { title: 'Herdentier', description: 'Am häufigsten mit der Mehrheit getippt' },
};

export interface Award {
  kind: AwardKind;
  /** Several winners on a tie; empty when nobody qualifies. */
  winners: PersonId[];
  /** The metric that won, e.g. hits, times guessed, majority guesses. */
  value: number;
}

/** Per-person numbers behind leaderboard and awards, for "x von y" on host and phone. */
export interface PlayerStats {
  personId: PersonId;
  /** Counting guesses in revealed rounds (own presentation excluded). */
  guesses: number;
  hits: number;
  /** Guesses in rounds that had a majority, and how many of them went with it. */
  majorityRounds: number;
  withMajority: number;
  /** Counting guesses on this person's own shown presentation; `null` without one. */
  ownGuessers: number | null;
  ownGuessedRight: number | null;
}

/** One edge of the guess network: `fromId` guessed `toId` `count` times. */
export interface GuessEdge {
  fromId: PersonId;
  toId: PersonId;
  count: number;
  /** How many of those guesses were right. */
  correct: number;
}

export interface RoundSummary {
  roundId: RoundId;
  number: number;
  presenterId: PersonId | null;
  ownerId: PersonId | null;
  avgStars: number | null;
  ratingCount: number;
  correctCount: number;
}

export interface BestPresentation {
  roundId: RoundId;
  ownerId: PersonId | null;
  presenterId: PersonId | null;
  avgStars: number;
  ratingCount: number;
}

export interface FinaleResult {
  /** Sorted best first; the host plays it back from the last place. */
  leaderboard: LeaderboardEntry[];
  awards: Award[];
  guessNetwork: GuessEdge[];
  /** Several entries on a tie. */
  bestPresentations: BestPresentation[];
  rounds: RoundSummary[];
  /** Added by P7; optional so older producers stay valid. */
  stats?: PlayerStats[];
}
