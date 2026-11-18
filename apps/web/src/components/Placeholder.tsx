import type { ReactNode } from 'react';
import { m as motion } from 'motion/react';

export function Placeholder({ emoji, title, children }: { emoji: string; title: string; children?: ReactNode }) {
  return (
    <main className="page center stack">
      <motion.div
        className="hero-emoji"
        initial={{ scale: 0, rotate: -180 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ type: 'spring', stiffness: 260, damping: 12 }}
      >
        {emoji}
      </motion.div>
      <h1>{title}</h1>
      {children}
    </main>
  );
}
