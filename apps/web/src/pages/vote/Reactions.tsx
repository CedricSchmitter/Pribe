import { AnimatePresence, m as motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { REACTION_EMOJIS, type ReactionEmoji } from '@pribe/shared';
import type { CastResult } from './useVoteGame';

// Mirrors REACTION_THROTTLE in apps/server/src/game/index.ts so the meter matches what the server accepts.
const CAPACITY = 5;
const REFILL_PER_S = 2;

interface Flyer {
  id: number;
  emoji: ReactionEmoji;
  x: number;
}

/** R53: emoji reactions with a visible per-device throttle. */
export function Reactions({ onSend }: { onSend(emoji: ReactionEmoji): Promise<CastResult & { rateLimited?: boolean }> }) {
  const bucket = useRef({ tokens: CAPACITY, at: Date.now() });
  const [tokens, setTokens] = useState(CAPACITY);
  const [flyers, setFlyers] = useState<Flyer[]>([]);
  const [blocked, setBlocked] = useState(0);
  const nextId = useRef(0);

  const refill = () => {
    const now = Date.now();
    const b = bucket.current;
    b.tokens = Math.min(CAPACITY, b.tokens + ((now - b.at) / 1000) * REFILL_PER_S);
    b.at = now;
    return b.tokens;
  };

  const flyerTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => {
    const t = setInterval(() => setTokens(refill()), 100);
    return () => {
      clearInterval(t);
      flyerTimers.current.forEach(clearTimeout);
    };
  }, []);

  const send = async (emoji: ReactionEmoji, index: number) => {
    if (refill() < 1) {
      setBlocked((n) => n + 1);
      return;
    }
    bucket.current.tokens -= 1;
    setTokens(bucket.current.tokens);
    const id = nextId.current++;
    const x = (index - (REACTION_EMOJIS.length - 1) / 2) * 25 + (Math.random() - 0.5) * 20;
    setFlyers((f) => [...f, { id, emoji, x }]);
    flyerTimers.current.push(setTimeout(() => setFlyers((f) => f.filter((y) => y.id !== id)), 1200));
    const res = await onSend(emoji);
    if (!res.ok && res.rateLimited) {
      bucket.current.tokens = 0;
      setBlocked((n) => n + 1);
    }
  };

  const empty = tokens < 1;
  return (
    <section className="vote-reactions" aria-label="Reaktionen">
      <div className="vote-flyers" aria-hidden>
        <AnimatePresence>
          {flyers.map((f) => (
            <motion.span
              key={f.id}
              className="vote-flyer"
              initial={{ y: 0, x: `${f.x}vw`, opacity: 1, scale: 0.6 }}
              animate={{ y: -260, opacity: 0, scale: 2.4, rotate: f.x * 2 }}
              transition={{ duration: 1.1, ease: 'easeOut' }}
            >
              {f.emoji}
            </motion.span>
          ))}
        </AnimatePresence>
      </div>
      <motion.div className="vote-reaction-row" key={blocked} animate={blocked ? { x: [0, -10, 10, -6, 6, 0] } : {}} transition={{ duration: 0.35 }}>
        {REACTION_EMOJIS.map((e, i) => (
          <motion.button
            key={e}
            type="button"
            className="vote-reaction"
            onClick={() => void send(e, i)}
            whileTap={{ scale: 1.5, rotate: i % 2 ? 20 : -20 }}
            aria-disabled={empty}
            aria-label={`Reaktion ${e} senden`}
          >
            {e}
          </motion.button>
        ))}
      </motion.div>
      <div className="vote-meter" role="meter" aria-valuemin={0} aria-valuemax={CAPACITY} aria-valuenow={Math.floor(tokens)} aria-label="Reaktionen übrig">
        <motion.div className="vote-meter-fill" animate={{ width: `${(tokens / CAPACITY) * 100}%` }} transition={{ duration: 0.1 }} data-empty={empty || undefined} />
      </div>
      <AnimatePresence>
        {empty && (
          <motion.p key="slow" className="vote-slow" initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }}>
            Nicht so schnell! 🐢
          </motion.p>
        )}
      </AnimatePresence>
    </section>
  );
}
