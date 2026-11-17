import { describe, expect, it } from 'vitest';
import { createComboDetector } from './combo';

const ids = () => {
  let n = 0;
  return () => `c${++n}`;
};

describe('createComboDetector (R85)', () => {
  it('fires at the 5th equal emoji within 3 s, not at the 4th', () => {
    const d = createComboDetector({ newId: ids() });
    for (const t of [0, 500, 1000, 1500]) expect(d.add('🔥', t)).toBeNull();
    expect(d.add('🔥', 2999)).toEqual({ id: 'c1', emoji: '🔥', count: 5, at: 2999 });
  });

  it('ignores emojis older than the window', () => {
    const d = createComboDetector({ newId: ids() });
    for (const t of [0, 1000, 2000, 2500]) expect(d.add('🔥', t)).toBeNull();
    // At 3000 the first one is exactly 3 s old and drops out: only 4 in the window.
    expect(d.add('🔥', 3000)).toBeNull();
    expect(d.add('🔥', 3100)).toMatchObject({ count: 5 });
  });

  it('does not mix different emojis', () => {
    const d = createComboDetector({ newId: ids() });
    for (const [i, e] of (['🔥', '😂', '🔥', '😂', '🔥', '😂', '🔥', '😂'] as const).entries()) expect(d.add(e, i * 100)).toBeNull();
    expect(d.add('🔥', 900)).toMatchObject({ emoji: '🔥', count: 5 });
  });

  it('counts a running streak up under the same id and starts a new one after a pause', () => {
    const d = createComboDetector({ newId: ids() });
    for (let i = 0; i < 4; i++) d.add('👏', i * 100);
    expect(d.add('👏', 400)).toMatchObject({ id: 'c1', count: 5 });
    expect(d.add('👏', 2000)).toMatchObject({ id: 'c1', count: 6 });
    // The streak goes on while each one follows within 3 s, even past the first window.
    expect(d.add('👏', 4500)).toMatchObject({ id: 'c1', count: 7 });
    // Pause of 3 s: streak over, the window holds only this one.
    expect(d.add('👏', 7500)).toBeNull();
    for (const t of [7600, 7700, 7800]) expect(d.add('👏', t)).toBeNull();
    expect(d.add('👏', 7900)).toMatchObject({ id: 'c2', count: 5 });
  });
});
