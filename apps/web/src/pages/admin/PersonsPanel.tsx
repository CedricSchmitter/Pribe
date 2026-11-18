import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { AnimatePresence, m as motion } from 'motion/react';
import { API_PATHS, type AdminPersonDto, type Person, type PersonInput } from '@pribe/shared';
import { api, ApiRequestError } from '../../lib/api';
import { useToast } from '../../shell';
import { Avatar } from '../../components/Avatar';
import { AvatarFields } from './AvatarFields';
import { AVATAR_COLORS, AVATAR_EMOJIS, randomOf } from './palette';
import { Panel } from './Panel';

const freshDraft = (): PersonInput => ({ name: '', emoji: randomOf(AVATAR_EMOJIS), color: randomOf(AVATAR_COLORS) });

export function PersonsPanel() {
  const toast = useToast();
  const [persons, setPersons] = useState<AdminPersonDto[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<PersonInput>(freshDraft);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setPersons(await api<AdminPersonDto[]>(API_PATHS.admin.persons));
  }, []);

  useEffect(() => {
    load().catch(() => toast('Personen konnten nicht geladen werden.', 'error'));
  }, [load, toast]);

  function startEdit(p: Person) {
    setEditingId(p.id);
    setDraft({ name: p.name, emoji: p.emoji, color: p.color });
  }

  function cancelEdit() {
    setEditingId(null);
    setDraft(freshDraft());
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      if (editingId) {
        await api<Person>(API_PATHS.admin.person(editingId), { method: 'PUT', body: draft });
        toast(`${draft.emoji} ${draft.name} gespeichert`, 'success');
      } else {
        await api<Person>(API_PATHS.admin.persons, { body: draft });
        toast(`${draft.emoji} ${draft.name} ist dabei!`, 'success');
      }
      cancelEdit();
      await load();
    } catch (err) {
      toast(err instanceof ApiRequestError ? err.body.message : 'Speichern fehlgeschlagen.', 'error');
    } finally {
      setBusy(false);
    }
  }

  async function resetPassword(p: AdminPersonDto) {
    if (confirmReset !== p.id) {
      setConfirmReset(p.id);
      return;
    }
    setConfirmReset(null);
    try {
      await api(API_PATHS.admin.personPasswordReset(p.id), { method: 'POST', body: {} });
      toast(`${p.name} legt beim nächsten Besuch ein neues Passwort fest`, 'success');
      await load();
    } catch (err) {
      toast(err instanceof ApiRequestError ? err.body.message : 'Zurücksetzen fehlgeschlagen.', 'error');
    }
  }

  async function removePhoto(p: AdminPersonDto) {
    try {
      await api(API_PATHS.admin.personPhoto(p.id), { method: 'DELETE' });
      toast(`Foto von ${p.name} entfernt`, 'neutral');
      await load();
    } catch (err) {
      toast(err instanceof ApiRequestError ? err.body.message : 'Entfernen fehlgeschlagen.', 'error');
    }
  }

  async function remove(p: Person) {
    if (confirmDelete !== p.id) {
      setConfirmDelete(p.id);
      return;
    }
    setConfirmDelete(null);
    try {
      await api(API_PATHS.admin.person(p.id), { method: 'DELETE' });
      if (editingId === p.id) cancelEdit();
      toast(`${p.name} entfernt`, 'neutral');
      await load();
    } catch (err) {
      toast(err instanceof ApiRequestError ? err.body.message : 'Entfernen fehlgeschlagen.', 'error');
    }
  }

  return (
    <Panel title={`Personen (${persons.length})`} index={0}>
      <form className="person-editor" onSubmit={save}>
        <motion.div
          key={`${draft.emoji}${draft.color}`}
          className="person-editor-preview"
          initial={{ scale: 0.4, rotate: -30 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: 'spring', stiffness: 400, damping: 10 }}
        >
          <Avatar person={draft} size={72} />
        </motion.div>
        <label className="stack-tight">
          <span className="label">Name</span>
          <input
            value={draft.name}
            maxLength={40}
            placeholder="z.B. Anna"
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          />
        </label>

        <AvatarFields value={draft} onChange={(v) => setDraft({ ...draft, ...v })} />

        <div className="row-start">
          <button type="submit" disabled={busy || !draft.name.trim() || !draft.emoji.trim()}>
            {editingId ? 'Speichern' : 'Person anlegen'}
          </button>
          {editingId && (
            <button type="button" onClick={cancelEdit}>
              Abbrechen
            </button>
          )}
          <button type="button" className="ghost" onClick={() => setDraft({ ...draft, ...freshDraft(), name: draft.name })}>
            🎲 Würfeln
          </button>
        </div>
      </form>

      <ul className="person-list">
        <AnimatePresence initial={false}>
          {persons.map((p) => (
            <motion.li
              key={p.id}
              layout
              initial={{ opacity: 0, x: -60, scale: 0.8 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 120, rotate: 12 }}
              transition={{ type: 'spring', stiffness: 300, damping: 20 }}
              className={`person-row${editingId === p.id ? ' editing' : ''}`}
            >
              <Avatar person={p} size={40} />
              <span className="person-name">
                {p.name}
                <span className="muted person-pw">{p.hasPassword ? '🔑 Passwort gesetzt' : 'noch kein Passwort'}</span>
              </span>
              {p.hasPassword && (
                <button
                  type="button"
                  className={confirmReset === p.id ? 'danger' : 'ghost'}
                  onClick={() => void resetPassword(p)}
                  onBlur={() => setConfirmReset((id) => (id === p.id ? null : id))}
                >
                  {confirmReset === p.id ? 'Wirklich zurücksetzen?' : 'Passwort zurücksetzen'}
                </button>
              )}
              {p.photoUrl && (
                <button type="button" className="ghost" onClick={() => void removePhoto(p)}>
                  Foto entfernen
                </button>
              )}
              <button type="button" className="ghost" onClick={() => startEdit(p)}>
                Bearbeiten
              </button>
              <button
                type="button"
                className={confirmDelete === p.id ? 'danger' : 'ghost'}
                onClick={() => remove(p)}
                onBlur={() => setConfirmDelete((id) => (id === p.id ? null : id))}
              >
                {confirmDelete === p.id ? 'Wirklich entfernen?' : 'Entfernen'}
              </button>
            </motion.li>
          ))}
        </AnimatePresence>
        {persons.length === 0 && <li className="muted">Noch niemand angelegt.</li>}
      </ul>
    </Panel>
  );
}
