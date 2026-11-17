import type { VoteSnapshot } from '@pribe/shared';

export interface PresentingState {
  /** `null` while the beamer still draws or without a time limit. */
  timeLimitEndsAt: number | null;
  started: boolean;
}

/**
 * R82: set only on the phone of the person presenting, from the draw until the round is closed.
 * Depends on the presenter, never on the owner, so the submitter's phone stays indistinguishable (R52).
 */
export function presentingState(s: Pick<VoteSnapshot, 'phase' | 'me' | 'round'>): PresentingState | null {
  if (s.phase !== 'drawing' && s.phase !== 'presenting') return null;
  if (!s.me || !s.round || s.round.presenterId !== s.me) return null;
  return { timeLimitEndsAt: s.round.timeLimitEndsAt, started: s.round.startedAt !== null };
}

export function formatLeft(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}
