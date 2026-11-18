import { m as motion } from 'motion/react';
import './probeBanner.css';

/** R83: unmistakable marker while the bots play in the test-run database. */
export function ProbeBanner({ size = 'normal' }: { size?: 'normal' | 'large' }) {
  return (
    <motion.div
      className={`probe-banner probe-banner-${size}`}
      role="status"
      initial={{ y: -80 }}
      animate={{ y: 0 }}
      transition={{ type: 'spring', stiffness: 300, damping: 18 }}
    >
      🧪 PROBELAUF 🤖
    </motion.div>
  );
}
