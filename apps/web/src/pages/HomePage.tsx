import { Link } from 'react-router';
import { Placeholder } from '../components/Placeholder';
import { burstConfetti } from '../lib/confetti';

export function HomePage() {
  return (
    <Placeholder emoji="🎤" title="Pribe">
      <p className="muted">Vibe und Präsentation</p>
      <nav className="row">
        <Link className="button" to="/submit">Einreichen</Link>
        <Link className="button" to="/vote">Mitspielen</Link>
      </nav>
      <button type="button" className="ghost" onClick={() => burstConfetti()}>
        🎉
      </button>
    </Placeholder>
  );
}
