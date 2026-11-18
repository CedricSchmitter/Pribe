import { randomUUID } from 'node:crypto';
import type { EpochMs, SubmissionId, SubmissionKind, SubmissionStatus } from '@pribe/shared';
import { transaction, type Db } from '../database';

/** Server-internal: carries the owner hash, never send it to a client. */
export interface SubmissionRecord {
  id: SubmissionId;
  ownerHash: string;
  kind: SubmissionKind;
  status: SubmissionStatus;
  /** Relative to `filesDir`. */
  filePath: string | null;
  error: string | null;
  createdAt: EpochMs;
  updatedAt: EpochMs;
}

interface SubmissionRow {
  id: string;
  owner_hash: string;
  kind: SubmissionKind;
  status: SubmissionStatus;
  file_path: string | null;
  error: string | null;
  created_at: number;
  updated_at: number;
}

const toRecord = (r: SubmissionRow): SubmissionRecord => ({
  id: r.id,
  ownerHash: r.owner_hash,
  kind: r.kind,
  status: r.status,
  filePath: r.file_path,
  error: r.error,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

/** Fixed owner hash of the guest presentation (R90); an HMAC is 64 hex chars, so it never collides. */
export const GUEST_OWNER_HASH = 'guest';

export interface NewSubmission {
  ownerHash: string;
  kind: SubmissionKind;
  status: SubmissionStatus;
  filePath: string | null;
}

export function createSubmissionsRepo(db: Db) {
  const get = (id: SubmissionId): SubmissionRecord | null => {
    const row = db.prepare('SELECT * FROM submissions WHERE id = ?').get(id) as SubmissionRow | undefined;
    return row ? toRecord(row) : null;
  };
  const findByOwnerHash = (ownerHash: string): SubmissionRecord | null => {
    const row = db.prepare('SELECT * FROM submissions WHERE owner_hash = ?').get(ownerHash) as
      | SubmissionRow
      | undefined;
    return row ? toRecord(row) : null;
  };

  const insert = (input: NewSubmission, guest: boolean): SubmissionRecord => {
    const now = Date.now();
    const submission: SubmissionRecord = { id: randomUUID(), ...input, error: null, createdAt: now, updatedAt: now };
    db.prepare(
      `INSERT INTO submissions (id, owner_hash, kind, status, file_path, error, created_at, updated_at, guest)
       VALUES (?, ?, ?, ?, ?, NULL, ?, ?, ?)`,
    ).run(submission.id, submission.ownerHash, submission.kind, submission.status, submission.filePath, now, now, guest ? 1 : 0);
    return submission;
  };

  return {
    get,
    findByOwnerHash,
    /** The players' submissions; the guest presentation (R90) is not one of them. */
    list(): SubmissionRecord[] {
      // Ordered by id (random) so the list order does not hint at who uploaded when.
      return (db.prepare('SELECT * FROM submissions WHERE guest = 0 ORDER BY id').all() as unknown as SubmissionRow[]).map(toRecord);
    },
    /**
     * One submission per person (R21): replaces an existing one with a fresh id.
     * Returns the replaced record so the caller can delete its file.
     */
    replaceForOwner(input: NewSubmission): { submission: SubmissionRecord; replaced: SubmissionRecord | null } {
      return transaction(db, () => {
        const replaced = findByOwnerHash(input.ownerHash);
        if (replaced) db.prepare('DELETE FROM submissions WHERE id = ?').run(replaced.id);
        return { submission: insert(input, false), replaced };
      });
    },
    /** R90: the one guest presentation, `null` without one. */
    getGuest(): SubmissionRecord | null {
      return findByOwnerHash(GUEST_OWNER_HASH);
    },
    /** Replaces the guest presentation; returns the replaced one so the caller can delete its file. */
    replaceGuest(input: Omit<NewSubmission, 'ownerHash'>): { submission: SubmissionRecord; replaced: SubmissionRecord | null } {
      return transaction(db, () => {
        const replaced = findByOwnerHash(GUEST_OWNER_HASH);
        if (replaced) db.prepare('DELETE FROM submissions WHERE id = ?').run(replaced.id);
        return { submission: insert({ ...input, ownerHash: GUEST_OWNER_HASH }, true), replaced };
      });
    },
    /** Everything still `converting`, the guest presentation included (R4). */
    listConverting(): SubmissionRecord[] {
      return (db.prepare("SELECT * FROM submissions WHERE status = 'converting'").all() as unknown as SubmissionRow[]).map(toRecord);
    },
    updateStatus(
      id: SubmissionId,
      patch: { status: SubmissionStatus; filePath?: string | null; error?: string | null },
    ): SubmissionRecord | null {
      const current = get(id);
      if (!current) return null;
      const next: SubmissionRecord = {
        ...current,
        status: patch.status,
        filePath: patch.filePath === undefined ? current.filePath : patch.filePath,
        error: patch.error === undefined ? current.error : patch.error,
        updatedAt: Date.now(),
      };
      db.prepare('UPDATE submissions SET status = ?, file_path = ?, error = ?, updated_at = ? WHERE id = ?').run(
        next.status,
        next.filePath,
        next.error,
        next.updatedAt,
        id,
      );
      return next;
    },
    remove(id: SubmissionId): boolean {
      return db.prepare('DELETE FROM submissions WHERE id = ?').run(id).changes > 0;
    },
    /** Players' submissions and the guest presentation. */
    removeAll(): number {
      return Number(db.prepare('DELETE FROM submissions').run().changes);
    },
    countByStatus(): Record<SubmissionStatus, number> {
      const counts: Record<SubmissionStatus, number> = { converting: 0, ready: 0, failed: 0 };
      const rows = db.prepare('SELECT status, COUNT(*) AS n FROM submissions WHERE guest = 0 GROUP BY status').all() as unknown as {
        status: SubmissionStatus;
        n: number;
      }[];
      for (const r of rows) counts[r.status] = r.n;
      return counts;
    },
    /** Ready submissions that have not been drawn in any round yet (R32). */
    listPool(): SubmissionRecord[] {
      const rows = db
        .prepare(
          `SELECT s.* FROM submissions s
           WHERE s.status = 'ready' AND s.guest = 0 AND NOT EXISTS (SELECT 1 FROM rounds r WHERE r.submission_id = s.id)
           ORDER BY s.id`,
        )
        .all() as unknown as SubmissionRow[];
      return rows.map(toRecord);
    },
  };
}
export type SubmissionsRepo = ReturnType<typeof createSubmissionsRepo>;
