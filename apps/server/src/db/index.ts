import type { Db } from './database';
import { createGameRepo } from './repos/game';
import { createGuestRepo } from './repos/guest';
import { createPersonsRepo } from './repos/persons';
import { createRoundsRepo } from './repos/rounds';
import { createSettingsRepo } from './repos/settings';
import { createSubmissionsRepo } from './repos/submissions';
import { createTopicsRepo } from './repos/topics';
import { createVotesRepo } from './repos/votes';

export { openDatabase, transaction, type Db } from './database';
export type { SubmissionRecord } from './repos/submissions';
export type { RoundRecord } from './repos/rounds';
export type { VoteRecord } from './repos/votes';
export type { GameRecord } from './repos/game';
export type { GuestRecord } from './repos/guest';

export function createRepositories(db: Db) {
  return {
    persons: createPersonsRepo(db),
    submissions: createSubmissionsRepo(db),
    game: createGameRepo(db),
    rounds: createRoundsRepo(db),
    votes: createVotesRepo(db),
    settings: createSettingsRepo(db),
    topics: createTopicsRepo(db),
    guest: createGuestRepo(db),
  };
}
export type Repositories = ReturnType<typeof createRepositories>;
