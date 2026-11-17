import type { EpochMs, PersonId, RoundId } from '@pribe/shared';
import type { Db } from '../database';

export interface VoteRecord {
  roundId: RoundId;
  voterId: PersonId;
  guessPersonId: PersonId | null;
  stars: number | null;
  /** R84; optional so records built before it (tests, fixtures) stay valid. */
  talkStars?: number | null;
  updatedAt: EpochMs;
}

interface VoteRow {
  round_id: number;
  voter_id: string;
  guess_person_id: string | null;
  stars: number | null;
  talk_stars: number | null;
  updated_at: number;
}

const toRecord = (r: VoteRow): VoteRecord => ({
  roundId: r.round_id,
  voterId: r.voter_id,
  guessPersonId: r.guess_person_id,
  stars: r.stars,
  talkStars: r.talk_stars,
  updatedAt: r.updated_at,
});

export function createVotesRepo(db: Db) {
  const get = (roundId: RoundId, voterId: PersonId): VoteRecord | null => {
    const row = db.prepare('SELECT * FROM votes WHERE round_id = ? AND voter_id = ?').get(roundId, voterId) as
      | VoteRow
      | undefined;
    return row ? toRecord(row) : null;
  };

  return {
    get,
    /** Partial update: `undefined` keeps the stored value, `null` clears it. */
    upsert(input: {
      roundId: RoundId;
      voterId: PersonId;
      guessPersonId?: PersonId | null;
      stars?: number | null;
      talkStars?: number | null;
    }): VoteRecord {
      const current = get(input.roundId, input.voterId);
      const guess = input.guessPersonId === undefined ? (current?.guessPersonId ?? null) : input.guessPersonId;
      const stars = input.stars === undefined ? (current?.stars ?? null) : input.stars;
      const talkStars = input.talkStars === undefined ? (current?.talkStars ?? null) : input.talkStars;
      db.prepare(
        `INSERT INTO votes (round_id, voter_id, guess_person_id, stars, talk_stars, updated_at) VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT (round_id, voter_id) DO UPDATE SET
           guess_person_id = excluded.guess_person_id, stars = excluded.stars, talk_stars = excluded.talk_stars,
           updated_at = excluded.updated_at`,
      ).run(input.roundId, input.voterId, guess, stars, talkStars, Date.now());
      return get(input.roundId, input.voterId)!;
    },
    listForRound(roundId: RoundId): VoteRecord[] {
      return (db.prepare('SELECT * FROM votes WHERE round_id = ? ORDER BY voter_id').all(roundId) as unknown as VoteRow[]).map(
        toRecord,
      );
    },
    listAll(): VoteRecord[] {
      return (db.prepare('SELECT * FROM votes ORDER BY round_id, voter_id').all() as unknown as VoteRow[]).map(toRecord);
    },
  };
}
export type VotesRepo = ReturnType<typeof createVotesRepo>;
