/** Random UUID assigned by the server. */
export type PersonId = string;
/** Random UUID; never derived from the submitting person. */
export type SubmissionId = string;
export type RoundId = number;
/** Milliseconds since epoch (server clock). */
export type EpochMs = number;

export interface Person {
  id: PersonId;
  name: string;
  emoji: string;
  /** CSS color, e.g. `#ff3366`. */
  color: string;
  /** Public photo avatar (D27); `null` falls back to emoji on color. */
  photoUrl: string | null;
}

/** A PPTX stays `converting` until its author metadata is cleared, then the host opens it in PowerPoint. */
export const SUBMISSION_KINDS = ['html', 'pptx'] as const;
export type SubmissionKind = (typeof SUBMISSION_KINDS)[number];

export const SUBMISSION_STATUSES = ['converting', 'ready', 'failed'] as const;
export type SubmissionStatus = (typeof SUBMISSION_STATUSES)[number];

/**
 * Lobby → choosePresenter (manual or wheel) → drawing → presenting (voting open)
 * → countdown (voting still open) → reveal → choosePresenter … → finale → guest (R90, optional).
 */
export const GAME_PHASES = [
  'lobby',
  'choosePresenter',
  'drawing',
  'presenting',
  'countdown',
  'reveal',
  'finale',
  'guest',
] as const;
export type GamePhase = (typeof GAME_PHASES)[number];

export interface GameSettings {
  /** Upload deadline; `null` = open until the game starts. */
  submissionDeadline: EpochMs | null;
  /** Talk time limit in seconds; 0 = off. */
  talkTimeLimitS: number;
  /** Voting countdown after the presentation is closed. */
  voteCountdownS: number;
  /** Self-registration code (D27); `null` = registration closed. Admin and host only. */
  inviteCode: string | null;
}

export const DEFAULT_SETTINGS: GameSettings = {
  submissionDeadline: null,
  talkTimeLimitS: 0,
  voteCountdownS: 20,
  inviteCode: null,
};

/** Photo avatars (D27): the client sends a ~256 px square JPEG; the server caps the size. */
export const AVATAR_MAX_BYTES = 512 * 1024;
export const AVATAR_SIZE_PX = 256;

export const STARS_MIN = 1;
export const STARS_MAX = 5;

export const REACTION_EMOJIS = ['🔥', '😂', '👏', '🍅'] as const;
export type ReactionEmoji = (typeof REACTION_EMOJIS)[number];

export const DEFAULT_MAX_UPLOAD_MB = 100;
export const ACCEPTED_UPLOAD_EXTENSIONS = ['.html', '.htm', '.pptx'] as const;
