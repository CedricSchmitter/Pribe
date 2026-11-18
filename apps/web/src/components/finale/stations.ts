import { AWARD_KINDS, type AwardKind, type FinaleResult, type LeaderboardEntry } from '@pribe/shared';

export type FinaleStation =
  | { kind: 'intro' }
  | { kind: 'board' }
  | { kind: 'podium'; reveal: number }
  | { kind: 'award'; award: AwardKind }
  | { kind: 'network' }
  | { kind: 'best' }
  | { kind: 'wall' };

export function podiumGroups(board: LeaderboardEntry[]): LeaderboardEntry[][] {
  // Ranks are competition ranks, so ties put several people on one step.
  return [3, 2, 1].map((rank) => board.filter((e) => e.rank === rank)).filter((g) => g.length > 0);
}

/**
 * Also used by the remote (R80) to show progress and disable "Weiter" at the end.
 * Kept apart from FinaleShow so the remote does not pull the finale chunk.
 */
export function stationsFor(f: FinaleResult): FinaleStation[] {
  const groups = podiumGroups(f.leaderboard);
  return [
    { kind: 'intro' },
    ...(f.leaderboard.some((e) => e.rank > 3) ? [{ kind: 'board' } as const] : []),
    ...Array.from({ length: groups.length + 1 }, (_, reveal) => ({ kind: 'podium', reveal }) as const),
    ...AWARD_KINDS.map((award) => ({ kind: 'award', award }) as const),
    { kind: 'network' },
    { kind: 'best' },
    // Thank-you page with the photo wall (R86).
    { kind: 'wall' },
  ];
}
