import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import confetti from 'canvas-confetti';
import { emojiBurst, emojiRain, flash, shake, Shockwave, sideCannons, Spotlights, Sunburst } from '../../fx';
import { Avatar } from './Avatar';
import type { HostGame } from './useHostGame';

type Stage = 'tally' | 'drumroll' | 'owner';

const DRUM_MS = 2800;

function celebrate(colors: string[], emoji: string | undefined) {
  flash('#ffffff', 600);
  shake(30, 800);
  void confetti({ particleCount: 300, spread: 160, startVelocity: 60, origin: { x: 0.5, y: 0.45 }, colors });
  sideCannons(colors, 2500);
  if (emoji) {
    emojiBurst([emoji], { x: 0.5, y: 0.4 }, 45);
    setTimeout(() => emojiRain([emoji, '🎉'], 2500), 700);
  }
}

function Stars({ avg }: { avg: number }) {
  return (
    <span className="host-stars">
      {[1, 2, 3, 4, 5].map((i) => (
        <motion.span
          key={i}
          initial={{ scale: 0, rotate: -180 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ delay: 0.6 + i * 0.15, type: 'spring', stiffness: 260 }}
          style={{ opacity: avg >= i - 0.5 ? 1 : 0.2 }}
        >
          ⭐
        </motion.span>
      ))}
    </span>
  );
}

export function Reveal({ game, onError }: { game: HostGame; onError(msg: string): void }) {
  const snap = game.snapshot!;
  const reveal = snap.reveal!;
  const [stage, setStage] = useState<Stage>('tally');
  const owner = game.person(reveal.ownerId);
  const tally = [...reveal.tally].sort((a, b) => a.count - b.count);
  const max = Math.max(1, ...tally.map((t) => t.count));
  const tallyMs = 1200 + tally.length * 500;

  useEffect(() => {
    setStage('tally');
    const t1 = setTimeout(() => setStage('drumroll'), tallyMs);
    // Drumroll without sound: the screen trembles harder and harder.
    const rumbles = Array.from({ length: 9 }, (_, i) => setTimeout(() => shake(3 + i * 2.5, 280), tallyMs + 300 + i * 270));
    const t2 = setTimeout(() => {
      setStage('owner');
      celebrate(owner ? [owner.color, '#ffd000', '#ffffff'] : ['#ffd000'], owner?.emoji);
    }, tallyMs + DRUM_MS);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      rumbles.forEach(clearTimeout);
    };
    // Once per revealed round.
  }, [reveal.roundId]);

  async function next() {
    const res = await game.command('round:next');
    if (!res.ok) onError(res.message);
  }
  async function finale() {
    const res = await game.command('finale:start');
    if (!res.ok) onError(res.message);
  }

  return (
    <div className="host-reveal">
      <AnimatePresence mode="wait">
        {stage === 'tally' && (
          <motion.div key="tally" className="host-tally" exit={{ opacity: 0, scale: 0.6, rotate: 10 }}>
            <h1>Wer war's? Eure Tipps:</h1>
            {tally.length === 0 && <p className="muted">Niemand hat getippt 🙈</p>}
            <div className="host-tally-bars">
              {tally.map((t, i) => {
                const p = game.person(t.personId);
                return (
                  <motion.div
                    key={t.personId}
                    className="host-tally-col"
                    initial={{ opacity: 0, y: 200 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3 + i * 0.5, type: 'spring' }}
                  >
                    <div className="host-tally-count">{t.count}</div>
                    <motion.div
                      className="host-tally-bar"
                      style={{ background: p?.color ?? '#bdc4ca' }}
                      initial={{ height: 0 }}
                      animate={{ height: `${(t.count / max) * 40}vh` }}
                      transition={{ delay: 0.5 + i * 0.5, type: 'spring', stiffness: 60, damping: 10 }}
                    />
                    <Avatar person={p} size={64} />
                    <div className="host-tally-name">{p?.name}</div>
                  </motion.div>
                );
              })}
            </div>
          </motion.div>
        )}
        {stage === 'drumroll' && (
          <motion.div key="drum" className="host-drumroll-wrap" exit={{ opacity: 0, scale: 6 }} transition={{ duration: 0.3 }}>
            <Spotlights />
            <div className="host-drums" aria-hidden>
              {[0, 1].map((i) => (
                <motion.span
                  key={i}
                  animate={{ y: [0, -40, 0], rotate: i ? [10, -10, 10] : [-10, 10, -10] }}
                  transition={{ repeat: Infinity, duration: 0.16, delay: i * 0.08 }}
                >
                  🥁
                </motion.span>
              ))}
            </div>
            <motion.div
              className="host-drumroll"
              initial={{ opacity: 0, scale: 0.2 }}
              animate={{ opacity: 1, scale: [0.2, 1, 1.05, 1, 1.12, 1, 1.25], x: [0, -6, 6, -12, 12, -20, 20, 0] }}
              transition={{ duration: DRUM_MS / 1000 - 0.2 }}
            >
              Eingereicht hat …
            </motion.div>
          </motion.div>
        )}
        {stage === 'owner' && (
          <motion.div key="owner" className="host-owner" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <Sunburst color={owner?.color ?? '#ffd000'} speedS={10} />
            <Shockwave color={owner?.color ?? '#ffd000'} />
            <Shockwave color="#ffd000" delay={0.2} />
            <motion.div
              className="host-owner-avatar"
              initial={{ scale: 0, rotate: -720 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ type: 'spring', stiffness: 70, damping: 8 }}
            >
              <Avatar person={owner} size={260} />
            </motion.div>
            <motion.h1 className="host-owner-name" initial={{ y: 100, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.4 }}>
              {owner ? owner.name : 'Unbekannt'}!
            </motion.h1>
            <div className="host-owner-stats">
              <div>
                {reveal.avgStars === null ? (
                  <span className="muted">Keine Sterne vergeben</span>
                ) : (
                  <>
                    <Stars avg={reveal.avgStars} />
                    <span className="host-avg">
                      Ø {reveal.avgStars.toFixed(1)} <span className="muted">({reveal.ratingCount})</span>
                    </span>
                  </>
                )}
              </div>
              <div className="host-correct">
                <span className="label">Richtig getippt: {reveal.correctVoterIds.length}</span>
                <div className="row">
                  {reveal.correctVoterIds.map((id, i) => (
                    <motion.span key={id} initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 1.2 + i * 0.12, type: 'spring' }}>
                      <Avatar person={game.person(id)} size={52} />
                    </motion.span>
                  ))}
                </div>
              </div>
            </div>
            <div className="host-reveal-actions">
              {snap.poolSize > 0 && (
                <button type="button" className="primary host-big-button" onClick={next}>
                  Nächste Runde ➡️
                </button>
              )}
              <button
                type="button"
                className={`host-big-button${snap.poolSize === 0 ? ' primary' : ''}`}
                onClick={finale}
              >
                🏆 Finale starten
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
