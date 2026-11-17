import { useEffect, useMemo, type CSSProperties } from 'react';
import { motion } from 'motion/react';
import type { Person } from '@pribe/shared';
import { emojiRain, fireworks, JumpText } from '../../fx';
import { Avatar } from '../Avatar';

function seeded(seed: number): () => number {
  let s = seed || 1;
  return () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
}

/** Avatar edge in px so that everyone fits on a 1920×1080 beamer in a few rows. */
function tileSize(count: number): number {
  if (count <= 6) return 220;
  if (count <= 12) return 170;
  if (count <= 20) return 135;
  return 105;
}

/** R86: every avatar flies onto a wobbling polaroid wall, „Danke fürs Mitmachen“ on top. */
export function PhotoWall({ persons, onRestart }: { persons: Person[]; onRestart(): void }) {
  const size = tileSize(persons.length);
  const tiles = useMemo(() => {
    const rnd = seeded(persons.length * 7919 + 13);
    return persons.map((p) => ({
      person: p,
      tilt: (rnd() - 0.5) * 18,
      fromX: (rnd() - 0.5) * 2400,
      fromY: (rnd() < 0.5 ? -1 : 1) * (700 + rnd() * 500),
      spin: (rnd() - 0.5) * 900,
      bob: 6 + rnd() * 10,
      period: 2.2 + rnd() * 1.6,
    }));
  }, [persons]);
  const lastLanding = 0.4 + persons.length * 0.12 + 0.8;

  // Once per visit of the station; a snapshot update must not restart the fireworks.
  useEffect(() => {
    const t1 = setTimeout(() => fireworks([...persons.map((p) => p.color), '#ffd000', '#ffffff'], 7000), lastLanding * 1000);
    const t2 = setTimeout(() => emojiRain(['💛', '🎉', ...persons.map((p) => p.emoji).slice(0, 6)], 4000), (lastLanding + 1) * 1000);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, []);

  return (
    <div className="finale-wall-wrap">
      <ul className="finale-wall" role="list" aria-label="Alle, die mitgespielt haben" style={{ '--wall-tile': `${size}px` } as CSSProperties}>
        {tiles.map((t, i) => (
          <motion.li
            key={t.person.id}
            className="finale-wall-tile"
            style={{ '--wall-color': t.person.color } as CSSProperties}
            initial={{ x: t.fromX, y: t.fromY, rotate: t.spin, scale: 0.2, opacity: 0 }}
            animate={{ x: 0, y: 0, rotate: t.tilt, scale: 1, opacity: 1 }}
            transition={{ delay: 0.4 + i * 0.12, type: 'spring', stiffness: 70, damping: 11 }}
          >
            <motion.div
              className="finale-wall-card"
              animate={{ y: [0, -t.bob, 0], rotate: [0, t.tilt > 0 ? 3 : -3, 0] }}
              transition={{ repeat: Infinity, duration: t.period, delay: lastLanding + (i % 5) * 0.2, ease: 'easeInOut' }}
            >
              <Avatar person={t.person} size={size} />
              <span className="finale-wall-name">{t.person.name}</span>
            </motion.div>
          </motion.li>
        ))}
      </ul>
      <motion.div
        className="finale-wall-thanks"
        initial={{ scale: 0, rotate: -12, opacity: 0 }}
        animate={{ scale: 1, rotate: -3, opacity: 1 }}
        transition={{ delay: lastLanding, type: 'spring', bounce: 0.55 }}
      >
        <JumpText text="Danke fürs Mitmachen!" className="finale-hero" delay={lastLanding + 0.2} />
        <p className="finale-sub">Pribe · PowerPoint-Karaoke mit Ratespiel</p>
      </motion.div>
      <motion.button
        type="button"
        className="host-big-button finale-wall-restart"
        onClick={onRestart}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: lastLanding + 1.5 }}
      >
        🔁 Finale nochmal von vorn
      </motion.button>
    </div>
  );
}
