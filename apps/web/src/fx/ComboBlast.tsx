import { useEffect } from 'react';
import { AnimatePresence, m as motion } from 'motion/react';
import { COMBO_THRESHOLD, type ComboEvent } from '@pribe/shared';
import { emojiBurst } from './confetti';
import { flash, shake } from './impact';
import { Shockwave } from './Fx';

/** R85: giant, over-the-top emoji with „COMBO x7“; one effect per streak, the counter bumps. */
export function ComboBlast({ combo }: { combo: ComboEvent | null }) {
  useEffect(() => {
    if (!combo) return;
    flash('#ffd000', 350);
    shake(26, 700);
    emojiBurst([combo.emoji], { x: 0.5, y: 0.5 }, 50);
  }, [combo?.id]);

  useEffect(() => {
    if (!combo || combo.count <= COMBO_THRESHOLD) return;
    shake(8 + Math.min(combo.count, 20), 250);
    emojiBurst([combo.emoji], { x: 0.5, y: 0.5 }, 12);
  }, [combo?.count]);

  return (
    <AnimatePresence>
      {combo && (
        <motion.div
          key={combo.id}
          className="fx-combo"
          aria-live="polite"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, scale: 3, transition: { duration: 0.4 } }}
        >
          <Shockwave color="#ffd000" size="70vmin" />
          <Shockwave color="#ffffff" size="70vmin" delay={0.15} />
          <motion.span
            className="fx-combo-emoji"
            initial={{ scale: 0, rotate: -540 }}
            animate={{ scale: [0, 1.5, 1.1, 1.25], rotate: [-540, 20, -12, 0] }}
            transition={{ duration: 0.9, times: [0, 0.45, 0.7, 1] }}
          >
            <motion.span
              style={{ display: 'inline-block' }}
              animate={{ rotate: [-8, 8, -8], scale: [1, 1.08, 1] }}
              transition={{ repeat: Infinity, duration: 0.5, delay: 0.9 }}
            >
              {combo.emoji}
            </motion.span>
          </motion.span>
          <motion.span
            key={combo.count}
            className="fx-combo-count"
            initial={{ scale: 3, rotate: -20, opacity: 0 }}
            animate={{ scale: 1, rotate: -8, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 500, damping: 12 }}
          >
            COMBO x{combo.count}
          </motion.span>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
