import { AnimatePresence, motion } from 'motion/react';
import { useState } from 'react';
import { API_PATHS, type Person, type PersonAuthStatusDto } from '@pribe/shared';
import { api } from '../../lib/api';
import { useToast } from '../../shell';
import { PasswordStep } from '../submit/PasswordStep';
import { PersonPicker } from '../submit/PersonPicker';
import { RegisterStep } from '../submit/RegisterStep';
import '../submit/submit.css';

type Step = { kind: 'pick' } | { kind: 'register' } | { kind: 'password'; person: Person; hasPassword: boolean };

/** D25/D27: pick your name and enter (or set) your password, or register with the invite code. */
export function VoteLogin({
  persons,
  inviteCode,
  startWithRegister,
  onLoggedIn,
}: {
  persons: Person[];
  inviteCode: string;
  startWithRegister: boolean;
  onLoggedIn(me: Person): void;
}) {
  const toast = useToast();
  const [step, setStep] = useState<Step>({ kind: startWithRegister ? 'register' : 'pick' });

  async function choose(id: string) {
    const person = persons.find((p) => p.id === id);
    if (!person) return;
    try {
      const { hasPassword } = await api<PersonAuthStatusDto>(API_PATHS.person.status(id));
      setStep({ kind: 'password', person, hasPassword });
    } catch {
      toast('Das hat nicht geklappt. Bitte nochmal.', 'error');
    }
  }

  let content;
  if (step.kind === 'pick') {
    content = <PersonPicker persons={persons} onChoose={(id) => void choose(id)} onRegister={() => setStep({ kind: 'register' })} />;
  } else if (step.kind === 'register') {
    content = <RegisterStep initialCode={inviteCode} onRegistered={onLoggedIn} onBack={() => setStep({ kind: 'pick' })} />;
  } else {
    content = (
      <PasswordStep person={step.person} hasPassword={step.hasPassword} onLoggedIn={onLoggedIn} onBack={() => setStep({ kind: 'pick' })} />
    );
  }

  return (
    <div className="vote-page submit">
      <AnimatePresence mode="wait">
        <motion.div
          key={step.kind}
          initial={{ opacity: 0, x: 80, rotate: 2 }}
          animate={{ opacity: 1, x: 0, rotate: 0 }}
          exit={{ opacity: 0, x: -80, rotate: -2 }}
          transition={{ type: 'spring', stiffness: 260, damping: 22 }}
        >
          {content}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
