import { motion } from 'motion/react';
import type { Person } from '@pribe/shared';
import { Avatar } from '../../components/Avatar';

export function PersonPicker({
  persons,
  onChoose,
  onRegister,
}: {
  persons: Person[];
  onChoose: (id: string) => void;
  onRegister: () => void;
}) {
  return (
    <section className="stack">
      <h1>Wer bist du?</h1>
      <div className="person-picker-actions">
        <motion.button
          type="button"
          className="primary upload-button"
          whileTap={{ scale: 0.92 }}
          animate={{ rotate: [0, -2, 2, 0] }}
          transition={{ repeat: Infinity, repeatDelay: 3, duration: 0.5 }}
          onClick={onRegister}
        >
          ✨ Neu hier? Registrieren
        </motion.button>
        <p className="muted">Schon registriert? Wähl deinen Namen. Niemand sieht, wer was eingereicht hat.</p>
      </div>
      <ul className="person-picker">
        {persons.map((p, i) => (
          <motion.li
            key={p.id}
            initial={{ opacity: 0, y: 30, scale: 0.7 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ type: 'spring', stiffness: 320, damping: 14, delay: i * 0.04 }}
          >
            <motion.button
              type="button"
              className="person-pick"
              whileTap={{ scale: 0.9, rotate: -4 }}
              onClick={() => onChoose(p.id)}
            >
              <Avatar person={p} size={44} />
              <span>{p.name}</span>
            </motion.button>
          </motion.li>
        ))}
      </ul>
    </section>
  );
}
