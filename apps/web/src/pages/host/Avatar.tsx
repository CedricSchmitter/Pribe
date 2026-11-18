import type { Person } from '@pribe/shared';
import { Avatar as PersonAvatar } from '../../components/Avatar';

/** Shared avatar (photo or emoji) with the beamer glow; tolerates unknown persons. */
export function Avatar({
  person,
  size = 64,
  showName = false,
}: {
  person: Pick<Person, 'name' | 'emoji' | 'color' | 'photoUrl'> | undefined;
  size?: number;
  showName?: boolean;
}) {
  if (!person) return null;
  return (
    <span className="host-avatar">
      <span className="host-avatar-glow" style={{ boxShadow: `0 0 ${size / 3}px ${person.color}88` }}>
        <PersonAvatar person={person} size={size} />
      </span>
      {showName && <span className="host-avatar-name">{person.name}</span>}
    </span>
  );
}
