import { useEffect, useState } from 'react';
import { animate, motion, useMotionValue, useTransform } from 'motion/react';
import confetti from 'canvas-confetti';
import { AWARD_LABELS_DE, type FinaleResult, type Person } from '@pribe/shared';
import { AWARD_EMOJI, FinaleAvatar, awardDetail, statsOf } from './common';
import './finale.css';

/**
 * Phone finale (R55): own place, points and awards. Hidden behind a tap so the phone does
 * not spoil the countdown running on the beamer.
 */
export function MyFinale({ me, finale }: { me: Person; finale: FinaleResult }) {
  const [revealed, setRevealed] = useState(false);
  const entry = finale.leaderboard.find((e) => e.personId === me.id);
  const myAwards = finale.awards.filter((a) => a.winners.includes(me.id));
  const stats = statsOf(finale, me.id);

  const rank = useMotionValue(finale.leaderboard.length);
  const rankText = useTransform(rank, (v) => `${Math.round(v)}.`);

  useEffect(() => {
    if (!revealed || !entry) return;
    const controls = animate(rank, entry.rank, { duration: 2.2, ease: [0.2, 0.8, 0.2, 1] });
    const t = setTimeout(() => {
      navigator.vibrate?.(entry.rank <= 3 ? [80, 60, 80, 60, 200] : 120);
      if (entry.rank <= 3 || myAwards.length) {
        void confetti({ particleCount: 180, spread: 110, startVelocity: 50, origin: { x: 0.5, y: 0.45 }, colors: [me.color, '#ffd000', '#ffffff'] });
      }
    }, 2200);
    return () => {
      controls.stop();
      clearTimeout(t);
    };
  }, [revealed]);

  if (!revealed || !entry) {
    return (
      <div className="vote-page center finale-phone">
        <motion.div
          className="finale-phone-trophy"
          animate={{ scale: [1, 1.3, 1], rotate: [0, 15, -15, 0] }}
          transition={{ repeat: Infinity, repeatType: 'mirror', duration: 1.2 }}
        >
          🏆
        </motion.div>
        <h1>Finale!</h1>
        <p className="muted">Schau auf den Beamer – dort läuft die Siegerehrung.</p>
        {entry && (
          <motion.button
            type="button"
            className="primary finale-phone-reveal"
            onClick={() => setRevealed(true)}
            animate={{ scale: [1, 1.06, 1] }}
            transition={{ repeat: Infinity, duration: 1 }}
          >
            🎁 Mein Ergebnis aufdecken
          </motion.button>
        )}
      </div>
    );
  }

  return (
    <div className="vote-page center finale-phone">
      <motion.div initial={{ scale: 0, rotate: -360 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: 'spring', bounce: 0.5 }}>
        <FinaleAvatar person={me} size={96} />
      </motion.div>
      <span className="label">Dein Platz</span>
      <motion.div
        className={`finale-phone-rank${entry.rank <= 3 ? ' top' : ''}`}
        animate={{ scale: [1, 1, 1.35, 1] }}
        transition={{ duration: 2.8, times: [0, 0.75, 0.88, 1] }}
      >
        <motion.span>{rankText}</motion.span>
      </motion.div>
      <motion.p className="finale-phone-points" initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 2.4 }}>
        {entry.rank === 1 ? '👑 ' : ''}
        {entry.points} {entry.points === 1 ? 'Punkt' : 'Punkte'}
        {stats ? <span className="muted"> · {stats.guesses} Tipps</span> : null}
      </motion.p>
      {myAwards.length > 0 ? (
        <div className="finale-phone-awards">
          {myAwards.map((a, i) => (
            <motion.div
              key={a.kind}
              className="card finale-phone-award"
              initial={{ x: i % 2 ? 400 : -400, rotate: i % 2 ? 20 : -20, opacity: 0 }}
              animate={{ x: 0, rotate: 0, opacity: 1 }}
              transition={{ delay: 2.8 + i * 0.35, type: 'spring', bounce: 0.5 }}
            >
              <span className="finale-phone-award-emoji">{AWARD_EMOJI[a.kind]}</span>
              <span>
                <strong>{AWARD_LABELS_DE[a.kind].title}</strong>
                <br />
                <span className="muted">{awardDetail(a.kind, stats)}</span>
              </span>
            </motion.div>
          ))}
        </div>
      ) : (
        <motion.p className="muted" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 2.8 }}>
          Diesmal kein Award – nächstes Mal! 💪
        </motion.p>
      )}
    </div>
  );
}
