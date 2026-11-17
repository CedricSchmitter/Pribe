import { AnimatePresence, motion } from 'motion/react';
import { FinaleShow } from '../../components/finale';
import { ConnectionBadge } from '../../components/ConnectionBadge';
import { LoginForm } from '../../components/LoginForm';
import { PhaseWipe } from '../../fx';
import { useAuth } from '../../lib/auth';
import { useShellHidden, useToast } from '../../shell';
import { ChoosePresenter } from './ChoosePresenter';
import { Countdown } from './Countdown';
import { Drawing } from './Drawing';
import { Lobby } from './Lobby';
import { Presenting } from './Presenting';
import { Reveal } from './Reveal';
import { useHostGame } from './useHostGame';
import './host.css';

/** Beamer view (L6). State comes from the server on every (re)connect, so a reload resumes the show. */
export function HostPage() {
  const { authenticated, login } = useAuth();
  const game = useHostGame(authenticated === true);
  const toast = useToast();
  const phase = game.snapshot?.phase;
  useShellHidden(!!phase && phase !== 'lobby' && phase !== 'choosePresenter');
  if (authenticated === null) return null;

  if (!authenticated) {
    return (
      <div className="host center">
        <div className="stack" style={{ alignItems: 'center' }}>
          <div className="hero-emoji">📽️</div>
          <h1>Beamer</h1>
          <LoginForm onLogin={login} />
        </div>
      </div>
    );
  }

  if (!game.snapshot || !phase) {
    return (
      <div className="host center">
        <ConnectionBadge status={game.status} />
      </div>
    );
  }

  const onError = (msg: string) => toast(msg, 'error');
  const s = game.snapshot;
  const view =
    phase === 'lobby' ? (
      <Lobby game={game} onError={onError} />
    ) : phase === 'choosePresenter' ? (
      <ChoosePresenter game={game} />
    ) : phase === 'drawing' && s.round ? (
      <Drawing game={game} onError={onError} />
    ) : phase === 'presenting' && s.round ? (
      <Presenting game={game} onError={onError} />
    ) : phase === 'countdown' && s.round ? (
      <Countdown game={game} />
    ) : phase === 'reveal' && s.reveal ? (
      <Reveal game={game} onError={onError} />
    ) : phase === 'finale' && s.finale ? (
      <FinaleShow
        finale={s.finale}
        persons={s.persons}
        step={s.finaleStep ?? 0}
        onStep={(step) => void game.finaleStep(step).then((res) => !res.ok && onError(res.message))}
      />
    ) : null;

  return (
    <div className={`host host-stage${phase === 'lobby' || phase === 'choosePresenter' ? '' : ' show'}`}>
      {/* No filter/blur here: a full-screen blur stutters on a weak beamer laptop. */}
      <AnimatePresence mode="wait">
        <motion.div
          key={phase}
          className="host-phase"
          initial={{ opacity: 0, scale: 1.25, rotate: -4 }}
          animate={{ opacity: 1, scale: 1, rotate: 0 }}
          exit={{ opacity: 0, scale: 0.7, rotate: 4 }}
          transition={{ type: 'spring', stiffness: 220, damping: 20 }}
        >
          {view}
        </motion.div>
      </AnimatePresence>
      <PhaseWipe trigger={phase} />
      {game.status !== 'connected' && (
        <div className="host-offline">
          <ConnectionBadge status={game.status} />
        </div>
      )}
    </div>
  );
}
