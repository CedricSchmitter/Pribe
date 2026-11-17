import { useState } from 'react';
import type { Person } from '@pribe/shared';
import './avatar.css';

const SIZES = { xs: 24, sm: 32, md: 48, lg: 72, xl: 120 } as const;
export type AvatarSize = keyof typeof SIZES | number;

/**
 * A person's avatar everywhere (R5, D27): the photo if there is one, otherwise the emoji
 * on the person's color. A photo that fails to load falls back to the emoji.
 */
export function Avatar({
  person,
  size = 'md',
  className,
}: {
  person: Pick<Person, 'name' | 'emoji' | 'color'> & { photoUrl?: string | null };
  size?: AvatarSize;
  className?: string;
}) {
  const px = typeof size === 'number' ? size : SIZES[size];
  const [broken, setBroken] = useState<string | null>(null);
  const photo = person.photoUrl && broken !== person.photoUrl ? person.photoUrl : null;

  return (
    <span
      className={`avatar${className ? ` ${className}` : ''}`}
      style={{ width: px, height: px, fontSize: px * 0.55, background: person.color }}
      title={person.name}
    >
      {photo ? (
        <img src={photo} alt={person.name} width={px} height={px} onError={() => setBroken(photo)} draggable={false} />
      ) : (
        <span aria-label={person.name} role="img">
          {person.emoji}
        </span>
      )}
    </span>
  );
}
