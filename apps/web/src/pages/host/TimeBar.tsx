import { motion } from 'motion/react';
import { useTicker } from './useHostGame';

export function TimeBar({ startedAt, endsAt, now }: { startedAt: number; endsAt: number; now(): number }) {
  useTicker(4);
  const total = Math.max(1, endsAt - startedAt);
  const left = Math.max(0, endsAt - now());
  const frac = left / total;
  const over = left === 0;
  const hue = Math.round(120 * frac);
  const s = Math.ceil(left / 1000);

  return (
    <div className={`host-timebar${over ? ' over' : ''}`}>
      <div className="host-timebar-fill" style={{ width: `${frac * 100}%`, background: `hsl(${hue} 90% 50%)` }} />
      {over ? (
        <motion.div className="host-timebar-label over" animate={{ scale: [1, 1.3, 1] }} transition={{ repeat: Infinity, duration: 0.8 }}>
          ⏰ Zeit ist um!
        </motion.div>
      ) : (
        frac < 0.2 && (
          <div className="host-timebar-label">
            {Math.floor(s / 60)}:{String(s % 60).padStart(2, '0')}
          </div>
        )
      )}
    </div>
  );
}
