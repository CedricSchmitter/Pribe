import { motion } from 'motion/react';
import type { Person } from '@pribe/shared';
import { FloatingEmojis, JumpText } from '../../fx';
import { Avatar } from './Avatar';

const BOUNCE = { repeat: Infinity, repeatType: 'mirror' as const, ease: 'easeInOut' as const };

/** R55: lobby until the host starts the game. */
export function LobbyWaiting({ me, poolSize }: { me: Person; poolSize: number }) {
  return (
    <div className="vote-page center vote-waiting">
      <FloatingEmojis emojis={[me.emoji, '🎤', '📊', '🤔', '🍿']} count={10} />
      <motion.div animate={{ y: [0, -24, 0], rotate: [-8, 8, -8] }} transition={{ ...BOUNCE, duration: 1.4 }}>
        <Avatar person={me} size={112} />
      </motion.div>
      <h1>
        <JumpText text={`Hallo ${me.name}!`} />
      </h1>
      <p className="muted">Du bist drin. Gleich startet die Spielleitung.</p>
      <motion.p className="vote-pool" animate={{ scale: [1, 1.08, 1] }} transition={{ ...BOUNCE, duration: 1.1 }}>
        🎁 {poolSize} {poolSize === 1 ? 'Präsentation' : 'Präsentationen'} im Pool
      </motion.p>
      <Dots />
    </div>
  );
}

/** R55: between rounds and while the beamer draws. */
export function SoonWaiting({ presenter, drawing }: { presenter: Person | null; drawing: boolean }) {
  return (
    <div className="vote-page center vote-waiting">
      <FloatingEmojis emojis={drawing ? ['🎰', '🎲', '📄', '✨'] : ['🎲', '⏳', '🍿', '👀']} count={10} seed={drawing ? 3 : 11} />
      <motion.div
        className="vote-spinner"
        animate={{ rotate: 360, scale: drawing ? [1, 1.3, 1] : 1 }}
        transition={{ rotate: { repeat: Infinity, duration: drawing ? 0.6 : 2.4, ease: 'linear' }, scale: { ...BOUNCE, duration: 0.5 } }}
      >
        {drawing ? '🎰' : '🎲'}
      </motion.div>
      <motion.h1 key={drawing ? 'd' : 's'} initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ type: 'spring', bounce: 0.6 }}>
        {drawing ? 'Es wird gezogen …' : 'Gleich geht’s los!'}
      </motion.h1>
      {presenter ? (
        <motion.div className="vote-presenter" initial={{ scale: 0, rotate: -20 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: 'spring', bounce: 0.7 }}>
          <Avatar person={presenter} size={48} />
          <span>
            <strong>{presenter.name}</strong> präsentiert
          </span>
        </motion.div>
      ) : (
        <p className="muted">Wer präsentiert als Nächstes?</p>
      )}
      <p className="muted">Sobald die Präsentation startet, kannst du tippen.</p>
      <Dots />
    </div>
  );
}

function Dots() {
  return (
    <div className="vote-dots" aria-hidden>
      {[0, 1, 2].map((i) => (
        <motion.span key={i} animate={{ y: [0, -12, 0] }} transition={{ repeat: Infinity, duration: 0.8, delay: i * 0.15 }} />
      ))}
    </div>
  );
}
