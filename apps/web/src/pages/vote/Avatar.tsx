import type { Person } from '@pribe/shared';
import { Avatar as SharedAvatar } from '../../components/Avatar';

export function Avatar({ person, size = 40 }: { person: Pick<Person, 'name' | 'emoji' | 'color' | 'photoUrl'>; size?: number }) {
  return <SharedAvatar person={person} size={size} />;
}
