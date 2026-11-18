import { useEffect } from 'react';
import { AnimatePresence, m as motion } from 'motion/react';
import { JumpText, shake } from '../../fx';
import { Avatar } from './Avatar';
import { ReactionOverlay } from './ReactionOverlay';
import { useTicker, type HostGame } from './useHostGame';

export function Countdown({ game }: { game: HostGame }) {
  useTicker(10);
  const snap = game.snapshot!;
  const round = snap.round!;
  const left = Math.max(0, Math.ceil(((round.countdownEndsAt ?? 0) - game.now()) / 1000));
  const voted = round.votedPersonIds.map((id) => game.person(id)).filter((p) => p !== undefined);
  const hot = left <= 5;

  useEffect(() => {
    if (left > 0 && left <= 5) shake(6 + (6 - left) * 4, 350);
  }, [left]);

  return (
    <div className="host-countdown">
      {hot && <div className="fx-hot-bg" />}
      <h1>
        <JumpText text="Letzte Chance zum Tippen!" /> 🗳️
      </h1>
      <AnimatePresence mode="popLayout">
        <motion.div
          key={left}
          className={`host-countdown-number${hot ? ' hot' : ''}`}
          initial={{ scale: hot ? 5 : 3, opacity: 0, rotate: left % 2 ? -30 : 30 }}
          animate={{ scale: 1, opacity: 1, rotate: 0 }}
          exit={{ scale: 0.2, opacity: 0, rotate: 20 }}
          transition={{ type: 'spring', stiffness: 300, damping: 18 }}
        >
          {left}
        </motion.div>
      </AnimatePresence>
      <div className="host-countdown-voted">
        <span className="muted">
          {voted.length} von {snap.persons.length} haben getippt
        </span>
        <div className="row">
          <AnimatePresence>
            {voted.map((p) => (
              <motion.span key={p.id} initial={{ scale: 0, y: 80 }} animate={{ scale: 1, y: 0 }} transition={{ type: 'spring', stiffness: 260 }}>
                <Avatar person={p} size={64} />
              </motion.span>
            ))}
          </AnimatePresence>
        </div>
      </div>
      <ReactionOverlay reactions={game.reactions} combo={game.combo} person={game.person} />
    </div>
  );
}
