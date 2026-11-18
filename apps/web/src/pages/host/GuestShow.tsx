import { useEffect, useState, type CSSProperties } from 'react';
import { AnimatePresence, m as motion } from 'motion/react';
import type { HostGuestView } from '@pribe/shared';
import { Curtain, emojiBurst, emojiRain, fireworks, flash, JumpText, shake, Spotlights, Sunburst } from '../../fx';
import { Avatar } from './Avatar';
import { downloadPptx } from './download';
import { PresentationFrame } from './PresentationFrame';
import type { HostGame } from './useHostGame';
import './guest.css';

const DRUMROLL_MS = 2600;

/** R90: surprise guest after the finale — big reveal, then the talk without any time limit. */
export function GuestShow({ game, guest, onError }: { game: HostGame; guest: HostGuestView; onError(msg: string): void }) {
  const run = (name: 'guest:present' | 'guest:back') => void game.command(name).then((res) => !res.ok && onError(res.message));
  return guest.presentingSince === null ? (
    <GuestReveal guest={guest} onPresent={() => run('guest:present')} />
  ) : (
    <GuestPresenting game={game} guest={guest} onBack={() => run('guest:back')} />
  );
}

function GuestReveal({ guest, onPresent }: { guest: HostGuestView; onPresent(): void }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const colors = [guest.color, '#ffd000', '#ffffff', '#ff3366', '#33ccff'];
    const timers = [
      setTimeout(() => {
        setOpen(true);
        flash('#ffffff', 450);
        shake(34, 900);
        emojiBurst([guest.emoji, '🎁', '🤯', '🎉'], { x: 0.5, y: 0.45 }, 70);
        fireworks(colors, 6000);
      }, DRUMROLL_MS),
      setTimeout(() => emojiRain([guest.emoji, '🎁', '✨', '🤩'], 4500), DRUMROLL_MS + 900),
      setTimeout(() => shake(16, 500), DRUMROLL_MS + 2400),
    ];
    return () => timers.forEach(clearTimeout);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.key === ' ' || e.key === 'Enter') && (e.target as HTMLElement | null)?.closest?.('button')) return;
      if (['ArrowRight', 'PageDown', ' ', 'Enter'].includes(e.key)) {
        e.preventDefault();
        onPresent();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  return (
    <div className="host guest-reveal" style={{ '--guest-color': guest.color } as CSSProperties}>
      {open ? <Sunburst color={guest.color} speedS={8} /> : <Spotlights />}
      <AnimatePresence mode="wait">
        {!open ? (
          <motion.div key="drum" className="guest-drum" exit={{ scale: 3, opacity: 0 }} transition={{ duration: 0.25 }}>
            <motion.div
              className="guest-drum-emoji"
              animate={{ x: [-14, 14, -14], rotate: [-8, 8, -8], scale: [1, 1.25, 1] }}
              transition={{ repeat: Infinity, duration: 0.18 }}
            >
              🥁
            </motion.div>
            <motion.p className="guest-drum-text" animate={{ opacity: [0.4, 1, 0.4] }} transition={{ repeat: Infinity, duration: 0.6 }}>
              Moment … da ist noch jemand!
            </motion.p>
          </motion.div>
        ) : (
          <motion.div key="open" className="guest-open">
            <motion.div
              className="guest-kicker"
              initial={{ y: -500, rotate: -25, scale: 3 }}
              animate={{ y: 0, rotate: -4, scale: 1 }}
              transition={{ type: 'spring', stiffness: 120, damping: 9 }}
            >
              <JumpText text="Überraschungsgast!" className="guest-hero" />
            </motion.div>
            <motion.div
              className="guest-avatar"
              initial={{ scale: 0, rotate: 1080 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ delay: 0.35, type: 'spring', stiffness: 70, damping: 8 }}
            >
              <motion.div animate={{ y: [0, -18, 0], rotate: [-4, 4, -4] }} transition={{ repeat: Infinity, duration: 1.4, delay: 1.5 }}>
                <Avatar person={guest} size={300} />
              </motion.div>
            </motion.div>
            <motion.h2
              className="guest-name"
              initial={{ letterSpacing: '1.5em', opacity: 0 }}
              animate={{ letterSpacing: '0.04em', opacity: 1 }}
              transition={{ delay: 0.9, duration: 0.9, ease: 'easeOut' }}
            >
              {guest.name}
            </motion.h2>
            <motion.button
              type="button"
              className="primary host-big-button guest-go"
              onClick={onPresent}
              initial={{ opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 2 }}
            >
              🎤 Bühne frei
            </motion.button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function GuestPresenting({ game, guest, onBack }: { game: HostGame; guest: HostGuestView; onBack(): void }) {
  // Only a fresh start gets the curtain and the download; a reload mid-talk must not repeat them.
  const [fresh] = useState(() => game.now() - (guest.presentingSince ?? 0) < 4000);
  const [curtain, setCurtain] = useState(fresh);

  useEffect(() => {
    if (!fresh) return;
    if (guest.presentation.kind === 'pptx') downloadPptx(guest.presentation.url);
    const t = setTimeout(() => setCurtain(false), 2600);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="host-presenting">
      <PresentationFrame
        kind={guest.presentation.kind}
        url={guest.presentation.url}
        speaker={guest}
        afterwards="Danach zurück in den Browser – Applaus!"
      />
      {curtain && <Curtain title="Bühne frei!" />}
      <div className="host-presenting-controls">
        <button type="button" onClick={onBack}>
          ⬅️ Zurück zum Finale
        </button>
      </div>
    </div>
  );
}
