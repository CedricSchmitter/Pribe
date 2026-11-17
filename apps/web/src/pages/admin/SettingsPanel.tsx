import { useEffect, useState, type FormEvent } from 'react';
import { API_PATHS, inviteLink, type AdminSettingsDto, type SettingsInput } from '@pribe/shared';
import { api, ApiRequestError } from '../../lib/api';
import { useToast } from '../../shell';
import { fromLocalInput, toLocalInput } from '../submit/time';
import { Panel } from './Panel';

interface Form {
  deadline: string;
  talkMinutes: string;
  voteCountdownS: string;
  inviteCode: string;
}

const toForm = (s: AdminSettingsDto): Form => ({
  deadline: toLocalInput(s.submissionDeadline),
  talkMinutes: String(s.talkTimeLimitS / 60),
  voteCountdownS: String(s.voteCountdownS),
  inviteCode: s.inviteCode ?? '',
});

function randomCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
}

export function SettingsPanel() {
  const toast = useToast();
  const [saved, setSaved] = useState<AdminSettingsDto | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<AdminSettingsDto>(API_PATHS.admin.settings)
      .then((s) => {
        setSaved(s);
        setForm(toForm(s));
      })
      .catch(() => toast('Einstellungen konnten nicht geladen werden.', 'error'));
  }, [toast]);

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!form) return;
    const body: SettingsInput = {
      submissionDeadline: fromLocalInput(form.deadline),
      talkTimeLimitS: Math.round(Number(form.talkMinutes) * 60),
      voteCountdownS: Math.round(Number(form.voteCountdownS)),
      inviteCode: form.inviteCode.trim() || null,
    };
    setBusy(true);
    try {
      const s = await api<AdminSettingsDto>(API_PATHS.admin.settings, { method: 'PUT', body });
      setSaved(s);
      setForm(toForm(s));
      toast('Einstellungen gespeichert', 'success');
    } catch (err) {
      const hint = ' Code: 4–64 Zeichen, nur Buchstaben, Ziffern, - und _.';
      toast(
        err instanceof ApiRequestError
          ? `${err.body.message}${err.body.error === 'INVALID_PAYLOAD' ? hint : ''}`
          : 'Speichern fehlgeschlagen.',
        'error',
      );
    } finally {
      setBusy(false);
    }
  }

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast('Link kopiert', 'success');
    } catch {
      toast('Kopieren ging nicht – bitte von Hand markieren.', 'warning');
    }
  }

  if (!form || !saved) return null;

  const links = saved.inviteCode
    ? (['/vote', '/submit'] as const).map((p) => ({ path: p, url: inviteLink(saved.publicUrl, p, saved.inviteCode!) }))
    : [];

  return (
    <Panel title="Einstellungen" index={1}>
      <form className="stack" onSubmit={save}>
        <label className="stack-tight">
          <span className="label">Einsendeschluss</span>
          <div className="inline-field">
            <input
              type="datetime-local"
              value={form.deadline}
              onChange={(e) => setForm({ ...form, deadline: e.target.value })}
            />
            {form.deadline && (
              <button type="button" className="ghost" onClick={() => setForm({ ...form, deadline: '' })}>
                Entfernen
              </button>
            )}
          </div>
          <span className="muted hint">Ohne Einsendeschluss sind Uploads bis zum Spielstart offen.</span>
        </label>
        <label className="stack-tight">
          <span className="label">Zeitlimit pro Vortrag (Minuten)</span>
          <input
            type="number"
            min={0}
            max={60}
            step={0.5}
            value={form.talkMinutes}
            onChange={(e) => setForm({ ...form, talkMinutes: e.target.value })}
          />
          <span className="muted hint">0 = kein Zeitlimit</span>
        </label>
        <label className="stack-tight">
          <span className="label">Vote-Countdown (Sekunden)</span>
          <input
            type="number"
            min={1}
            max={600}
            value={form.voteCountdownS}
            onChange={(e) => setForm({ ...form, voteCountdownS: e.target.value })}
          />
        </label>
        <div className="stack-tight">
          <label className="stack-tight">
            <span className="label">Einladungscode</span>
            <div className="inline-field">
              <input
                value={form.inviteCode}
                placeholder="leer = Registrierung zu"
                maxLength={64}
                autoComplete="off"
                onChange={(e) => setForm({ ...form, inviteCode: e.target.value })}
              />
              <button type="button" className="ghost" onClick={() => setForm({ ...form, inviteCode: randomCode() })}>
                🎲 Neu
              </button>
            </div>
          </label>
          <span className="muted hint">Wer den Code hat, kann sich selbst registrieren. Ändern macht alte Links ungültig.</span>
          {links.map((l) => (
            <div key={l.path} className="invite-link">
              <code>{l.url}</code>
              <button type="button" className="ghost" onClick={() => void copy(l.url)}>
                Kopieren
              </button>
            </div>
          ))}
        </div>
        <div className="row-start">
          <button type="submit" disabled={busy}>
            Speichern
          </button>
        </div>
      </form>
    </Panel>
  );
}
