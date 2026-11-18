import { useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from 'react';
import { AnimatePresence, m as motion } from 'motion/react';
import {
  API_PATHS,
  PERSON_PASSWORD_MIN,
  type Person,
  type PersonMeDto,
  type RegisterRequest,
} from '@pribe/shared';
import { Avatar } from '../../components/Avatar';
import { api, ApiRequestError } from '../../lib/api';
import { useToast } from '../../shell';
import { AVATAR_COLORS, AVATAR_EMOJIS, randomOf } from '../admin/palette';
import { squareJpeg, uploadPhoto } from './photo';

type AvatarMode = 'photo' | 'emoji';

/**
 * Self-registration with the invite code (D27). Usable from `/vote` as well: it only needs
 * the prefilled code and a callback with the logged-in person.
 */
export function RegisterStep({
  initialCode,
  onRegistered,
  onBack,
}: {
  initialCode: string;
  onRegistered: (me: Person) => void;
  onBack: () => void;
}) {
  const toast = useToast();
  const [code, setCode] = useState(initialCode);
  const [name, setName] = useState('');
  const [mode, setMode] = useState<AvatarMode>('photo');
  const [emoji, setEmoji] = useState<string>(() => randomOf(AVATAR_EMOJIS));
  const [color, setColor] = useState<string>(() => randomOf(AVATAR_COLORS));
  const [photo, setPhoto] = useState<Blob | null>(null);
  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const photoUrl = useMemo(() => (photo ? URL.createObjectURL(photo) : null), [photo]);
  useEffect(() => () => void (photoUrl && URL.revokeObjectURL(photoUrl)), [photoUrl]);

  const preview = { name: name || '?', emoji, color, photoUrl: mode === 'photo' ? photoUrl : null };
  const valid =
    code.trim() && name.trim() && password.length >= PERSON_PASSWORD_MIN && password === repeat && (mode === 'emoji' || photo);

  async function pickPhoto(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setError(null);
    try {
      setPhoto(await squareJpeg(file));
    } catch {
      setError('Das Foto ließ sich nicht lesen. Probier ein anderes oder nimm ein Emoji.');
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!valid) return;
    setBusy(true);
    setError(null);
    try {
      const body: RegisterRequest = { inviteCode: code.trim(), name: name.trim(), emoji, color, password };
      let { person } = await api<PersonMeDto>(API_PATHS.person.register, { body });
      if (mode === 'photo' && photo) {
        try {
          person = (await uploadPhoto(photo)).person;
        } catch {
          // Registered anyway; the emoji stays as fallback.
          toast('Konto angelegt, aber das Foto ging nicht hoch. Du bist jetzt mit Emoji unterwegs.', 'warning', 6000);
        }
      }
      if (person) onRegistered(person);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.body.message : 'Registrieren fehlgeschlagen.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="stack register" onSubmit={submit}>
      <div className="row-between">
        <h1>Neu hier</h1>
        <button type="button" className="ghost" onClick={onBack}>
          Ich hab schon ein Konto
        </button>
      </div>

      <label className="stack-tight">
        <span className="label">Einladungscode</span>
        <input value={code} onChange={(e) => setCode(e.target.value)} autoCapitalize="off" autoComplete="off" />
      </label>

      <label className="stack-tight">
        <span className="label">Name</span>
        <input value={name} maxLength={40} onChange={(e) => setName(e.target.value)} autoComplete="nickname" />
      </label>

      <div className="stack-tight">
        <span className="label">Avatar</span>
        <div className="register-preview">
          <motion.div
            key={`${mode}-${photoUrl ?? ''}-${emoji}-${color}`}
            initial={{ scale: 0.3, rotate: -40 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: 'spring', stiffness: 380, damping: 11 }}
          >
            <Avatar person={preview} size="xl" />
          </motion.div>
          <div className="segmented" role="tablist">
            <button type="button" role="tab" aria-selected={mode === 'photo'} className={mode === 'photo' ? 'active' : ''} onClick={() => setMode('photo')}>
              📷 Foto
            </button>
            <button type="button" role="tab" aria-selected={mode === 'emoji'} className={mode === 'emoji' ? 'active' : ''} onClick={() => setMode('emoji')}>
              😀 Emoji
            </button>
          </div>
        </div>

        <AnimatePresence mode="wait" initial={false}>
          {mode === 'photo' ? (
            <motion.div key="photo" className="photo-buttons" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
              <label className="button">
                📸 Selfie aufnehmen
                <input type="file" accept="image/*" capture="user" className="visually-hidden" onChange={pickPhoto} />
              </label>
              <label className="button">
                🖼️ Aus Galerie
                <input type="file" accept="image/*" className="visually-hidden" onChange={pickPhoto} />
              </label>
              <span className="muted hint">Wird quadratisch zugeschnitten. Ohne Foto nimm einfach ein Emoji.</span>
            </motion.div>
          ) : (
            <motion.div key="emoji" className="stack-tight" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
              <div className="emoji-grid" role="radiogroup" aria-label="Emoji">
                {AVATAR_EMOJIS.map((em) => (
                  <button
                    key={em}
                    type="button"
                    role="radio"
                    aria-checked={emoji === em}
                    className={`emoji-choice${emoji === em ? ' selected' : ''}`}
                    onClick={() => setEmoji(em)}
                  >
                    {em}
                  </button>
                ))}
              </div>
              <div className="color-grid" role="radiogroup" aria-label="Farbe">
                {AVATAR_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    role="radio"
                    aria-checked={color === c}
                    aria-label={c}
                    className={`color-choice${color === c ? ' selected' : ''}`}
                    style={{ background: c }}
                    onClick={() => setColor(c)}
                  />
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <label className="stack-tight">
        <span className="label">Passwort</span>
        <input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        <span className="muted hint">Mindestens {PERSON_PASSWORD_MIN} Zeichen. Gilt auch fürs Abstimmen.</span>
      </label>
      <label className="stack-tight">
        <span className="label">Nochmal</span>
        <input type="password" autoComplete="new-password" value={repeat} onChange={(e) => setRepeat(e.target.value)} />
        {repeat && repeat !== password && <span className="error">Die Passwörter stimmen nicht überein.</span>}
      </label>

      {error && <p className="inline-warning">{error}</p>}
      <button type="submit" disabled={busy || !valid}>
        {busy ? 'Moment …' : 'Registrieren'}
      </button>
    </form>
  );
}
