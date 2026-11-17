let ctx: AudioContext | null = null;

function audio(): AudioContext {
  ctx ??= new AudioContext();
  return ctx;
}

/** Call from a click: browsers only start audio after a user gesture. */
export function unlockAudio(): void {
  void audio().resume();
}

export function audioReady(): boolean {
  return ctx?.state === 'running';
}

/** Inharmonic partials of a large tam-tam-like gong. */
const PARTIALS: [ratio: number, gain: number, decayS: number][] = [
  [1, 0.6, 6],
  [1.48, 0.35, 4.5],
  [2.03, 0.25, 3.5],
  [2.74, 0.18, 2.8],
  [3.51, 0.12, 2],
  [4.9, 0.08, 1.2],
];

function strike(ac: AudioContext, when: number): AudioNode[] {
  const out = ac.createGain();
  out.gain.value = 0.9;
  out.connect(ac.destination);
  const nodes: AudioNode[] = [out];
  const base = 98;
  for (const [ratio, gain, decay] of PARTIALS) {
    const osc = ac.createOscillator();
    const g = ac.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(base * ratio * 1.02, when);
    osc.frequency.exponentialRampToValueAtTime(base * ratio, when + 0.4);
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(gain, when + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, when + decay);
    osc.connect(g).connect(out);
    osc.start(when);
    osc.stop(when + decay + 0.1);
    nodes.push(osc, g);
  }
  return nodes;
}

/**
 * Plays the gong at server time `atMs`. Scheduled on the audio clock rather than with a
 * timer: while PowerPoint covers the browser, Chrome throttles background timers (down to
 * once a minute), but audio scheduled in advance still plays on time (D23).
 */
export function scheduleGong(atMs: number, serverNow: () => number): () => void {
  const ac = audio();
  const delayS = (atMs - serverNow()) / 1000;
  if (delayS < -2) return () => {};
  const nodes = strike(ac, ac.currentTime + Math.max(0, delayS));
  return () => {
    for (const n of nodes) {
      if (n instanceof OscillatorNode) {
        try {
          n.stop();
        } catch {
          /* not started yet or already stopped */
        }
      }
      n.disconnect();
    }
  };
}

export function playGongNow(): void {
  const ac = audio();
  strike(ac, ac.currentTime);
}
