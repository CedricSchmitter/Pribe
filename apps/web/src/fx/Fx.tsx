import { Fragment, useMemo, type CSSProperties, type ReactNode } from 'react';
import { m as motion } from 'motion/react';
import './fx.css';

/** Rotating light rays behind something big (winner, reveal). Pure CSS so it stays smooth on phones. */
export function Sunburst({ color = '#ffd000', size = '160vmax', speedS = 14 }: { color?: string; size?: string; speedS?: number }) {
  return (
    <div className="fx-sunburst" aria-hidden style={{ '--fx-color': color, '--fx-size': size, '--fx-speed': `${speedS}s` } as CSSProperties}>
      <div className="fx-sunburst-rays" />
    </div>
  );
}

/** Two sweeping stage spotlights (drumroll). */
export function Spotlights() {
  return (
    <div className="fx-spotlights" aria-hidden>
      <div className="fx-spot left" />
      <div className="fx-spot right" />
    </div>
  );
}

function seeded(seed: number): () => number {
  let s = seed || 1;
  return () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
}

/** Lazily drifting emojis in the background of waiting screens. */
export function FloatingEmojis({ emojis, count = 14, seed = 7 }: { emojis: string[]; count?: number; seed?: number }) {
  const items = useMemo(() => {
    const rnd = seeded(seed);
    return Array.from({ length: count }, (_, i) => ({
      emoji: emojis[i % emojis.length],
      left: rnd() * 100,
      size: 1.4 + rnd() * 2.2,
      dur: 9 + rnd() * 10,
      delay: -rnd() * 18,
      sway: (rnd() - 0.5) * 80,
    }));
  }, [emojis.join(''), count, seed]);
  return (
    <div className="fx-floaters" aria-hidden>
      {items.map((it, i) => (
        <span
          key={i}
          className="fx-floater"
          style={
            {
              left: `${it.left}%`,
              fontSize: `${it.size}em`,
              animationDuration: `${it.dur}s`,
              animationDelay: `${it.delay}s`,
              '--fx-sway': `${it.sway}px`,
            } as CSSProperties
          }
        >
          {it.emoji}
        </span>
      ))}
    </div>
  );
}

/** Expanding ring, e.g. where something lands. */
export function Shockwave({ color = '#ffd000', delay = 0, size = '60vmin' }: { color?: string; delay?: number; size?: string }) {
  return (
    <motion.div
      className="fx-shockwave"
      aria-hidden
      style={{ borderColor: color, width: size, height: size }}
      initial={{ scale: 0, opacity: 1 }}
      animate={{ scale: 3, opacity: 0 }}
      transition={{ duration: 0.9, delay, ease: 'easeOut' }}
    />
  );
}

/** Diagonal yellow swoosh across the screen; replays whenever `trigger` changes. */
export function PhaseWipe({ trigger }: { trigger: string }) {
  return (
    <motion.div
      key={trigger}
      className="fx-wipe"
      aria-hidden
      initial={{ x: '-130%' }}
      animate={{ x: '130%' }}
      transition={{ duration: 0.75, ease: [0.7, 0, 0.3, 1] }}
    >
      <span />
      <span />
    </motion.div>
  );
}

/** Theatre curtain that opens over the stage: „Bühne frei!“ */
export function Curtain({ title = 'Bühne frei!' }: { title?: string }) {
  return (
    <div className="fx-curtain" aria-hidden>
      <motion.div className="fx-curtain-panel left" initial={{ x: 0 }} animate={{ x: '-105%' }} transition={{ delay: 1.3, duration: 1.1, ease: [0.6, 0, 0.3, 1] }} />
      <motion.div className="fx-curtain-panel right" initial={{ x: 0 }} animate={{ x: '105%' }} transition={{ delay: 1.3, duration: 1.1, ease: [0.6, 0, 0.3, 1] }} />
      <motion.div
        className="fx-curtain-title"
        initial={{ scale: 0, rotate: -25, opacity: 0 }}
        animate={{ scale: [0, 1.5, 1, 1, 0.2], rotate: [-25, 8, 0, 0, 20], opacity: [0, 1, 1, 1, 0] }}
        transition={{ duration: 1.8, times: [0, 0.2, 0.35, 0.7, 1] }}
      >
        {title}
      </motion.div>
    </div>
  );
}

/** Rubber stamp that slams onto the page. */
export function Stamp({ children, color = 'var(--color-success)', delay = 0 }: { children: ReactNode; color?: string; delay?: number }) {
  return (
    <motion.div
      className="fx-stamp"
      style={{ color, borderColor: color }}
      initial={{ scale: 4, rotate: -40, opacity: 0 }}
      animate={{ scale: 1, rotate: -12, opacity: 1 }}
      transition={{ delay, type: 'spring', stiffness: 500, damping: 14 }}
    >
      {children}
    </motion.div>
  );
}

function words(text: string): { word: string; start: number }[] {
  const out: { word: string; start: number }[] = [];
  let start = 0;
  for (const word of text.split(' ')) {
    if (word) out.push({ word, start });
    start += Array.from(word).length + 1;
  }
  return out;
}

/** Each letter hops in with a bounce, then keeps wobbling. */
export function JumpText({ text, className, delay = 0, loop = true }: { text: string; className?: string; delay?: number; loop?: boolean }) {
  return (
    <span className={`fx-jump ${className ?? ''}`} aria-label={text}>
      {words(text).map(({ word, start }, w) => (
        // Words stay unbreakable groups so long names still wrap between words on small phones.
        <Fragment key={w}>
          {w > 0 && ' '}
          <span className="fx-jump-word" aria-hidden>
            {Array.from(word).map((ch, j) => {
              const i = start + j;
              return (
                <motion.span
                  key={j}
                  initial={{ y: '-1.5em', opacity: 0, rotate: -30 }}
                  animate={{ y: '0em', opacity: 1, rotate: 0 }}
                  transition={{ delay: delay + i * 0.045, type: 'spring', stiffness: 400, damping: 12 }}
                >
                  <span className={loop ? 'fx-jump-wave' : undefined} style={loop ? { animationDelay: `${delay + 0.8 + i * 0.07}s` } : undefined}>
                    {ch}
                  </span>
                </motion.span>
              );
            })}
          </span>
        </Fragment>
      ))}
    </span>
  );
}
