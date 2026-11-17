import { COMBO_THRESHOLD, COMBO_WINDOW_MS, type ComboEvent, type ReactionEmoji } from '@pribe/shared';

/**
 * Emoji combo (R85) over all phones together. A streak starts once `threshold` equal emojis
 * fall into one `windowMs` window; it goes on, counting up, while the next one of that emoji
 * follows within `windowMs`. Every reaction inside a streak returns the updated event.
 */
export function createComboDetector(opts: { threshold?: number; windowMs?: number; newId?: () => string } = {}) {
  const threshold = opts.threshold ?? COMBO_THRESHOLD;
  const windowMs = opts.windowMs ?? COMBO_WINDOW_MS;
  let seq = 0;
  const newId = opts.newId ?? (() => `combo-${Date.now()}-${++seq}`);
  const recent = new Map<ReactionEmoji, number[]>();
  const streaks = new Map<ReactionEmoji, { id: string; count: number; lastAt: number }>();

  return {
    add(emoji: ReactionEmoji, at: number): ComboEvent | null {
      const times = (recent.get(emoji) ?? []).filter((t) => at - t < windowMs);
      times.push(at);
      recent.set(emoji, times);

      const streak = streaks.get(emoji);
      if (streak && at - streak.lastAt < windowMs) {
        streak.count++;
        streak.lastAt = at;
        return { id: streak.id, emoji, count: streak.count, at };
      }
      streaks.delete(emoji);
      if (times.length < threshold) return null;
      const started = { id: newId(), count: times.length, lastAt: at };
      streaks.set(emoji, started);
      return { id: started.id, emoji, count: started.count, at };
    },
  };
}
