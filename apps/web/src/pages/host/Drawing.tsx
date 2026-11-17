import { useEffect, useRef } from 'react';
import { motion } from 'motion/react';
import { emojiBurst, JumpText, shake, Sunburst } from '../../fx';
import { burstConfetti } from '../../lib/confetti';
import { Avatar } from './Avatar';
import { downloadPptx } from './download';
import type { HostGame } from './useHostGame';

const DRAW_MS = 4200;
const CARDS = ['📄', '📊', '📈', '🖼️', '📑', '🗂️', '📃', '📉'];

/** Draw show; when it ends the presentation starts and voting opens (`round:start`). */
export function Drawing({ game, onError }: { game: HostGame; onError(msg: string): void }) {
  const snap = game.snapshot!;
  const round = snap.round!;
  const presenter = game.person(round.presenterId);
  const fired = useRef(false);

  useEffect(() => {
    // Rumble that builds up until the card explodes.
    const rumbles = [1800, 2600, 3200, 3700].map((ms, i) => setTimeout(() => shake(4 + i * 4, 300), ms));
    const t = setTimeout(async () => {
      if (fired.current) return;
      fired.current = true;
      burstConfetti({ x: 0.5, y: 0.5 }, presenter ? [presenter.color, '#ffd000', '#ffffff'] : undefined);
      emojiBurst(CARDS.slice(0, 4), { x: 0.5, y: 0.55 }, 40);
      shake(28, 700);
      const res = await game.command('round:start');
      if (!res.ok) {
        fired.current = false;
        // A second host client (another beamer tab or the remote) already started the round.
        if (res.error === 'WRONG_PHASE') return;
        return onError(res.message);
      }
      if (round.submission.kind === 'pptx') downloadPptx(round.submission.url);
    }, DRAW_MS);
    return () => {
      clearTimeout(t);
      rumbles.forEach(clearTimeout);
    };
    // Once per round.
  }, [round.id]);

  return (
    <div className="host-drawing">
      <Sunburst color={presenter?.color ?? '#ffd000'} speedS={3} />
      <motion.div
        className="host-drawing-presenter"
        initial={{ y: -400, scale: 3, rotate: -30 }}
        animate={{ y: 0, scale: 1, rotate: 0 }}
        transition={{ type: 'spring', stiffness: 80, damping: 9 }}
      >
        <Avatar person={presenter} size={140} />
        <div className="host-drawing-name">
          <JumpText text={`${presenter?.name ?? ''} zieht …`} />
        </div>
      </motion.div>
      <div className="host-drawing-cards">
        {CARDS.map((c, i) => (
          <motion.div
            key={i}
            className="host-drawing-card"
            initial={{ x: 0, y: 0, rotate: 0, opacity: 0 }}
            animate={{
              x: [0, Math.cos((i / CARDS.length) * 2 * Math.PI) * 500, 0],
              y: [0, Math.sin((i / CARDS.length) * 2 * Math.PI) * 260, 0],
              rotate: [0, 720, 1440],
              opacity: [0, 1, i === 0 ? 1 : 0],
              scale: [0.5, 1.2, i === 0 ? 4 : 0],
            }}
            transition={{ duration: DRAW_MS / 1000 - 0.3, ease: 'easeInOut', times: [0, 0.6, 1] }}
          >
            {c}
          </motion.div>
        ))}
      </div>
      <motion.div
        className="host-drawing-flash"
        initial={{ opacity: 0 }}
        animate={{ opacity: [0, 0, 1, 0] }}
        transition={{ duration: DRAW_MS / 1000, times: [0, 0.85, 0.93, 1] }}
      />
    </div>
  );
}
