import { API_PATHS, type AdminGuestDto, type GuestView } from '@pribe/shared';
import type { Repositories } from '../db';

export type GuestIdentity = Omit<GuestView, 'presentingSince'>;

/** A picked person lends name and avatar; otherwise the own entry, `null` while it has no name. */
export function guestIdentity(repos: Repositories): GuestIdentity | null {
  const g = repos.guest.get();
  const person = g.personId ? repos.persons.get(g.personId) : null;
  if (person) return { name: person.name, emoji: person.emoji, color: person.color, photoUrl: person.photoUrl };
  if (!g.name) return null;
  return { name: g.name, emoji: g.emoji, color: g.color, photoUrl: g.photoFile ? `${API_PATHS.avatars}/${g.photoFile}` : null };
}

/** R90: the finale offers the guest only when it is switched on, named and has a ready presentation. */
export function guestReady(repos: Repositories): boolean {
  return repos.guest.get().enabled && guestIdentity(repos) !== null && repos.submissions.getGuest()?.status === 'ready';
}

export function adminGuestDto(repos: Repositories): AdminGuestDto {
  const g = repos.guest.get();
  const sub = repos.submissions.getGuest();
  return {
    enabled: g.enabled,
    personId: g.personId,
    name: g.name,
    emoji: g.emoji,
    color: g.color,
    photoUrl: g.photoFile ? `${API_PATHS.avatars}/${g.photoFile}` : null,
    presentation: sub ? { kind: sub.kind, status: sub.status, error: sub.error } : null,
    ready: guestReady(repos),
  };
}
