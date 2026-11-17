import type { ReactNode } from 'react';
import { motion } from 'motion/react';

/** Staggered pop-in shared by the admin panels. */
export function Panel({ title, index, children }: { title: string; index: number; children: ReactNode }) {
  return (
    <motion.section
      className="admin-panel"
      initial={{ opacity: 0, y: 40, rotate: index % 2 ? 2 : -2 }}
      animate={{ opacity: 1, y: 0, rotate: 0 }}
      transition={{ type: 'spring', stiffness: 200, damping: 16, delay: index * 0.08 }}
    >
      <h2 className="label admin-panel-title">{title}</h2>
      {children}
    </motion.section>
  );
}
