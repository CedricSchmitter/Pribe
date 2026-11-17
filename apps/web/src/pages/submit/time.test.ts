import { describe, expect, it } from 'vitest';
import { formatRemaining, fromLocalInput, toLocalInput } from './time';

describe('formatRemaining', () => {
  it('formats minutes, hours and days', () => {
    expect(formatRemaining(65_000)).toBe('01:05');
    expect(formatRemaining(3_725_000)).toBe('01:02:05');
    expect(formatRemaining(2 * 86_400_000 + 5_000)).toBe('2 T 00:00:05');
    expect(formatRemaining(-1)).toBe('00:00');
  });
});

describe('datetime-local round trip', () => {
  it('keeps minutes and maps empty to null', () => {
    const ms = new Date(2026, 11, 1, 18, 30).getTime();
    expect(toLocalInput(ms)).toBe('2026-12-01T18:30');
    expect(fromLocalInput(toLocalInput(ms))).toBe(ms);
    expect(toLocalInput(null)).toBe('');
    expect(fromLocalInput('')).toBeNull();
    expect(fromLocalInput('kaputt')).toBeNull();
  });
});
