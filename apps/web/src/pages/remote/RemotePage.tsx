import { useEffect, useState } from 'react';
import { AWARD_LABELS_DE, type GamePhase, type HostSnapshot, type PersonId } from '@pribe/shared';
import { Avatar } from '../../components/Avatar';
import { ConnectionBadge } from '../../components/ConnectionBadge';
import { LoginForm } from '../../components/LoginForm';
import { stationsFor, type FinaleStation } from '../../components/finale';
import { useAuth } from '../../lib/auth';
import { useToast } from '../../shell';
import { formatLeft } from '../vote/presenting';
import { useHostGame, useTicker, type HostCommand, type HostGame } from '../host/useHostGame';
import './remote.css';

const PHASE_LABELS: Record<GamePhase, string> = {
  lobby: 'Lobby',
  choosePresenter: 'Wer präsentiert?',
  drawing: 'Es wird gezogen',
  presenting: 'Präsentation läuft',
  countdown: 'Letzte Tipps',
  reveal: 'Auflösung',
  finale: 'Finale',
};

/** Beamer draw show (Drawing.tsx) plus a margin; only then is a stuck draw likely a missing beamer. */
const START_FALLBACK_MS = 7000;

export function stationLabel(station: FinaleStation): string {
  switch (station.kind) {
    case 'intro':
      return 'Intro';
    case 'board':
      return 'Plätze ab 4';
    case 'podium':
      return station.reveal === 0 ? 'Podest (Trommelwirbel)' : `Podest ${station.reveal}`;
    case 'award':
      return `Award: ${AWARD_LABELS_DE[station.award].title}`;
    case 'network':
      return 'Tipp-Netz';
    case 'best':
      return 'Beste Präsentation';
    case 'wall':
      return 'Foto-Wand (Ende)';
    // Q3 adds finale stations in parallel; an unknown one still gets a readable label.
    default:
      return (station as { kind: string }).kind;
  }
}

function secondsLeft(endsAt: number | null | undefined, now: number): number | null {
  return endsAt == null ? null : Math.max(0, Math.ceil((endsAt - now) / 1000));
}

/** Phone remote for the moderator (R80): a second host client next to the beamer. */
export function RemotePage() {
  const { authenticated, login } = useAuth();
  const game = useHostGame(authenticated === true);
  if (authenticated === null) return null;

  if (!authenticated) {
    return (
      <div className="remote center">
        <div className="stack" style={{ alignItems: 'center' }}>
          <div className="hero-emoji">🎮</div>
          <h1>Fernbedienung</h1>
          <LoginForm onLogin={login} />
        </div>
      </div>
    );
  }

  if (!game.snapshot) {
    return (
      <div className="remote center">
        <ConnectionBadge status={game.status} />
      </div>
    );
  }

  return <Remote game={game} snap={game.snapshot} />;
}

function Remote({ game, snap }: { game: HostGame; snap: HostSnapshot }) {
  useTicker(2);
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const now = game.now();
  const round = snap.round;
  const presenter = game.person(round?.presenterId);

  async function run(fn: () => Promise<{ ok: boolean; message?: string }>) {
    setBusy(true);
    const res = await fn();
    setBusy(false);
    if (!res.ok) toast(res.message ?? 'Fehler', 'error');
  }
  const cmd = (name: HostCommand) => () => void run(() => game.command(name));

  const talkLeft = round?.startedAt ? secondsLeft(round.timeLimitEndsAt, now) : null;
  const voteLeft = snap.phase === 'countdown' ? secondsLeft(round?.countdownEndsAt, now) : null;

  return (
    <div className="remote">
      <header className="remote-status card">
        <div className="remote-status-head">
          <span className="remote-phase">{PHASE_LABELS[snap.phase]}</span>
          <ConnectionBadge status={game.status} />
        </div>
        {round && (
          <div className="remote-presenter">
            {presenter && <Avatar person={presenter} size={48} />}
            <div>
              <div className="label">Runde {round.number}</div>
              <div className="remote-presenter-name">{presenter?.name ?? '?'} präsentiert</div>
            </div>
          </div>
        )}
        {(snap.phase === 'presenting' || snap.phase === 'countdown') && round && (
          <dl className="remote-figures">
            {snap.phase === 'presenting' && (
              <div>
                <dt>Zeitlimit</dt>
                <dd className={talkLeft === 0 ? 'over' : undefined}>{talkLeft === null ? '–' : talkLeft > 0 ? formatLeft(talkLeft * 1000) : 'Zeit um!'}</dd>
              </div>
            )}
            {snap.phase === 'countdown' && (
              <div>
                <dt>Abstimmung</dt>
                <dd>{voteLeft ?? '–'} s</dd>
              </div>
            )}
            <div>
              <dt>Tipps</dt>
              <dd>
                {round.votedPersonIds.length} / {snap.persons.length}
              </dd>
            </div>
          </dl>
        )}
      </header>

      <section className="remote-controls">
        {snap.phase === 'lobby' && (
          <button type="button" className="primary remote-big" disabled={busy || snap.poolSize === 0} onClick={cmd('game:start')}>
            🚀 Spiel starten
          </button>
        )}
        {snap.phase === 'choosePresenter' && <Choose game={game} snap={snap} busy={busy} run={run} />}
        {snap.phase === 'drawing' && <DrawingFallback roundId={round?.id} busy={busy} onStart={cmd('round:start')} />}
        {snap.phase === 'presenting' && (
          <button type="button" className="primary remote-big" disabled={busy} onClick={cmd('round:close')}>
            ✋ Schließen
          </button>
        )}
        {snap.phase === 'countdown' && <p className="muted">Die Auflösung kommt automatisch.</p>}
        {snap.phase === 'reveal' && (
          <>
            {snap.poolSize > 0 && (
              <button type="button" className="primary remote-big" disabled={busy} onClick={cmd('round:next')}>
                ➡️ Nächste Runde
              </button>
            )}
            <button type="button" className={`remote-big${snap.poolSize === 0 ? ' primary' : ''}`} disabled={busy} onClick={cmd('finale:start')}>
              🏆 Finale starten
            </button>
          </>
        )}
        {snap.phase === 'finale' && snap.finale && <FinaleControls game={game} snap={snap} run={run} />}
      </section>
    </div>
  );
}

function Choose({
  game,
  snap,
  busy,
  run,
}: {
  game: HostGame;
  snap: HostSnapshot;
  busy: boolean;
  run(fn: () => Promise<{ ok: boolean; message?: string }>): Promise<void>;
}) {
  const [selected, setSelected] = useState<PersonId | null>(null);
  const presented = new Set(snap.presentedPersonIds);

  useEffect(() => {
    if (game.wheel) setSelected(game.wheel.presenterId);
  }, [game.wheel]);

  const wheelPerson = game.wheel ? game.person(game.wheel.presenterId) : undefined;

  return (
    <>
      <div className="label muted">
        Runde {snap.roundCount + 1} · {snap.poolSize} im Pool
      </div>
      {wheelPerson && <div className="remote-wheel">🎡 Das Rad hat {wheelPerson.name} gewählt</div>}
      <div className="remote-persons" role="radiogroup" aria-label="Präsentator">
        {snap.persons.map((p) => (
          <button
            type="button"
            key={p.id}
            role="radio"
            aria-checked={selected === p.id}
            className={`remote-person${selected === p.id ? ' selected' : ''}${presented.has(p.id) ? ' presented' : ''}`}
            onClick={() => setSelected(p.id)}
          >
            <Avatar person={p} size={36} />
            <span>{p.name}</span>
            {presented.has(p.id) && <span aria-label="hat präsentiert">✔</span>}
          </button>
        ))}
      </div>
      <button type="button" className="remote-big" disabled={busy || snap.poolSize === 0} onClick={() => void run(() => game.command('presenter:spin'))}>
        🎡 Rad wählt
      </button>
      <button
        type="button"
        className="primary remote-big"
        disabled={busy || !selected || snap.poolSize === 0}
        onClick={() => selected && void run(() => game.draw(selected))}
      >
        🎲 Ziehen
      </button>
      {snap.roundCount > 0 && (
        <button type="button" className="remote-big" disabled={busy} onClick={() => void run(() => game.command('finale:start'))}>
          🏆 Finale starten
        </button>
      )}
    </>
  );
}

/** The beamer starts the round after its draw show; this only helps when no beamer is connected. */
function DrawingFallback({ roundId, busy, onStart }: { roundId: number | undefined; busy: boolean; onStart(): void }) {
  const [late, setLate] = useState(false);
  useEffect(() => {
    setLate(false);
    const t = setTimeout(() => setLate(true), START_FALLBACK_MS);
    return () => clearTimeout(t);
  }, [roundId]);
  return (
    <>
      <p className="muted">Der Beamer zieht und startet die Präsentation.</p>
      {late && (
        <button type="button" className="remote-big" disabled={busy} onClick={onStart}>
          ▶️ Präsentation starten
        </button>
      )}
    </>
  );
}

function FinaleControls({
  game,
  snap,
  run,
}: {
  game: HostGame;
  snap: HostSnapshot;
  run(fn: () => Promise<{ ok: boolean; message?: string }>): Promise<void>;
}) {
  const stations = stationsFor(snap.finale!);
  const step = Math.min(Math.max(snap.finaleStep ?? 0, 0), stations.length - 1);
  const go = (s: number) => void run(() => game.finaleStep(s));
  return (
    <>
      <div className="remote-station">
        <span className="label muted">
          Station {step + 1} / {stations.length}
        </span>
        <span className="remote-station-name">{stationLabel(stations[step]!)}</span>
      </div>
      <div className="remote-finale-nav">
        <button type="button" className="remote-big" disabled={step === 0} onClick={() => go(step - 1)}>
          ⬅️ Zurück
        </button>
        <button type="button" className="primary remote-big" disabled={step >= stations.length - 1} onClick={() => go(step + 1)}>
          Weiter ➡️
        </button>
      </div>
      {step === stations.length - 1 && (
        <button type="button" className="remote-big" onClick={() => go(0)}>
          🔁 Finale von vorn
        </button>
      )}
    </>
  );
}
