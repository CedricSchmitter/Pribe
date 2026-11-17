import { randomUUID } from 'node:crypto';
import { API_PATHS, type Person, type PersonId, type PersonInput } from '@pribe/shared';
import type { Db } from '../database';

interface PersonRow {
  id: string;
  name: string;
  emoji: string;
  color: string;
  photo_file: string | null;
}

const photoUrl = (file: string | null) => (file ? `${API_PATHS.avatars}/${file}` : null);

const toPerson = (r: PersonRow): Person => ({
  id: r.id,
  name: r.name,
  emoji: r.emoji,
  color: r.color,
  photoUrl: photoUrl(r.photo_file),
});

export function createPersonsRepo(db: Db) {
  const get = (id: PersonId): Person | null => {
    const row = db.prepare('SELECT * FROM persons WHERE id = ?').get(id) as PersonRow | undefined;
    return row ? toPerson(row) : null;
  };

  return {
    list(): Person[] {
      const rows = db.prepare('SELECT * FROM persons ORDER BY name COLLATE NOCASE').all() as unknown as PersonRow[];
      return rows.map(toPerson);
    },
    get,
    create(input: PersonInput): Person {
      const person: Person = { id: randomUUID(), ...input, photoUrl: null };
      db.prepare('INSERT INTO persons (id, name, emoji, color, created_at) VALUES (?, ?, ?, ?, ?)').run(
        person.id,
        person.name,
        person.emoji,
        person.color,
        Date.now(),
      );
      return person;
    },
    update(id: PersonId, input: PersonInput): Person | null {
      const res = db
        .prepare('UPDATE persons SET name = ?, emoji = ?, color = ? WHERE id = ?')
        .run(input.name, input.emoji, input.color, id);
      return res.changes ? get(id) : null;
    },
    remove(id: PersonId): boolean {
      return db.prepare('DELETE FROM persons WHERE id = ?').run(id).changes > 0;
    },
    /** Deletes every person; returns their photo file names so the caller can remove the files. */
    removeAll(): { count: number; photoFiles: string[] } {
      const rows = db.prepare('SELECT photo_file FROM persons WHERE photo_file IS NOT NULL').all() as unknown as {
        photo_file: string;
      }[];
      const count = Number(db.prepare('DELETE FROM persons').run().changes);
      return { count, photoFiles: rows.map((r) => r.photo_file) };
    },
    /** `undefined` = unknown person, `null` = no password set yet (D25). */
    getPasswordHash(id: PersonId): string | null | undefined {
      const row = db.prepare('SELECT password_hash FROM persons WHERE id = ?').get(id) as
        | { password_hash: string | null }
        | undefined;
      return row ? row.password_hash : undefined;
    },
    setPasswordHash(id: PersonId, hash: string | null): boolean {
      return db.prepare('UPDATE persons SET password_hash = ? WHERE id = ?').run(hash, id).changes > 0;
    },
    /** Ids of persons who have set a password. */
    idsWithPassword(): Set<PersonId> {
      const rows = db.prepare('SELECT id FROM persons WHERE password_hash IS NOT NULL').all() as unknown as { id: string }[];
      return new Set(rows.map((r) => r.id));
    },
    /** File name inside the avatars dir, `null` without photo, `undefined` for an unknown person. */
    getPhotoFile(id: PersonId): string | null | undefined {
      const row = db.prepare('SELECT photo_file FROM persons WHERE id = ?').get(id) as
        | { photo_file: string | null }
        | undefined;
      return row ? row.photo_file : undefined;
    },
    setPhotoFile(id: PersonId, file: string | null): boolean {
      return db.prepare('UPDATE persons SET photo_file = ? WHERE id = ?').run(file, id).changes > 0;
    },
  };
}
export type PersonsRepo = ReturnType<typeof createPersonsRepo>;
