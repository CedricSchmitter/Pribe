import { Link } from 'react-router';
import { Placeholder } from '../components/Placeholder';

export function NotFoundPage() {
  return (
    <Placeholder emoji="🤷" title="Seite nicht gefunden">
      <Link className="button" to="/">Zur Startseite</Link>
    </Placeholder>
  );
}
