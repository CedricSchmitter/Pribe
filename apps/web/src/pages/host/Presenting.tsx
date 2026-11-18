import { useEffect, useRef, useState } from 'react';
import { m as motion } from 'motion/react';
import { Curtain, shake, sideCannons } from '../../fx';
import { Avatar } from './Avatar';
import { downloadPptx } from './download';
import { audioReady, scheduleGong, unlockAudio } from './gong';
import { ReactionOverlay } from './ReactionOverlay';
import { TimeBar } from './TimeBar';
import type { HostGame } from './useHostGame';

export function Presenting({ game, onError }: { game: HostGame; onError(msg: string): void }) {
  const snap = game.snapshot!;
  const round = snap.round!;
  const presenter = game.person(round.presenterId);
  const iframe = useRef<HTMLIFrameElement>(null);
  const [soundOn, setSoundOn] = useState(audioReady());
  // Only a fresh start gets the curtain; a reload mid-talk must not cover the slides again.
  const [curtain, setCurtain] = useState(() => !!round.startedAt && game.now() - round.startedAt < 4000);

  useEffect(() => {
    if (!curtain) return;
    const t = setTimeout(() => setCurtain(false), 2600);
    const b = setTimeout(() => {
      sideCannons(presenter ? [presenter.color, '#ffd000', '#ffffff'] : undefined, 900);
      shake(14, 400);
    }, 1300);
    return () => {
      clearTimeout(t);
      clearTimeout(b);
    };
  }, []);

  useEffect(() => {
    if (!round.timeLimitEndsAt || !soundOn) return;
    return scheduleGong(round.timeLimitEndsAt, game.now);
  }, [round.timeLimitEndsAt, soundOn]);

  async function close() {
    const res = await game.command('round:close');
    if (!res.ok) onError(res.message);
  }

  return (
    <div className="host-presenting">
      {round.submission.kind === 'html' ? (
        <iframe
          ref={iframe}
          className="host-iframe"
          title="Präsentation"
          src={round.submission.url}
          sandbox="allow-scripts"
          onLoad={() => iframe.current?.focus()}
        />
      ) : (
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
            <Avatar person={presenter} size={72} /> <span>{presenter?.name} präsentiert</span>
          </div>
          <ol className="host-pptx-steps">
            <li>Datei unten in der Download-Leiste öffnen</li>
            <li>
              <kbd>F5</kbd> drücken – Bühne frei!
            </li>
            <li>Danach zurück in den Browser und „Schließen“ klicken</li>
          </ol>
          <button type="button" className="host-big-button" onClick={() => downloadPptx(round.submission.url)}>
            ⬇️ Erneut herunterladen
          </button>
        </div>
      )}
      {round.timeLimitEndsAt && round.startedAt && <TimeBar startedAt={round.startedAt} endsAt={round.timeLimitEndsAt} now={game.now} />}
      <ReactionOverlay reactions={game.reactions} combo={game.combo} person={game.person} />
      {curtain && <Curtain />}
      <div className="host-presenting-controls">
        {round.timeLimitEndsAt && !soundOn && (
          <button
            type="button"
            onClick={() => {
              unlockAudio();
              setSoundOn(true);
            }}
          >
            🔔 Gong aktivieren
          </button>
        )}
        <button type="button" className="primary" onClick={close}>
          Schließen ✋
        </button>
      </div>
    </div>
  );
}
