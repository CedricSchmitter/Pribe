import type { EventEmitter } from 'node:events';
import type { PersonId } from '@pribe/shared';
import type { SessionCodec } from './auth/session';
import type { Config } from './config';
import type { ConversionQueue } from './conversion';
import type { Db, Repositories } from './db';

/** Everything route and socket modules need; passed explicitly instead of importing singletons. */
export interface AppContext {
  config: Config;
  db: Db;
  repos: Repositories;
  conversion: ConversionQueue;
  sessions: SessionCodec;
  ownerHash(personId: PersonId): string;
  /**
   * REST changes to game, persons or settings outside the game engine (reset, admin edits,
   * registration). Open host and vote screens only learn about them through `changed`.
   */
  stateEvents: EventEmitter<{ changed: [] }>;
}
