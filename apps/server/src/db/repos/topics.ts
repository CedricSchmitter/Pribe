import { randomInt } from 'node:crypto';
import { TOPICS } from '@pribe/shared';
import { transaction, type Db } from '../database';

/** Assigned topic index, `null` = "Freies Thema" (D26). */
export interface TopicAssignment {
  topicIndex: number | null;
}

export function createTopicsRepo(db: Db) {
  const get = (ownerHash: string): TopicAssignment | null => {
    const row = db.prepare('SELECT topic_index FROM topic_assignments WHERE owner_hash = ?').get(ownerHash) as
      | { topic_index: number | null }
      | undefined;
    return row ? { topicIndex: row.topic_index } : null;
  };

  return {
    get,
    /** Assigns a random free topic once; returns the existing assignment on later calls. */
    assign(ownerHash: string): TopicAssignment {
      return transaction(db, () => {
        const existing = get(ownerHash);
        if (existing) return existing;
        const taken = new Set(
          (db.prepare('SELECT topic_index FROM topic_assignments WHERE topic_index IS NOT NULL').all() as unknown as {
            topic_index: number;
          }[]).map((r) => r.topic_index),
        );
        const free = TOPICS.map((_, i) => i).filter((i) => !taken.has(i));
        const topicIndex = free.length ? free[randomInt(free.length)]! : null;
        db.prepare('INSERT INTO topic_assignments (owner_hash, topic_index, assigned_at) VALUES (?, ?, ?)').run(
          ownerHash,
          topicIndex,
          Date.now(),
        );
        return { topicIndex };
      });
    },
    remove(ownerHash: string): boolean {
      return db.prepare('DELETE FROM topic_assignments WHERE owner_hash = ?').run(ownerHash).changes > 0;
    },
  };
}
export type TopicsRepo = ReturnType<typeof createTopicsRepo>;
