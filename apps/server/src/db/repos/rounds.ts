import type { EpochMs, PersonId, RoundId, SubmissionId } from '@pribe/shared';
import type { Db } from '../database';

export interface RoundRecord {
  id: RoundId;
  number: number;
  presenterId: PersonId | null;
  submissionId: SubmissionId;
  drawnAt: EpochMs;
  startedAt: EpochMs | null;
  closedAt: EpochMs | null;
  countdownEndsAt: EpochMs | null;
  revealedAt: EpochMs | null;
  /** `null` until the reveal (D15). */
  revealedOwnerId: PersonId | null;
}

interface RoundRow {
  id: number;
  number: number;
  presenter_id: string | null;
  submission_id: string;
  drawn_at: number;
  started_at: number | null;
  closed_at: number | null;
  countdown_ends_at: number | null;
  revealed_at: number | null;
  revealed_owner_id: string | null;
}

const toRecord = (r: RoundRow): RoundRecord => ({
  id: r.id,
  number: r.number,
  presenterId: r.presenter_id,
  submissionId: r.submission_id,
  drawnAt: r.drawn_at,
  startedAt: r.started_at,
  closedAt: r.closed_at,
  countdownEndsAt: r.countdown_ends_at,
  revealedAt: r.revealed_at,
  revealedOwnerId: r.revealed_owner_id,
});

export type RoundPatch = Partial<
  Pick<RoundRecord, 'startedAt' | 'closedAt' | 'countdownEndsAt' | 'revealedAt' | 'revealedOwnerId'>
>;

const PATCH_COLUMNS: Record<keyof RoundPatch, string> = {
  startedAt: 'started_at',
  closedAt: 'closed_at',
  countdownEndsAt: 'countdown_ends_at',
  revealedAt: 'revealed_at',
  revealedOwnerId: 'revealed_owner_id',
};

export function createRoundsRepo(db: Db) {
  const get = (id: RoundId): RoundRecord | null => {
    const row = db.prepare('SELECT * FROM rounds WHERE id = ?').get(id) as RoundRow | undefined;
    return row ? toRecord(row) : null;
  };

  return {
    get,
    list(): RoundRecord[] {
      return (db.prepare('SELECT * FROM rounds ORDER BY number').all() as unknown as RoundRow[]).map(toRecord);
    },
    latest(): RoundRecord | null {
      const row = db.prepare('SELECT * FROM rounds ORDER BY number DESC LIMIT 1').get() as RoundRow | undefined;
      return row ? toRecord(row) : null;
    },
    create(input: { presenterId: PersonId; submissionId: SubmissionId }): RoundRecord {
      const { next } = db.prepare('SELECT COALESCE(MAX(number), 0) + 1 AS next FROM rounds').get() as {
        next: number;
      };
      const res = db
        .prepare('INSERT INTO rounds (number, presenter_id, submission_id, drawn_at) VALUES (?, ?, ?, ?)')
        .run(next, input.presenterId, input.submissionId, Date.now());
      return get(Number(res.lastInsertRowid))!;
    },
    update(id: RoundId, patch: RoundPatch): RoundRecord | null {
      const keys = Object.keys(patch) as (keyof RoundPatch)[];
      if (keys.length) {
        const sets = keys.map((k) => `${PATCH_COLUMNS[k]} = ?`).join(', ');
        db.prepare(`UPDATE rounds SET ${sets} WHERE id = ?`).run(...keys.map((k) => patch[k] ?? null), id);
      }
      return get(id);
    },
    removeAll(): void {
      db.exec("DELETE FROM rounds; DELETE FROM sqlite_sequence WHERE name = 'rounds';");
    },
  };
}
export type RoundsRepo = ReturnType<typeof createRoundsRepo>;
