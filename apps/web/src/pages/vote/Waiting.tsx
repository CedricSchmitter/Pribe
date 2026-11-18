import { m as motion } from 'motion/react';
import type { GuestView, Person } from '@pribe/shared';
import { Avatar as PlainAvatar } from '../../components/Avatar';
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

/** R90: the surprise guest is on stage; there is nothing to vote on. */
export function GuestWaiting({ guest }: { guest: GuestView }) {
  const talking = guest.presentingSince !== null;
  return (
    <div className="vote-page center vote-waiting">
      <FloatingEmojis emojis={[guest.emoji, '🎁', '🤯', '✨']} count={12} seed={5} />
      <motion.div
        initial={{ scale: 0, rotate: 720 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ type: 'spring', stiffness: 80, damping: 9 }}
      >
        <motion.div animate={{ y: [0, -18, 0], rotate: [-6, 6, -6] }} transition={{ ...BOUNCE, duration: 1.2 }}>
          <PlainAvatar person={guest} size={128} />
        </motion.div>
      </motion.div>
      <h1>
        <JumpText text="Überraschungsgast!" />
      </h1>
      <p className="vote-pool">
        <strong>{guest.name}</strong> {talking ? 'präsentiert – einfach genießen 🍿' : 'betritt die Bühne …'}
      </p>
      <p className="muted">Hier wird nicht getippt und nicht bewertet.</p>
    </div>
  );
}

/** R83: real phones wait while the admin tests the beamer with bots. */
export function ProbeWaiting() {
  return (
    <div className="vote-page center vote-waiting">
      <FloatingEmojis emojis={['🤖', '🧪', '👾', '🔧']} count={10} seed={7} />
      <motion.div className="vote-spinner" animate={{ rotate: [-12, 12, -12] }} transition={{ ...BOUNCE, duration: 0.9 }}>
        🧪
      </motion.div>
      <h1>Probelauf läuft – gleich geht's los</h1>
      <p className="muted">Die Spielleitung testet gerade Beamer und Technik mit Bots. Danach bist du automatisch dabei.</p>
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
