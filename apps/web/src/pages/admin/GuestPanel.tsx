import { useCallback, useEffect, useRef, useState } from 'react';
import { API_PATHS, PHOTO_FIELD, UPLOAD_FIELDS, type AdminGuestDto, type ApiError, type GuestInput, type Person } from '@pribe/shared';
import { Avatar } from '../../components/Avatar';
import { api, ApiRequestError } from '../../lib/api';
import { useToast } from '../../shell';
import { squareJpeg } from '../submit/photo';
import { AvatarFields } from './AvatarFields';
import { Panel } from './Panel';

async function sendForm(path: string, method: 'PUT' | 'POST', field: string, file: Blob, name: string): Promise<AdminGuestDto> {
  const form = new FormData();
  form.append(field, file, name);
  const res = await fetch(path, { method, body: form, credentials: 'same-origin' });
  const body = (await res.json()) as AdminGuestDto | ApiError;
  if (!res.ok) throw new ApiRequestError(res.status, body as ApiError);
  return body as AdminGuestDto;
}

const STATUS_LABEL = { converting: '⏳ wird bereinigt …', ready: '✅ bereit', failed: '❌ fehlgeschlagen' } as const;

/**
 * Surprise guest after the finale (R90): an existing person or an own entry that is no player
 * (no login, no votes, not in the ranking), plus a presentation that never enters the pool.
 */
export function GuestPanel() {
  const toast = useToast();
  const [guest, setGuest] = useState<AdminGuestDto | null>(null);
  const [persons, setPersons] = useState<Person[]>([]);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const photoInput = useRef<HTMLInputElement>(null);

  const apply = useCallback((g: AdminGuestDto) => {
    setGuest(g);
    setName(g.name);
  }, []);

  useEffect(() => {
    Promise.all([api<AdminGuestDto>(API_PATHS.admin.guest), api<Person[]>(API_PATHS.admin.persons)])
      .then(([g, p]) => {
        apply(g);
        setPersons(p);
      })
      .catch(() => toast('Überraschungsgast konnte nicht geladen werden.', 'error'));
  }, [apply, toast]);

  // A PPTX is cleaned in the background; poll until it is done.
  const converting = guest?.presentation?.status === 'converting';
  useEffect(() => {
    if (!converting) return;
    const t = setInterval(() => void api<AdminGuestDto>(API_PATHS.admin.guest).then(setGuest).catch(() => {}), 1000);
    return () => clearInterval(t);
  }, [converting]);

  async function act(fn: () => Promise<AdminGuestDto>, done?: string) {
    setBusy(true);
    try {
      const g = await fn();
      setGuest(g);
      if (done) toast(done, 'success');
      return g;
    } catch (err) {
      toast(err instanceof ApiRequestError ? err.body.message : 'Speichern fehlgeschlagen.', 'error');
      return null;
    } finally {
      setBusy(false);
    }
  }

  const update = (patch: GuestInput, done?: string) =>
    act(() => api<AdminGuestDto>(API_PATHS.admin.guest, { method: 'PUT', body: patch }), done);

  if (!guest) return <Panel title="Überraschungsgast" index={3}>{null}</Panel>;

  const picked = persons.find((p) => p.id === guest.personId) ?? null;
  const own = { name: name || 'Gast', emoji: guest.emoji, color: guest.color, photoUrl: guest.photoUrl };

  return (
    <Panel title="Überraschungsgast" index={3}>
      <div className="stack">
        <label className="row-start">
          <input
            type="checkbox"
            checked={guest.enabled}
            disabled={busy}
            onChange={(e) => void update({ enabled: e.target.checked }, e.target.checked ? 'Überraschungsgast an' : 'Überraschungsgast aus')}
          />
          <span>Überraschungsgast an/aus</span>
        </label>
        <p className="muted">
          {guest.ready
            ? '🎁 Bereit: nach der Foto-Wand im Finale kommt der Auftritt.'
            : 'Kommt nach dem Finale, sobald er eingeschaltet ist, einen Namen und eine fertige Präsentation hat.'}
        </p>

        <label className="stack-tight">
          <span className="label">Wer ist es?</span>
          <select value={guest.personId ?? ''} disabled={busy} onChange={(e) => void update({ personId: e.target.value || null })}>
            <option value="">Eigener Eintrag (spielt nicht mit)</option>
            {persons.map((p) => (
              <option key={p.id} value={p.id}>
                {p.emoji} {p.name}
              </option>
            ))}
          </select>
        </label>

        {picked ? (
          <div className="row-start">
            <Avatar person={picked} size={56} />
            <span>{picked.name} – Name und Foto kommen aus der Personenliste.</span>
          </div>
        ) : (
          <>
            <div className="row-start">
              <Avatar person={own} size={72} />
              <label className="stack-tight">
                <span className="label">Name</span>
                <input
                  value={name}
                  maxLength={40}
                  placeholder="z.B. Die Chefin"
                  onChange={(e) => setName(e.target.value)}
                  onBlur={() => name.trim() !== guest.name && void update({ name: name.trim() })}
                />
              </label>
            </div>
            <AvatarFields value={guest} onChange={(patch) => void update(patch)} />
            <div className="row-start">
              <button type="button" disabled={busy} onClick={() => photoInput.current?.click()}>
                📷 Foto wählen
              </button>
              {guest.photoUrl && (
                <button type="button" className="ghost" disabled={busy} onClick={() => void act(() => api(API_PATHS.admin.guestPhoto, { method: 'DELETE' }))}>
                  Foto entfernen
                </button>
              )}
              <input
                ref={photoInput}
                type="file"
                accept="image/*"
                hidden
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  e.target.value = '';
                  if (!file) return;
                  const jpeg = await squareJpeg(file).catch(() => null);
                  if (!jpeg) return toast('Das Bild ließ sich nicht lesen.', 'error');
                  await act(() => sendForm(API_PATHS.admin.guestPhoto, 'PUT', PHOTO_FIELD, jpeg, 'guest.jpg'), 'Foto gespeichert');
                }}
              />
            </div>
          </>
        )}

        <div className="stack-tight">
          <span className="label">Präsentation (nicht im Pool)</span>
          <div className="row-start">
            <span>
              {guest.presentation
                ? `${guest.presentation.kind.toUpperCase()} · ${STATUS_LABEL[guest.presentation.status]}${guest.presentation.error ? ` (${guest.presentation.error})` : ''}`
                : 'Noch keine'}
            </span>
            <button type="button" disabled={busy} onClick={() => fileInput.current?.click()}>
              {guest.presentation ? '⬆️ Ersetzen' : '⬆️ Hochladen'}
            </button>
            {guest.presentation && (
              <button
                type="button"
                className="ghost"
                disabled={busy}
                onClick={() => void act(() => api(API_PATHS.admin.guestPresentation, { method: 'DELETE' }), 'Präsentation entfernt')}
              >
                Entfernen
              </button>
            )}
            <input
              ref={fileInput}
              type="file"
              accept=".html,.htm,.pptx"
              hidden
              onChange={async (e) => {
                const file = e.target.files?.[0];
                e.target.value = '';
                if (!file) return;
                await act(() => sendForm(API_PATHS.admin.guestPresentation, 'POST', UPLOAD_FIELDS.file, file, file.name), 'Präsentation hochgeladen');
              }}
            />
          </div>
        </div>
      </div>
    </Panel>
  );
}
