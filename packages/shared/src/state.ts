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
  /** R84: talk average without the presenter's own stars; the owner's talk stars count. */
  avgTalkStars: number | null;
  talkRatingCount: number;
}

export const REVEAL_OUTCOMES = ['correct', 'wrong', 'noGuess', 'owner'] as const;
/** Only sent once the round is revealed. */
export type RevealOutcome = (typeof REVEAL_OUTCOMES)[number];

export interface MyVote {
  roundId: RoundId;
  guessPersonId: PersonId | null;
  stars: number | null;
  talkStars: number | null;
}

/** R90: surprise guest after the finale; not a player, so no id that votes or scores could use. */
export interface GuestView {
  name: string;
  emoji: string;
  color: string;
  photoUrl: string | null;
  /** `null` during the reveal; the talk has no time limit. */
  presentingSince: EpochMs | null;
}

export interface HostGuestView extends GuestView {
  presentation: { id: SubmissionId; kind: SubmissionKind; url: string };
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
  /** R83: a test run with bots in a separate database; real phones only see a hint. */
  probe: boolean;
  /** Only set in phase `guest`. */
  guest: GuestView | null;
}

export interface HostSnapshot extends SnapshotBase {
  role: 'host';
  /** Persons with at least one connected phone (lobby, R40). */
  connectedPersonIds: PersonId[];
  round: HostRoundView | null;
  /**
   * Current finale station, kept by the host namespace so beamer and remote stay in sync (R80).
   * The client clamps it to its station list; 0 outside the finale.
   */
  finaleStep?: number;
  /** Only set in phase `guest`. */
  guest: HostGuestView | null;
  /**
   * R90: the guest is switched on, has a name and a ready presentation, so „Weiter“ on the
   * finale's last station brings the guest on. Host only, the phones must not see it coming.
   */
  guestReady: boolean;
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
