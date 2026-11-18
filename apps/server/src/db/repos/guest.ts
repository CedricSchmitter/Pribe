import type { GuestInput, PersonId } from '@pribe/shared';
import type { Db } from '../database';

/** Server-side guest settings (R90); the presentation lives in `submissions` (guest = 1). */
export interface GuestRecord {
  enabled: boolean;
  personId: PersonId | null;
  name: string;
  emoji: string;
  color: string;
  /** File name inside the avatars dir. */
  photoFile: string | null;
}

interface GuestRow {
  enabled: number;
  person_id: string | null;
  name: string;
  emoji: string;
  color: string;
  photo_file: string | null;
}

export function createGuestRepo(db: Db) {
  const get = (): GuestRecord => {
    const r = db.prepare('SELECT enabled, person_id, name, emoji, color, photo_file FROM guest WHERE id = 1').get() as unknown as GuestRow;
    return { enabled: r.enabled === 1, personId: r.person_id, name: r.name, emoji: r.emoji, color: r.color, photoFile: r.photo_file };
  };

  return {
    get,
    update(patch: GuestInput): GuestRecord {
      const next = { ...get(), ...patch };
      db.prepare('UPDATE guest SET enabled = ?, person_id = ?, name = ?, emoji = ?, color = ? WHERE id = 1').run(
        next.enabled ? 1 : 0,
        next.personId,
        next.name,
        next.emoji,
        next.color,
      );
      return next;
    },
    setPhotoFile(file: string | null): void {
      db.prepare('UPDATE guest SET photo_file = ? WHERE id = 1').run(file);
    },
    /** Back to the defaults; returns the photo file so the caller can delete it. */
    reset(): string | null {
      const { photoFile } = get();
      db.prepare("UPDATE guest SET enabled = 0, person_id = NULL, name = '', emoji = '🎁', color = '#ff3366', photo_file = NULL WHERE id = 1").run();
      return photoFile;
    },
  };
}
export type GuestRepo = ReturnType<typeof createGuestRepo>;
