import { useEffect, useRef, useState } from 'react';
import { m as motion } from 'motion/react';
import type { SubmitStatusDto } from '@pribe/shared';
import { formatDeadline, formatRemaining } from './time';

const URGENT_MS = 60 * 60_000;

/** Countdown to the deadline plus the live "x Präsentationen im Pool" counter (R23). */
export function DeadlineBanner({
  status,
  clockOffset,
  onExpired,
}: {
  status: SubmitStatusDto;
  clockOffset: number;
  onExpired: () => void;
}) {
  const [now, setNow] = useState(() => Date.now() + clockOffset);
  const expiredFired = useRef(false);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now() + clockOffset), 1000);
    return () => clearInterval(timer);
  }, [clockOffset]);

  const remaining = status.deadline === null ? null : status.deadline - now;
  useEffect(() => {
    if (remaining !== null && remaining <= 0 && status.uploadsOpen && !expiredFired.current) {
      expiredFired.current = true;
      onExpired();
    }
    if (remaining !== null && remaining > 0) expiredFired.current = false;
  }, [remaining, status.uploadsOpen, onExpired]);

  const urgent = remaining !== null && remaining > 0 && remaining < URGENT_MS;

  return (
    <section className={`deadline-banner${status.uploadsOpen ? '' : ' closed'}${urgent ? ' urgent' : ''}`}>
      <div className="pool-counter">
        <motion.span
          key={status.submissionCount}
          className="pool-count"
          initial={{ scale: 3, rotate: -30, opacity: 0 }}
          animate={{ scale: 1, rotate: 0, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 300, damping: 8 }}
        >
          {status.submissionCount}
        </motion.span>
        <span className="pool-label">
          {status.submissionCount === 1 ? 'Präsentation' : 'Präsentationen'} im Pool
        </span>
      </div>
      <div className="deadline">
        {!status.uploadsOpen ? (
          <span className="label">🔒 Einsendeschluss vorbei</span>
        ) : remaining === null ? (
          <span className="muted">Einreichen bis zum Spielstart</span>
        ) : (
          <>
            <span className="muted">Einsendeschluss {formatDeadline(status.deadline!)}</span>
            <motion.span
              className="deadline-clock"
              animate={urgent ? { scale: [1, 1.12, 1] } : { scale: 1 }}
              transition={urgent ? { repeat: Infinity, duration: 1 } : undefined}
            >
              ⏳ {formatRemaining(remaining)}
            </motion.span>
          </>
        )}
      </div>
    </section>
  );
}
