import type { EpochMs, GamePhase, GameSettings, Person, PersonId, RoundId, SubmissionId, SubmissionKind } from './domain';
import type { FinaleResult } from './finale';

/*
 * Anonymity rule (R22, R52): nothing sent before `reveal` may depend on who submitted the
 * current presentation — no owner id, no owner hash, no per-client "this is yours" flag,
 * no vote counts that exclude the owner. The owner's phone gets exactly the same data as
 * everyone else's.
 */

export interface RoundViewBase {
  id: RoundId;
  number: number;
  presenterId: PersonId;
  /** Set when the presentation starts; voting opens at the same moment. */
  startedAt: EpochMs | null;
  /** `startedAt + talkTimeLimitS`, or `null` when there is no time limit. */
  timeLimitEndsAt: EpochMs | null;
  closedAt: EpochMs | null;
  countdownEndsAt: EpochMs | null;
}

export interface HostRoundView extends RoundViewBase {
  submission: {
    id: SubmissionId;
    kind: SubmissionKind;
    /** html: loaded in the sandboxed iframe; pptx: download to open in PowerPoint. */
    url: string;
  };
  /** Everyone who has voted, the owner's dummy vote included (see anonymity rule). */
  votedPersonIds: PersonId[];
}

export type VoteRoundView = RoundViewBase;

export interface GuessTally {
  personId: PersonId;
  count: number;
}

export interface RevealResult {
  roundId: RoundId;
  ownerId: PersonId;
  presenterId: PersonId;
  /** Guess distribution without the owner's dummy guess (R60). */
  tally: GuessTally[];
  correctVoterIds: PersonId[];
  /** Average without the owner's own stars (D16); `null` without ratings. */
  avgStars: number | null;
  ratingCount: number;
}

export const REVEAL_OUTCOMES = ['correct', 'wrong', 'noGuess', 'owner'] as const;
/** Only sent once the round is revealed. */
export type RevealOutcome = (typeof REVEAL_OUTCOMES)[number];

export interface MyVote {
  roundId: RoundId;
  guessPersonId: PersonId | null;
  stars: number | null;
}

export interface SnapshotBase {
  phase: GamePhase;
  /** Lets clients correct their clock for countdowns. */
  serverTime: EpochMs;
  persons: Person[];
  settings: Pick<GameSettings, 'talkTimeLimitS' | 'voteCountdownS'>;
  /** Persons who already presented, in order. */
  presentedPersonIds: PersonId[];
  /** Ready submissions not yet shown. */
  poolSize: number;
  /** Rounds played so far, including the current one. */
  roundCount: number;
  reveal: RevealResult | null;
  finale: FinaleResult | null;
}

export interface HostSnapshot extends SnapshotBase {
  role: 'host';
  /** Persons with at least one connected phone (lobby, R40). */
  connectedPersonIds: PersonId[];
  round: HostRoundView | null;
}

export interface VoteSnapshot extends SnapshotBase {
  role: 'vote';
  /** Identity this socket announced via `vote:identify`. */
  me: PersonId | null;
  round: VoteRoundView | null;
  myVote: MyVote | null;
  /** Only set in phase `reveal`. */
  myOutcome: RevealOutcome | null;
}

export type GameSnapshot = HostSnapshot | VoteSnapshot;
