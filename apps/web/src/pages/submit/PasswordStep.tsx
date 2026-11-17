import { useState, type FormEvent } from 'react';
import { motion } from 'motion/react';
import {
  API_PATHS,
  PERSON_PASSWORD_MIN,
  type Person,
  type PersonCredentialsRequest,
  type PersonMeDto,
} from '@pribe/shared';
import { api, ApiRequestError } from '../../lib/api';
import { Avatar } from '../../components/Avatar';

/** First visit: choose a password. Later: enter it (D25). */
export function PasswordStep({
  person,
  hasPassword,
  onLoggedIn,
  onBack,
}: {
  person: Person;
  hasPassword: boolean;
  onLoggedIn: (me: Person) => void;
  onBack: () => void;
}) {
  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [shake, setShake] = useState(0);

  const tooShort = password.length < PERSON_PASSWORD_MIN;
  const mismatch = !hasPassword && repeat.length > 0 && repeat !== password;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (tooShort || (!hasPassword && repeat !== password)) return;
    setBusy(true);
    setError(null);
    try {
      const body: PersonCredentialsRequest = { personId: person.id, password };
      const res = await api<PersonMeDto>(hasPassword ? API_PATHS.person.login : API_PATHS.person.setPassword, { body });
      if (res.person) onLoggedIn(res.person);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.body.message : 'Anmeldung fehlgeschlagen.');
      setShake((n) => n + 1);
    } finally {
      setBusy(false);
    }
  }

  return (
    <motion.form
      className="stack"
      onSubmit={submit}
      key={shake}
      animate={shake ? { x: [0, -14, 12, -8, 5, 0] } : undefined}
      transition={{ duration: 0.4 }}
    >
      <div className="me-row">
        <Avatar person={person} size={56} />
        <div className="me-text">
          <span className="muted">{hasPassword ? 'Willkommen zurück' : 'Hallo'}</span>
          <strong className="me-name">{person.name}</strong>
        </div>
        <button type="button" className="ghost" onClick={onBack}>
          Ändern
        </button>
      </div>

      <h1>{hasPassword ? 'Passwort eingeben' : 'Passwort festlegen'}</h1>
      {!hasPassword && (
        <p className="muted">
          Damit nur du unter deinem Namen einreichst und abstimmst. Gilt auch für „Abstimmen“ am Abend.
        </p>
      )}

      <label className="stack-tight">
        <span className="label">Passwort</span>
        <input
          type="password"
          autoComplete={hasPassword ? 'current-password' : 'new-password'}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoFocus
        />
        {!hasPassword && <span className="muted hint">Mindestens {PERSON_PASSWORD_MIN} Zeichen.</span>}
      </label>
      {!hasPassword && (
        <label className="stack-tight">
          <span className="label">Nochmal</span>
          <input
            type="password"
            autoComplete="new-password"
            value={repeat}
            onChange={(e) => setRepeat(e.target.value)}
          />
          {mismatch && <span className="error">Die Passwörter stimmen nicht überein.</span>}
        </label>
      )}
      {error && <p className="inline-warning">{error}</p>}
      <button type="submit" disabled={busy || tooShort || (!hasPassword && repeat !== password)}>
        {hasPassword ? 'Anmelden' : 'Passwort speichern'}
      </button>
    </motion.form>
  );
}
