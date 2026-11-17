import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import type { SubmissionStatusDto, SubmitStatusDto } from '@pribe/shared';
import { createPortal } from 'react-dom';
import { emojiRain, sideCannons, Stamp, Sunburst } from '../../fx';
import { burstConfetti } from '../../lib/confetti';
import { useToast } from '../../shell';
import { precheckFile, uploadFile, UploadError } from './uploadClient';

const STATUS_VIEW = {
  converting: { emoji: '⚙️', title: 'Wird vorbereitet …', text: 'Deine PowerPoint wird gerade vorbereitet. Einen Moment.' },
  ready: { emoji: '✅', title: 'Bereit!', text: 'Deine Präsentation liegt im Pool.' },
  failed: { emoji: '💥', title: 'Fehlgeschlagen', text: 'Die Vorbereitung hat nicht geklappt. Bitte neu hochladen.' },
} as const;

export function UploadCard({
  status,
  mine,
  onUploaded,
}: {
  status: SubmitStatusDto;
  mine: SubmissionStatusDto | null;
  onUploaded: (dto: SubmissionStatusDto) => void;
}) {
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [celebrate, setCelebrate] = useState<'new' | 'replaced' | null>(null);
  useEffect(() => {
    if (!celebrate) return;
    const t = setTimeout(() => setCelebrate(null), 2600);
    return () => clearTimeout(t);
  }, [celebrate]);

  async function pick(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const problem = precheckFile(file, status.maxUploadMb);
    if (problem) {
      setError(problem);
      return;
    }
    setError(null);
    setProgress(0);
    try {
      const dto = await uploadFile(file, setProgress);
      onUploaded(dto);
      burstConfetti();
      sideCannons(undefined, 900);
      emojiRain(['📄', '🎉', '🚀'], 1600);
      setCelebrate(mine ? 'replaced' : 'new');
      toast(mine ? 'Ersetzt! Die alte Datei ist weg.' : 'Hochgeladen!', 'success');
    } catch (err) {
      setError(err instanceof UploadError ? err.message : 'Upload fehlgeschlagen.');
    } finally {
      setProgress(null);
    }
  }

  const view = mine ? STATUS_VIEW[mine.status] : null;
  const uploading = progress !== null;

  return (
    <section className="stack">
      {createPortal(
        <AnimatePresence>
          {celebrate && (
            <motion.div
              key="celebrate"
              className="upload-celebrate"
              role="status"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, scale: 1.4 }}
              onClick={() => setCelebrate(null)}
            >
              <Sunburst size="160vmax" speedS={6} />
              <motion.div
                className="upload-celebrate-rocket"
                initial={{ y: '40vh', rotate: 0 }}
                animate={{ y: ['40vh', '0vh', '0vh', '-80vh'], rotate: [0, -10, 10, 0] }}
                transition={{ duration: 2.4, times: [0, 0.3, 0.75, 1], ease: 'easeInOut' }}
              >
                🚀
              </motion.div>
              <Stamp delay={0.35}>{celebrate === 'new' ? 'Im Pool!' : 'Ersetzt!'}</Stamp>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body,
      )}
      <AnimatePresence mode="popLayout">
        {view && mine && (
          <motion.div
            key={`${mine.submissionId}-${mine.status}`}
            className={`my-status status-${mine.status}`}
            initial={{ scale: 0.5, rotate: -6, opacity: 0 }}
            animate={{ scale: 1, rotate: 0, opacity: 1 }}
            exit={{ scale: 0.5, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 360, damping: 12 }}
          >
            <motion.span
              className="my-status-emoji"
              animate={mine.status === 'converting' ? { rotate: 360 } : { rotate: 0 }}
              transition={mine.status === 'converting' ? { repeat: Infinity, duration: 2, ease: 'linear' } : undefined}
            >
              {view.emoji}
            </motion.span>
            <div>
              <strong>{view.title}</strong>
              <p>{view.text}</p>
              <p className="my-status-kind">{mine.kind === 'html' ? 'HTML' : 'PowerPoint'}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {status.uploadsOpen ? (
        <div className="stack">
          <input
            ref={input}
            type="file"
            accept=".html,.htm,.pptx"
            className="visually-hidden"
            onChange={pick}
            disabled={uploading}
          />
          <motion.button
            type="button"
            className="primary upload-button"
            disabled={uploading}
            whileTap={{ scale: 0.92 }}
            onClick={() => input.current?.click()}
          >
            {uploading ? 'Lädt hoch …' : mine ? '📤 Neue Datei hochladen (ersetzt die alte)' : '📤 Präsentation hochladen'}
          </motion.button>
          {uploading && (
            <div className="progress" role="progressbar" aria-valuenow={Math.round(progress * 100)}>
              <motion.div className="progress-bar" animate={{ width: `${Math.round(progress * 100)}%` }} />
            </div>
          )}
          <p className="muted hint">
            One-File-HTML (.html, .htm) oder PowerPoint (.pptx), max. {status.maxUploadMb} MB. Der Dateiname wird
            verworfen.
          </p>
        </div>
      ) : (
        <motion.div
          className="locked"
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 260, damping: 10 }}
        >
          <span className="hero-emoji">🔒</span>
          <strong>Einsendeschluss vorbei</strong>
          <span className="muted">Uploads sind gesperrt.</span>
        </motion.div>
      )}

      {error && (
        <motion.p
          className="inline-warning"
          initial={{ x: -12 }}
          animate={{ x: [12, -8, 6, -3, 0] }}
          transition={{ duration: 0.4 }}
        >
          {error}
        </motion.p>
      )}
    </section>
  );
}
