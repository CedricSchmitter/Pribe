import { useEffect, useState } from 'react';
import { AnimatePresence, m as motion } from 'motion/react';
import type { PersonId } from '@pribe/shared';
import { Avatar } from './Avatar';
import { enterFullscreen } from './fullscreen';
import { unlockAudio } from './gong';
import type { HostGame } from './useHostGame';
import { Wheel } from './Wheel';

export function ChoosePresenter({ game }: { game: HostGame }) {
  const snap = game.snapshot!;
  const [selected, setSelected] = useState<PersonId | null>(null);
  const [error, setError] = useState<{ msg: string; key: number } | null>(null);
  const [busy, setBusy] = useState(false);

  const presented = new Set(snap.presentedPersonIds);
  const showError = (msg: string) => setError({ msg, key: Date.now() });

  useEffect(() => setError(null), [selected]);

  async function spin() {
    unlockAudio();
    setBusy(true);
    setSelected(null);
    const res = await game.command('presenter:spin');
    setBusy(false);
    if (!res.ok) showError(res.message);
  }

  async function draw() {
    if (!selected) return;
    unlockAudio();
    enterFullscreen();
    setBusy(true);
    const res = await game.draw(selected);
    setBusy(false);
    if (!res.ok) showError(res.message);
  }

  async function finale() {
    const res = await game.command('finale:start');
    if (!res.ok) showError(res.message);
  }

  return (
    <div className="host-choose">
      <div className="host-choose-head">
        <h1>Wer präsentiert?</h1>
        <span className="muted">
          Runde {snap.roundCount + 1} · {snap.poolSize} im Pool
        </span>
      </div>
      <div className="host-person-grid">
        {snap.persons.map((p, i) => (
          <motion.button
            type="button"
            key={p.id}
            className={`host-person${selected === p.id ? ' selected' : ''}${presented.has(p.id) ? ' presented' : ''}`}
            onClick={() => setSelected(p.id)}
            initial={{ opacity: 0, y: 60, rotate: -8 }}
            animate={{ opacity: 1, y: 0, rotate: 0, scale: selected === p.id ? 1.08 : 1 }}
            transition={{ delay: i * 0.04, type: 'spring', stiffness: 200, damping: 15 }}
          >
            <Avatar person={p} size={56} />
            <span className="host-person-name">{p.name}</span>
            {presented.has(p.id) && <span className="host-person-done">✔</span>}
          </motion.button>
        ))}
      </div>
      <AnimatePresence>
        {error && (
          <motion.div
            key={error.key}
            className="host-error"
            role="alert"
            initial={{ scale: 0.4, opacity: 0 }}
            animate={{ scale: 1, opacity: 1, x: [0, -30, 30, -20, 20, -10, 10, 0] }}
            exit={{ opacity: 0, scale: 0.6 }}
            transition={{ duration: 0.6 }}
          >
            🙅 {error.msg}
          </motion.div>
        )}
      </AnimatePresence>
      <div className="host-choose-actions">
        <button type="button" className="host-big-button" onClick={spin} disabled={busy || snap.poolSize === 0}>
          🎡 Rad wählt Präsentator
        </button>
        <button type="button" className="primary host-big-button host-draw-button" onClick={draw} disabled={busy || !selected || snap.poolSize === 0}>
          🎲 Ziehen
        </button>
        {snap.roundCount > 0 && (
          <button type="button" className={`host-big-button${snap.poolSize === 0 ? ' primary' : ''}`} onClick={finale}>
            🏆 Finale starten
          </button>
        )}
      </div>
      <AnimatePresence>
        {game.wheel && (
          <Wheel
            spin={game.wheel}
            persons={snap.persons}
            onDone={() => {
              setSelected(game.wheel!.presenterId);
              setTimeout(game.clearWheel, 1200);
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
