import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import type { MyVote, Person, RevealOutcome, RevealResult } from '@pribe/shared';
import { emojiBurst, emojiRain, shake, Sunburst } from '../../fx';
import { burstConfetti } from '../../lib/confetti';
import { Avatar } from './Avatar';

const FLASH: Record<RevealOutcome, { color: string; title: string; vibrate: number[] }> = {
  correct: { color: 'var(--color-success)', title: 'Richtig! +1 Punkt', vibrate: [80, 60, 80, 60, 300] },
  wrong: { color: 'var(--color-error)', title: 'Daneben!', vibrate: [600] },
  noGuess: { color: 'var(--color-error)', title: 'Kein Tipp abgegeben', vibrate: [600] },
  owner: { color: 'var(--surface-primary)', title: 'Deine Präsentation!', vibrate: [80, 60, 80, 60, 80] },
};

/** Not every browser has it (iOS Safari presumably not, unverified); then only the color flash runs. */
function vibrate(pattern: number[]) {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    // ignore
  }
}

interface Props {
  reveal: RevealResult;
  outcome: RevealOutcome | null;
  persons: Person[];
  myVote: MyVote | null;
}

/** R54: the phone flashes green/red and vibrates, then shows who it was. */
export function RevealView({ reveal, outcome, persons, myVote }: Props) {
  const [flashing, setFlashing] = useState(true);
  const fx = outcome ? FLASH[outcome] : null;

  useEffect(() => {
    setFlashing(true);
    if (!fx) return;
    vibrate(fx.vibrate);
    const timers = [setTimeout(() => setFlashing(false), 1800)];
    if (outcome === 'correct') {
      burstConfetti({ x: 0.5, y: 0.5 });
      timers.push(setTimeout(() => burstConfetti({ x: 0.2, y: 0.7 }), 250));
      timers.push(setTimeout(() => burstConfetti({ x: 0.8, y: 0.7 }), 500));
      timers.push(setTimeout(() => emojiRain(['🎯', '🧠', '🎉'], 1800), 900));
    } else if (outcome === 'wrong' || outcome === 'noGuess') {
      shake(18, 700);
      timers.push(setTimeout(() => emojiRain(['🍅', '🤡'], 1400), 500));
    } else if (outcome === 'owner') {
      timers.push(setTimeout(() => emojiBurst(['🕵️', '🤫'], { x: 0.5, y: 0.5 }, 30), 300));
    }
    return () => timers.forEach(clearTimeout);
  }, [reveal.roundId, outcome]);

  const byId = (id: string | null | undefined) => persons.find((p) => p.id === id) ?? null;
  const owner = byId(reveal.ownerId);
  const guessed = myVote?.roundId === reveal.roundId ? byId(myVote.guessPersonId) : null;
  const correctCount = reveal.correctVoterIds.length;

  return (
    <div className="vote-page center vote-reveal" data-outcome={outcome ?? undefined}>
      {outcome === 'correct' && <Sunburst color="#73d95f" size="140vmax" speedS={8} />}
      {/* Portal: the page transition's transform would otherwise trap `position: fixed` inside the content area. */}
      {createPortal(
        <AnimatePresence>
          {flashing && fx && (
            <motion.div
              key="flash"
              className="vote-flash"
              data-testid="reveal-flash"
              style={{ background: fx.color }}
              initial={{ opacity: 0 }}
              animate={{ opacity: [0, 1, 0.15, 1, 0.15, 1, 0.6] }}
              exit={{ opacity: 0 }}
              transition={{ duration: 1.6, times: [0, 0.1, 0.25, 0.4, 0.55, 0.7, 1] }}
            >
              <motion.span initial={{ scale: 0.2, rotate: -30 }} animate={{ scale: [0.2, 1.4, 1], rotate: 0 }} transition={{ duration: 0.6 }}>
                {outcome === 'correct' ? '✅' : outcome === 'owner' ? '🕵️' : '❌'}
              </motion.span>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body,
      )}

      {fx && (
        <motion.h1
          className="vote-outcome"
          style={{ color: outcome === 'owner' ? undefined : fx.color }}
          initial={{ scale: 3, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', bounce: 0.6, delay: 0.3 }}
        >
          {fx.title}
        </motion.h1>
      )}

      {owner && (
        <motion.div className="vote-owner card" initial={{ y: 80, opacity: 0, rotate: 8 }} animate={{ y: 0, opacity: 1, rotate: 0 }} transition={{ type: 'spring', bounce: 0.55, delay: 0.6 }}>
          <span className="label">EINGEREICHT VON</span>
          <motion.div animate={{ rotate: [0, -10, 10, 0] }} transition={{ repeat: Infinity, duration: 2, delay: 1.5 }}>
            <Avatar person={owner} size={88} />
          </motion.div>
          <strong className="vote-owner-name">{owner.name}</strong>
          {outcome !== 'owner' && (
            <p className="muted">
              Dein Tipp: {guessed ? `${guessed.emoji} ${guessed.name}` : '—'}
            </p>
          )}
          <p className="muted">
            {correctCount} {correctCount === 1 ? 'Person lag' : 'Personen lagen'} richtig
            {reveal.avgStars !== null && ` · Folien ⭐ ${reveal.avgStars.toFixed(1)}`}
            {reveal.avgTalkStars != null && ` · Vortrag 🎤 ${reveal.avgTalkStars.toFixed(1)}`}
          </p>
        </motion.div>
      )}
      <p className="muted">Gleich geht’s weiter …</p>
    </div>
  );
}
