import { useRef, type ReactNode } from 'react';
import { m as motion } from 'motion/react';
import type { Person, SubmissionKind } from '@pribe/shared';
import { Avatar } from './Avatar';
import { downloadPptx } from './download';

type Speaker = Pick<Person, 'name' | 'emoji' | 'color' | 'photoUrl'>;

/** HTML in the sandboxed iframe, PPTX as "runs in PowerPoint" with a re-download (rounds and guest, R90). */
export function PresentationFrame({
  kind,
  url,
  speaker,
  afterwards,
}: {
  kind: SubmissionKind;
  url: string;
  speaker: Speaker | undefined;
  /** Last step of the PowerPoint how-to. */
  afterwards: ReactNode;
}) {
  const iframe = useRef<HTMLIFrameElement>(null);
  if (kind === 'html') {
    return (
      <iframe
        ref={iframe}
        className="host-iframe"
        title="Präsentation"
        src={url}
        sandbox="allow-scripts"
        onLoad={() => iframe.current?.focus()}
      />
    );
  }
  return (
    <div className="host-pptx">
      <motion.div
        className="host-pptx-icon"
        animate={{ rotate: [0, -8, 8, -8, 0], scale: [1, 1.1, 1] }}
        transition={{ repeat: Infinity, duration: 2.4 }}
      >
        🎤
      </motion.div>
      <h1>Läuft in PowerPoint</h1>
      <div className="host-pptx-presenter">
        <Avatar person={speaker} size={72} /> <span>{speaker?.name} präsentiert</span>
      </div>
      <ol className="host-pptx-steps">
        <li>Datei unten in der Download-Leiste öffnen</li>
        <li>
          <kbd>F5</kbd> drücken – Bühne frei!
        </li>
        <li>{afterwards}</li>
      </ol>
      <button type="button" className="host-big-button" onClick={() => downloadPptx(url)}>
        ⬇️ Erneut herunterladen
      </button>
    </div>
  );
}
