import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { API_PATHS, type SubmissionPreviewDto, type SubmissionStatusDto } from '@pribe/shared';
import { api } from '../../lib/api';

/** HTML decks are authored for a beamer; render at that size and scale down to fit. */
const STAGE_W = 1280;
const STAGE_H = 720;

/** Preview of the person's own ready submission (R81). */
export function SubmissionPreview({ mine }: { mine: SubmissionStatusDto }) {
  const [preview, setPreview] = useState<SubmissionPreviewDto | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    setPreview(null);
    setFailed(false);
    api<SubmissionPreviewDto>(API_PATHS.submit.minePreview)
      .then((p) => alive && setPreview(p))
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [mine.submissionId]);

  if (failed) return <p className="muted hint">Vorschau gerade nicht verfügbar.</p>;
  if (!preview) return null;
  if (preview.kind === 'pptx') {
    return (
      <div className="preview-pptx" role="status">
        <span className="preview-pptx-icon" aria-hidden>
          📊
        </span>
        <div>
          <strong>
            {preview.slideCount} {preview.slideCount === 1 ? 'Folie' : 'Folien'}, bereit
          </strong>
          {preview.firstSlideTitle && <p className="preview-pptx-title">„{preview.firstSlideTitle}“</p>}
        </div>
      </div>
    );
  }
  return <HtmlPreview key={mine.submissionId} />;
}

function HtmlPreview() {
  const wrap = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0);
  const [full, setFull] = useState(false);

  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const fit = () => setScale(Math.min(el.clientWidth / STAGE_W, el.clientHeight / STAGE_H));
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [full]);

  useEffect(() => {
    if (!full) return;
    // iPhone Safari has no element fullscreen; the fixed overlay alone covers that case.
    void wrap.current?.requestFullscreen?.().catch(() => {});
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setFull(false);
    const onFs = () => !document.fullscreenElement && setFull(false);
    window.addEventListener('keydown', onKey);
    document.addEventListener('fullscreenchange', onFs);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('fullscreenchange', onFs);
    };
  }, [full]);

  function toggleFull() {
    if (full) {
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
      setFull(false);
      return;
    }
    setFull(true);
  }

  const view = (
    <div ref={wrap} className={`preview-html${full ? ' full' : ''}`}>
      <div ref={box} className="preview-stage">
        <iframe
          title="Vorschau deiner Präsentation"
          src={API_PATHS.submit.mineFile}
          sandbox="allow-scripts"
          referrerPolicy="no-referrer"
          style={{
            width: STAGE_W,
            height: STAGE_H,
            transform: `translate(-50%, -50%) scale(${scale})`,
            visibility: scale ? 'visible' : 'hidden',
          }}
        />
      </div>
      <button type="button" className="ghost preview-full-button" onClick={toggleFull}>
        {full ? '✕ Schließen' : '⛶ Vollbild'}
      </button>
    </div>
  );
  // The page's animated wrapper keeps a transform, which would pin a fixed overlay to it.
  return full ? createPortal(view, document.body) : view;
}
