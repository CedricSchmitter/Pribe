import { useEffect, useMemo } from 'react';
import { motion } from 'motion/react';
import type { Person, WheelSpunEvent } from '@pribe/shared';
import { Avatar } from '../../components/Avatar';
import { emojiBurst, flash, shake, Sunburst } from '../../fx';
import { burstConfetti } from '../../lib/confetti';

const SPIN_S = 5.5;
const R = 300;

function slice(i: number, n: number): string {
  if (n === 1) return `M 0 ${-R} A ${R} ${R} 0 1 1 -0.01 ${-R} Z`;
  const a0 = (i / n) * 2 * Math.PI - Math.PI / 2;
  const a1 = ((i + 1) / n) * 2 * Math.PI - Math.PI / 2;
  const large = a1 - a0 > Math.PI ? 1 : 0;
  return `M 0 0 L ${R * Math.cos(a0)} ${R * Math.sin(a0)} A ${R} ${R} 0 ${large} 1 ${R * Math.cos(a1)} ${R * Math.sin(a1)} Z`;
}

/** Animated wheel that lands on the presenter the server already picked (R42). */
export function Wheel({ spin, persons, onDone }: { spin: WheelSpunEvent; persons: Person[]; onDone(): void }) {
  const candidates = useMemo(
    () => spin.candidateIds.map((id) => persons.find((p) => p.id === id)).filter((p) => p !== undefined),
    [spin, persons],
  );
  const n = Math.max(1, candidates.length);
  const target = Math.max(0, candidates.findIndex((p) => p.id === spin.presenterId));
  const segDeg = 360 / n;
  const avatarPx = n > 12 ? 52 : 84;
  // The pointer sits at the top; rotate so the middle of the target segment ends there,
  // with a small random offset inside the segment so it does not look rigged.
  const finalDeg = useMemo(() => 360 * 7 - (target + 0.5) * segDeg + (Math.random() - 0.5) * segDeg * 0.6, [target, segDeg]);

  useEffect(() => {
    const t = setTimeout(() => {
      const winner = persons.find((p) => p.id === spin.presenterId);
      burstConfetti({ x: 0.5, y: 0.45 }, winner ? [winner.color, '#ffd000', '#ffffff'] : undefined);
      if (winner) emojiBurst([winner.emoji, '🎤', '⭐'], { x: 0.5, y: 0.5 }, 50);
      flash('#ffd000', 500);
      shake(22, 600);
      onDone();
    }, SPIN_S * 1000 + 400);
    return () => clearTimeout(t);
    // Runs once per spin event.
  }, [spin]);

  return (
    <motion.div className="host-wheel-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <Sunburst speedS={4} />
      <motion.div
        className="host-wheel-pointer"
        animate={{ rotate: [0, -25, 0, -18, 0, -10, 0], y: [0, -6, 0] }}
        transition={{ duration: 0.18, repeat: Math.round(SPIN_S / 0.18 * 0.7), repeatType: 'loop' }}
      >
        ▼
      </motion.div>
      <motion.svg
        className="host-wheel"
        viewBox={`${-R - 10} ${-R - 10} ${2 * R + 20} ${2 * R + 20}`}
        initial={{ rotate: 0, scale: 0.3 }}
        animate={{ rotate: finalDeg, scale: 1 }}
        transition={{ rotate: { duration: SPIN_S, ease: [0.12, 0.8, 0.18, 1] }, scale: { type: 'spring', stiffness: 90 } }}
      >
        {candidates.map((p, i) => {
          const mid = ((i + 0.5) / n) * 2 * Math.PI - Math.PI / 2;
          return (
            <g key={p.id}>
              <path d={slice(i, n)} fill={p.color} stroke="#fff" strokeWidth={4} />
              <foreignObject
                x={R * 0.68 * Math.cos(mid) - avatarPx / 2}
                y={R * 0.68 * Math.sin(mid) - avatarPx / 2}
                width={avatarPx}
                height={avatarPx}
              >
                <Avatar person={p} size={avatarPx} />
              </foreignObject>
            </g>
          );
        })}
        <circle r={40} fill="#ffd000" stroke="#000" strokeWidth={4} />
      </motion.svg>
      <motion.div
        className="host-wheel-winner"
        initial={{ opacity: 0, scale: 0 }}
        animate={{ opacity: 1, scale: [0, 1.6, 1], rotate: [0, -8, 0] }}
        transition={{ delay: SPIN_S + 0.35, duration: 0.6 }}
      >
        {persons.find((p) => p.id === spin.presenterId)?.name} ist dran! 🎉
      </motion.div>
    </motion.div>
  );
}
