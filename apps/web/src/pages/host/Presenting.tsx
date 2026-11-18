import { useEffect, useState } from 'react';
import { Curtain, shake, sideCannons } from '../../fx';
import { audioReady, scheduleGong, unlockAudio } from './gong';
import { PresentationFrame } from './PresentationFrame';
import { ReactionOverlay } from './ReactionOverlay';
import { TimeBar } from './TimeBar';
import type { HostGame } from './useHostGame';

export function Presenting({ game, onError }: { game: HostGame; onError(msg: string): void }) {
  const snap = game.snapshot!;
  const round = snap.round!;
  const presenter = game.person(round.presenterId);
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
      <PresentationFrame
        kind={round.submission.kind}
        url={round.submission.url}
        speaker={presenter}
        afterwards="Danach zurück in den Browser und „Schließen“ klicken"
      />
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
