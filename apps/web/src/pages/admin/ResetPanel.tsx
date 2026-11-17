import { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { API_PATHS, RESET_ALL_CONFIRMATION, type ResetAllRequest, type ResetResponseDto } from '@pribe/shared';
import { api, ApiRequestError } from '../../lib/api';
import { useToast } from '../../shell';
import { Panel } from './Panel';

type ResetKind = 'game' | 'topics' | 'all';

const RESETS: Record<
  ResetKind,
  { label: string; hint: string; emoji: string; question: string; detail: string; confirm: string; done: string }
> = {
  game: {
    label: 'Spiel zurücksetzen …',
    hint: 'Wie frisch gestartet: Runden, Tipps und Spielstand weg. Personen, Einreichungen und Themen bleiben.',
    emoji: '🔄',
    question: 'Spiel zurücksetzen?',
    detail:
      'Alle Runden, Tipps und der Spielstand werden gelöscht, ein laufender Countdown stoppt. Gezeigte Präsentationen sind wieder im Pool.',
    confirm: 'Ja, Spiel zurücksetzen',
    done: 'Spiel zurückgesetzt',
  },
  topics: {
    label: 'Themen zurücksetzen …',
    hint: 'Alle Themen-Zuordnungen löschen; alle 18 Themen sind wieder frei.',
    emoji: '🎲',
    question: 'Themen zurücksetzen?',
    detail: 'Alle Themen-Zuordnungen werden gelöscht. Wer /submit wieder öffnet, bekommt ein neues Thema.',
    confirm: 'Ja, Themen zurücksetzen',
    done: 'Themen zurückgesetzt',
  },
  all: {
    label: 'Alles löschen …',
    hint: 'Zusätzlich Personen, Einreichungen, Dateien, Fotos und Themen. Einladungscode und Fristen bleiben.',
    emoji: '💣',
    question: 'Wirklich alles löschen?',
    detail:
      'Personen, Einreichungen samt Dateien, Fotos, Themen, Runden und Tipps werden gelöscht. Nur die Einstellungen bleiben.',
    confirm: 'Alles löschen',
    done: 'Alles gelöscht',
  },
};

const ENDPOINT: Record<ResetKind, string> = {
  game: API_PATHS.admin.reset,
  topics: API_PATHS.admin.resetTopics,
  all: API_PATHS.admin.resetAll,
};

/** `onReset` lets the page reload panels whose data a reset removed. */
export function ResetPanel({ onReset }: { onReset: () => void }) {
  const toast = useToast();
  const [confirming, setConfirming] = useState<ResetKind | null>(null);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);

  const open = (kind: ResetKind) => {
    setTyped('');
    setConfirming(kind);
  };
  const close = () => !busy && setConfirming(null);

  async function reset(kind: ResetKind) {
    setBusy(true);
    try {
      const body = kind === 'all' ? ({ confirm: RESET_ALL_CONFIRMATION } satisfies ResetAllRequest) : {};
      await api<ResetResponseDto>(ENDPOINT[kind], { body });
      toast(RESETS[kind].done, 'success');
      setConfirming(null);
      onReset();
    } catch (err) {
      toast(err instanceof ApiRequestError ? err.body.message : 'Zurücksetzen fehlgeschlagen.', 'error');
    } finally {
      setBusy(false);
    }
  }

  const current = confirming && RESETS[confirming];
  const blocked = busy || (confirming === 'all' && typed.trim() !== RESET_ALL_CONFIRMATION);

  return (
    <Panel title="Zurücksetzen" index={3}>
      {(Object.keys(RESETS) as ResetKind[]).map((kind) => (
        <div key={kind} className="stack-tight">
          <div className="row-start">
            <button type="button" className="danger" onClick={() => open(kind)}>
              {RESETS[kind].label}
            </button>
          </div>
          <p className="muted hint">{RESETS[kind].hint}</p>
        </div>
      ))}

      <AnimatePresence>
        {confirming && current && (
          <motion.div
            className="admin-dialog-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={close}
          >
            <motion.form
              role="dialog"
              aria-modal="true"
              aria-labelledby="reset-title"
              className="admin-dialog"
              initial={{ scale: 0.3, rotate: -8 }}
              animate={{ scale: 1, rotate: 0 }}
              exit={{ scale: 0.3, rotate: 8, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 380, damping: 14 }}
              onClick={(e) => e.stopPropagation()}
              onSubmit={(e) => {
                e.preventDefault();
                if (!blocked) void reset(confirming);
              }}
            >
              <div className="hero-emoji">{current.emoji}</div>
              <h2 id="reset-title" className="page-title">
                {current.question}
              </h2>
              <p>{current.detail} Das lässt sich nicht rückgängig machen.</p>
              {confirming === 'all' && (
                <label className="stack-tight">
                  <span>
                    Zum Bestätigen <strong>{RESET_ALL_CONFIRMATION}</strong> eintippen:
                  </span>
                  <input value={typed} onChange={(e) => setTyped(e.target.value)} autoFocus autoComplete="off" />
                </label>
              )}
              <div className="row-start">
                <button type="submit" className="danger" disabled={blocked}>
                  {current.confirm}
                </button>
                <button type="button" disabled={busy} onClick={close} autoFocus={confirming !== 'all'}>
                  Abbrechen
                </button>
              </div>
            </motion.form>
          </motion.div>
        )}
      </AnimatePresence>
    </Panel>
  );
}
