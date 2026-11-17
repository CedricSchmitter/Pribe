import type { EpochMs, PersonId, ReactionEmoji } from './domain';
import type { Ack } from './errors';
import type { CastVotePayload, DrawPayload, IdentifyPayload, ReactionPayload } from './schemas';
import type { HostSnapshot, MyVote, VoteSnapshot } from './state';

/** `/host` needs the admin session cookie in the handshake; `/vote` is open. */
export const SOCKET_NAMESPACES = {
  host: '/host',
  vote: '/vote',
} as const;

export type AckFn<T = void> = (res: Ack<T>) => void;

export interface ReactionEvent {
  /** Unique per reaction so clients can key animations. */
  id: string;
  emoji: ReactionEmoji;
  personId: PersonId | null;
  at: EpochMs;
}

export interface WheelSpunEvent {
  candidateIds: PersonId[];
  presenterId: PersonId;
}

// ---- Host (Beamer) ----

export interface HostClientToServerEvents {
  'state:request': (ack: AckFn<HostSnapshot>) => void;
  /** Lobby → choosePresenter; closes uploads (D16). */
  'game:start': (ack: AckFn) => void;
  /** Wheel mode (R42): server picks presenter and reserves a valid submission (D17). */
  'presenter:spin': (ack: AckFn<WheelSpunEvent>) => void;
  /** Draws a foreign submission for the presenter; may fail with `ONLY_OWN_LEFT`. */
  'round:draw': (payload: DrawPayload, ack: AckFn) => void;
  /** Draw animation finished: presentation starts, voting opens. */
  'round:start': (ack: AckFn) => void;
  /** Removes the presentation from the pool and starts the vote countdown. */
  'round:close': (ack: AckFn) => void;
  /** reveal → choosePresenter */
  'round:next': (ack: AckFn) => void;
  'finale:start': (ack: AckFn) => void;
}

export interface HostServerToClientEvents {
  /** Full state after every change and after (re)connect. */
  state: (snapshot: HostSnapshot) => void;
  reaction: (event: ReactionEvent) => void;
  'wheel:spun': (event: WheelSpunEvent) => void;
}

export interface HostSocketData {
  role: 'host';
}

// ---- Vote (Handy) ----

export interface VoteClientToServerEvents {
  'state:request': (ack: AckFn<VoteSnapshot>) => void;
  'vote:identify': (payload: IdentifyPayload, ack: AckFn) => void;
  /** The owner's vote is accepted like any other and silently ignored in scoring (R52). */
  'vote:cast': (payload: CastVotePayload, ack: AckFn<MyVote>) => void;
  'reaction:send': (payload: ReactionPayload, ack: AckFn) => void;
}

export interface VoteServerToClientEvents {
  /** Full state after every change and after (re)connect. */
  state: (snapshot: VoteSnapshot) => void;
}

export interface VoteSocketData {
  role: 'vote';
  personId: PersonId | null;
}

export type InterServerEvents = Record<string, never>;
