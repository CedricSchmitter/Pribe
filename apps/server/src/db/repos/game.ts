import type { EpochMs, GamePhase } from '@pribe/shared';
import type { Db } from '../database';

/** `state` is opaque here; its shape belongs to the game state machine (P4). */
export interface GameRecord<S = Record<string, unknown>> {
  phase: GamePhase;
  state: S;
  updatedAt: EpochMs;
}

export function createGameRepo(db: Db) {
  return {
    get<S = Record<string, unknown>>(): GameRecord<S> {
      const row = db.prepare('SELECT phase, state_json, updated_at FROM game WHERE id = 1').get() as {
        phase: GamePhase;
        state_json: string;
        updated_at: number;
      };
      return { phase: row.phase, state: JSON.parse(row.state_json) as S, updatedAt: row.updated_at };
    },
    save(phase: GamePhase, state: unknown = {}): void {
      db.prepare('UPDATE game SET phase = ?, state_json = ?, updated_at = ? WHERE id = 1').run(
        phase,
        JSON.stringify(state),
        Date.now(),
      );
    },
  };
}
export type GameRepo = ReturnType<typeof createGameRepo>;
