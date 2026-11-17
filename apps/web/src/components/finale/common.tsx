import { Avatar } from '../Avatar';
import type { AwardKind, FinaleResult, Person, PersonId, PlayerStats } from '@pribe/shared';

export const AWARD_EMOJI: Record<AwardKind, string> = {
  hellseher: '🔮',
  pokerface: '🃏',
  blindgaenger: '🙈',
  herdentier: '🐑',
};

export const AWARD_NOBODY: Record<AwardKind, string> = {
  hellseher: 'Niemand hat getroffen 🤷',
  pokerface: 'Keine Präsentation wurde geraten',
  blindgaenger: 'Alle haben mindestens einmal getroffen 🎯',
  herdentier: 'Nie gab es eine klare Mehrheit',
};

/** "x von y" line for one award winner. */
export function awardDetail(kind: AwardKind, s: PlayerStats | undefined): string {
  if (!s) return '';
  switch (kind) {
    case 'hellseher':
      return `${s.hits} von ${s.guesses} Tipps richtig`;
    case 'pokerface':
      return `nur ${s.ownGuessedRight ?? 0} von ${s.ownGuessers ?? 0} haben’s erraten`;
    case 'blindgaenger':
      return `0 von ${s.guesses} Tipps richtig`;
    case 'herdentier':
      return `${s.withMajority}× mit der Mehrheit getippt`;
  }
}

export function statsOf(finale: FinaleResult, id: PersonId): PlayerStats | undefined {
  return finale.stats?.find((s) => s.personId === id);
}

/** The shared avatar with a glow in the person's color. */
export function FinaleAvatar({ person, size = 64 }: { person: Person | undefined; size?: number }) {
  if (!person) return null;
  return (
    <span className="finale-avatar" style={{ boxShadow: `0 0 ${size / 3}px ${person.color}aa` }}>
      <Avatar person={person} size={size} />
    </span>
  );
}

export { fireworks } from '../../fx';
