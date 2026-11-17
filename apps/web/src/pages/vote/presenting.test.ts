import { describe, expect, it } from 'vitest';
import type { GamePhase, VoteRoundView } from '@pribe/shared';
import { formatLeft, presentingState } from './presenting';

const round = (over: Partial<VoteRoundView> = {}): VoteRoundView => ({
  id: 1,
  number: 1,
  presenterId: 'ben',
  startedAt: 1000,
  timeLimitEndsAt: 61_000,
  closedAt: null,
  countdownEndsAt: null,
  ...over,
});

describe('presentingState (R82)', () => {
  it('flags only the presenter, from the draw until the round is closed', () => {
    const at = (phase: GamePhase, me: string | null) => presentingState({ phase, me, round: round() });
    expect(at('presenting', 'ben')).toEqual({ timeLimitEndsAt: 61_000, started: true });
    expect(presentingState({ phase: 'drawing', me: 'ben', round: round({ startedAt: null, timeLimitEndsAt: null }) })).toEqual({
      timeLimitEndsAt: null,
      started: false,
    });
    expect(at('presenting', 'anna')).toBeNull();
    expect(at('presenting', null)).toBeNull();
    for (const phase of ['lobby', 'choosePresenter', 'countdown', 'reveal', 'finale'] as const) expect(at(phase, 'ben')).toBeNull();
  });

  it('formats the remaining time', () => {
    expect(formatLeft(65_000)).toBe('1:05');
    expect(formatLeft(400)).toBe('0:01');
    expect(formatLeft(-5)).toBe('0:00');
  });
});
