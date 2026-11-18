import { useState } from 'react';
import { animate, AnimatePresence, m as motion, useMotionValue } from 'motion/react';
import { FREE_TOPIC_TITLE, TOPICS, type TopicDto } from '@pribe/shared';
import { burstConfetti } from '../../lib/confetti';
import { AVATAR_COLORS } from '../admin/palette';

const SEGMENTS = TOPICS.length;
const SLICE = 360 / SEGMENTS;
const R = 98;
const C = 100;

const point = (deg: number, r: number) => {
  const rad = (deg * Math.PI) / 180;
  return `${(C + r * Math.sin(rad)).toFixed(2)} ${(C - r * Math.cos(rad)).toFixed(2)}`;
};

const segmentPath = (i: number) =>
  `M ${C} ${C} L ${point(i * SLICE, R)} A ${R} ${R} 0 0 1 ${point((i + 1) * SLICE, R)} Z`;

/** Index under the pointer (top) for a clockwise wheel rotation. */
const indexAt = (rotation: number) => {
  const atTop = (((-rotation % 360) + 360) % 360) / SLICE;
  return Math.floor(atTop) % SEGMENTS;
};

/**
 * Shows all topics but lands on the one the server assigned (D26); the server alone
 * decides, the animation only follows.
 */
export function TopicWheel({ onSpin, onDone }: { onSpin: () => Promise<TopicDto>; onDone: (t: TopicDto) => void }) {
  const rotation = useMotionValue(0);
  const [spinning, setSpinning] = useState(false);
  const [ticker, setTicker] = useState<number>(0);
  const [result, setResult] = useState<TopicDto | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function spin() {
    setSpinning(true);
    setError(null);
    let topic: TopicDto;
    try {
      topic = await onSpin();
    } catch {
      setSpinning(false);
      setError('Das Rad klemmt. Bitte nochmal versuchen.');
      return;
    }
    const landing = topic.index ?? Math.floor(Math.random() * SEGMENTS);
    const jitter = (Math.random() - 0.5) * SLICE * 0.6;
    const target = 360 * 7 - (landing * SLICE + SLICE / 2) + jitter;
    const unsubscribe = rotation.on('change', (v) => setTicker(indexAt(v)));
    await animate(rotation, target, { duration: 5.5, ease: [0.12, 0.8, 0.22, 1] });
    unsubscribe();
    setResult(topic);
    burstConfetti({ x: 0.5, y: 0.4 });
    setTimeout(() => burstConfetti({ x: 0.2, y: 0.5 }), 250);
    setTimeout(() => burstConfetti({ x: 0.8, y: 0.5 }), 500);
  }

  return (
    <section className="stack topic-wheel-step">
      <h1>Dein Thema</h1>
      <p className="muted">Einmal drehen, das Thema gilt. Jedes Thema gibt es nur einmal.</p>

      <div className="wheel-wrap">
        <motion.div
          className="wheel-pointer"
          animate={spinning && !result ? { rotate: [0, -18, 0] } : { rotate: 0 }}
          transition={spinning && !result ? { repeat: Infinity, duration: 0.18 } : undefined}
        >
          ▼
        </motion.div>
        <motion.svg viewBox="0 0 200 200" className="wheel" style={{ rotate: rotation }} aria-hidden="true">
          {TOPICS.map((_, i) => (
            <g key={i}>
              <path d={segmentPath(i)} fill={AVATAR_COLORS[i % AVATAR_COLORS.length]} stroke="#fff" strokeWidth="1" />
              <text
                x={C}
                y={C - R * 0.78}
                transform={`rotate(${i * SLICE + SLICE / 2} ${C} ${C})`}
                textAnchor="middle"
                dominantBaseline="middle"
                className="wheel-label"
              >
                {i + 1}
              </text>
            </g>
          ))}
          <circle cx={C} cy={C} r="16" fill="#ffd000" stroke="#000" strokeWidth="2" />
          <text x={C} y={C} textAnchor="middle" dominantBaseline="central" fontSize="14">
            🎲
          </text>
        </motion.svg>
      </div>

      <AnimatePresence mode="wait">
        {result ? (
          <motion.div
            key="result"
            className="topic-card"
            initial={{ scale: 0.2, rotate: -12, opacity: 0 }}
            animate={{ scale: 1, rotate: 0, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 300, damping: 11 }}
          >
            <span className="label">{result.index === null ? 'Alle Themen sind vergeben' : `Thema ${result.index + 1}`}</span>
            <strong className="topic-title">{result.index === null ? FREE_TOPIC_TITLE : result.title}</strong>
            {result.index === null && <span>Du darfst dir selbst etwas aussuchen.</span>}
          </motion.div>
        ) : spinning ? (
          <motion.p key="ticker" className="wheel-ticker" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            {ticker + 1}. {TOPICS[ticker]}
          </motion.p>
        ) : null}
      </AnimatePresence>

      {error && <p className="inline-warning">{error}</p>}

      {result ? (
        <button type="button" className="primary upload-button" onClick={() => onDone(result)}>
          Weiter zum Hochladen
        </button>
      ) : (
        <motion.button
          type="button"
          className="primary upload-button"
          disabled={spinning}
          whileTap={{ scale: 0.9, rotate: -3 }}
          animate={spinning ? undefined : { scale: [1, 1.05, 1] }}
          transition={spinning ? undefined : { repeat: Infinity, duration: 1.4 }}
          onClick={spin}
        >
          {spinning ? 'Dreht …' : '🎡 Rad drehen'}
        </motion.button>
      )}

      <details className="topic-legend">
        <summary>Alle {SEGMENTS} Themen ansehen</summary>
        <ol>
          {TOPICS.map((title) => (
            <li key={title}>{title}</li>
          ))}
        </ol>
      </details>
    </section>
  );
}
