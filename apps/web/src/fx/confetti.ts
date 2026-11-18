import type confettiFn from 'canvas-confetti';

type Confetti = typeof confettiFn;
type Origin = { x: number; y: number };

// Loaded on first use so canvas-confetti stays out of the entry bundle.
let loading: Promise<Confetti> | undefined;
export function loadConfetti(): Promise<Confetti> {
  loading ??= import('canvas-confetti').then(
    (m) => m.default,
    (err: unknown) => {
      // A failed chunk load (flaky Wi-Fi) must not disable confetti until the next reload.
      loading = undefined;
      throw err;
    },
  );
  return loading;
}

/** Confetti is decoration: without the chunk the effect is simply skipped. */
export function withConfetti(run: (confetti: Confetti) => void) {
  loadConfetti().then(run, () => {});
}

export function burst(origin: Origin = { x: 0.5, y: 0.6 }, colors?: string[]) {
  withConfetti((confetti) => void confetti({ particleCount: 160, spread: 100, startVelocity: 45, origin, colors }));
}

// shapeFromText renders to a canvas, so build each emoji shape once and reuse it.
const shapeCache = new Map<string, confettiFn.Shape>();
function emojiShape(confetti: Confetti, emoji: string): confettiFn.Shape {
  let s = shapeCache.get(emoji);
  if (!s) {
    s = confetti.shapeFromText({ text: emoji, scalar: 3 });
    shapeCache.set(emoji, s);
  }
  return s;
}

/** Confetti made of emojis (avatars, reactions, 🍅 for the wrong guess …). */
export function emojiBurst(emojis: string[], origin: Origin = { x: 0.5, y: 0.5 }, count = 40) {
  if (emojis.length === 0) return;
  withConfetti(
    (confetti) =>
      void confetti({
        particleCount: count,
        spread: 120,
        startVelocity: 50,
        gravity: 0.9,
        ticks: 220,
        flat: true,
        scalar: 3,
        origin,
        shapes: emojis.map((e) => emojiShape(confetti, e)),
      }),
  );
}

/** Emojis raining from the top edge for `durationMs`. */
export function emojiRain(emojis: string[], durationMs = 2000) {
  if (emojis.length === 0) return;
  withConfetti((confetti) => {
    const shapes = emojis.map((e) => emojiShape(confetti, e));
    const end = Date.now() + durationMs;
    const drop = () => {
      void confetti({
        particleCount: 3,
        angle: 270,
        spread: 30,
        startVelocity: 8,
        gravity: 1.2,
        ticks: 260,
        flat: true,
        scalar: 3,
        origin: { x: Math.random(), y: -0.1 },
        shapes,
      });
      if (Date.now() < end) setTimeout(drop, 90);
    };
    drop();
  });
}

/** Two cannons from the bottom corners. */
export function sideCannons(colors?: string[], durationMs = 1500) {
  withConfetti((confetti) => {
    const end = Date.now() + durationMs;
    const frame = () => {
      void confetti({ particleCount: 8, angle: 60, spread: 60, startVelocity: 70, origin: { x: 0, y: 0.85 }, colors });
      void confetti({ particleCount: 8, angle: 120, spread: 60, startVelocity: 70, origin: { x: 1, y: 0.85 }, colors });
      if (Date.now() < end) setTimeout(frame, 60);
    };
    frame();
  });
}

/** Rockets that burst at random spots, for `durationMs`. */
export function fireworks(colors: string[], durationMs = 4000) {
  withConfetti((confetti) => {
    const end = Date.now() + durationMs;
    const rocket = () => {
      const origin = { x: 0.1 + Math.random() * 0.8, y: 0.15 + Math.random() * 0.4 };
      void confetti({ particleCount: 90, spread: 360, startVelocity: 32, gravity: 0.8, ticks: 140, origin, colors, scalar: 1.1 });
      if (Date.now() < end) setTimeout(rocket, 220 + Math.random() * 260);
    };
    rocket();
    void confetti({ particleCount: 160, angle: 60, spread: 70, origin: { x: 0, y: 0.9 }, colors, startVelocity: 70 });
    void confetti({ particleCount: 160, angle: 120, spread: 70, origin: { x: 1, y: 0.9 }, colors, startVelocity: 70 });
  });
}
