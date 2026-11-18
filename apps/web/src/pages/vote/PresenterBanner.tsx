import { useEffect, useState } from 'react';
import { m as motion } from 'motion/react';
import type { VoteSnapshot } from '@pribe/shared';
import { formatLeft, presentingState } from './presenting';
import './presenterBanner.css';

export function PresenterBanner({ snapshot, clockOffset }: { snapshot: VoteSnapshot; clockOffset: number }) {
  const state = presentingState(snapshot);
  const [, tick] = useState(0);
  const endsAt = state?.timeLimitEndsAt ?? null;

  useEffect(() => {
    if (endsAt === null) return;
    const id = setInterval(() => tick((n) => n + 1), 500);
    return () => clearInterval(id);
  }, [endsAt]);

  if (!state) return null;
  const left = endsAt === null ? null : endsAt - (Date.now() + clockOffset);

  return (
    <motion.div
      className={`presenter-banner${left !== null && left <= 0 ? ' over' : ''}`}
      role="status"
      initial={{ y: -80, scale: 0.6, opacity: 0 }}
      animate={{ y: 0, scale: 1, opacity: 1 }}
      transition={{ type: 'spring', bounce: 0.55 }}
    >
      <div className="presenter-banner-title">🎤 Du präsentierst!</div>
      <div className="presenter-banner-time" aria-live="off">
        {!state.started
          ? 'Gleich geht’s los …'
          : left === null
            ? 'Ohne Zeitlimit'
            : left > 0
              ? `Noch ${formatLeft(left)}`
              : 'Zeit um! ⏰'}
      </div>
    </motion.div>
  );
}
