import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { API_PATHS, type SubmissionOverviewDto, type SubmissionStatus } from '@pribe/shared';
import { api } from '../../lib/api';
import { Panel } from './Panel';

const STATUS_LABEL: Record<SubmissionStatus, string> = {
  converting: 'wird vorbereitet',
  ready: 'bereit',
  failed: 'fehlgeschlagen',
};

const REFRESH_MS = 5000;

export function SubmissionsPanel() {
  const [data, setData] = useState<SubmissionOverviewDto | null>(null);

  useEffect(() => {
    let alive = true;
    const load = () =>
      api<SubmissionOverviewDto>(API_PATHS.admin.submissions)
        .then((d) => alive && setData(d))
        .catch(() => {});
    void load();
    const timer = setInterval(load, REFRESH_MS);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, []);

  if (!data) return null;

  return (
    <Panel title="Einreichungen" index={2}>
      <div className="submission-summary">
        <motion.span
          key={data.total}
          className="submission-total"
          initial={{ scale: 2.4, rotate: -20, opacity: 0 }}
          animate={{ scale: 1, rotate: 0, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 320, damping: 9 }}
        >
          {data.total}
        </motion.span>
        <span className="muted">Präsentationen eingereicht</span>
      </div>
      <div className="status-chips">
        {(Object.keys(STATUS_LABEL) as SubmissionStatus[]).map((s) => (
          <span key={s} className={`status-chip status-${s}`}>
            {data.byStatus[s]} {STATUS_LABEL[s]}
          </span>
        ))}
      </div>
      <ul className="submission-list">
        <AnimatePresence initial={false}>
          {data.items.map((item, i) => (
            <motion.li
              key={item.id}
              layout
              initial={{ opacity: 0, scale: 0.6 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.6 }}
            >
              <span className="submission-index">#{i + 1}</span>
              <span>{item.kind === 'html' ? '🌐 HTML' : '📄 PowerPoint'}</span>
              <span className={`status-chip status-${item.status}`}>{STATUS_LABEL[item.status]}</span>
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>
      <p className="muted hint">Wer was eingereicht hat, steht nirgends – auch hier nicht.</p>
    </Panel>
  );
}
