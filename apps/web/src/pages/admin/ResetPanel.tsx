import { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { API_PATHS, type ResetRequest, type ResetResponseDto } from '@pribe/shared';
import { api, ApiRequestError } from '../../lib/api';
import { useToast } from '../../shell';
import { Panel } from './Panel';

export function ResetPanel() {
  const toast = useToast();
  const [deleteSubmissions, setDeleteSubmissions] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  async function reset() {
    setBusy(true);
    try {
      const res = await api<ResetResponseDto>(API_PATHS.admin.reset, {
        body: { deleteSubmissions } satisfies ResetRequest,
      });
      toast(
        res.submissionsDeleted
          ? `Spiel zurückgesetzt, ${res.submissionsDeleted} ${res.submissionsDeleted === 1 ? 'Einreichung' : 'Einreichungen'} gelöscht`
          : 'Spiel zurückgesetzt',
        'success',
      );
      setConfirming(false);
      setDeleteSubmissions(false);
    } catch (err) {
      toast(err instanceof ApiRequestError ? err.body.message : 'Zurücksetzen fehlgeschlagen.', 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel title="Spiel zurücksetzen" index={3}>
      <p className="muted">Löscht alle Runden und Tipps. Personen bleiben erhalten.</p>
      <label className="checkbox">
        <input type="checkbox" checked={deleteSubmissions} onChange={(e) => setDeleteSubmissions(e.target.checked)} />
        <span>Einreichungen auch löschen</span>
      </label>
      <div className="row-start">
        <button type="button" className="danger" onClick={() => setConfirming(true)}>
          Zurücksetzen …
        </button>
      </div>

      <AnimatePresence>
        {confirming && (
          <motion.div
            className="admin-dialog-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => !busy && setConfirming(false)}
          >
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-labelledby="reset-title"
              className="admin-dialog"
              initial={{ scale: 0.3, rotate: -8 }}
              animate={{ scale: 1, rotate: 0 }}
              exit={{ scale: 0.3, rotate: 8, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 380, damping: 14 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="hero-emoji">💣</div>
              <h2 id="reset-title" className="page-title">
                Wirklich zurücksetzen?
              </h2>
              <p>
                Runden und Tipps werden gelöscht
                {deleteSubmissions ? ', dazu alle Einreichungen samt Dateien.' : '. Einreichungen bleiben.'} Das lässt
                sich nicht rückgängig machen.
              </p>
              <div className="row-start">
                <button type="button" className="danger" disabled={busy} onClick={reset}>
                  Ja, zurücksetzen
                </button>
                <button type="button" disabled={busy} onClick={() => setConfirming(false)} autoFocus>
                  Abbrechen
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </Panel>
  );
}
