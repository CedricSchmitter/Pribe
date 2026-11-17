import { EventEmitter } from 'node:events';
import { mkdirSync } from 'node:fs';
import fastifyCookie from '@fastify/cookie';
import Fastify from 'fastify';
import { createSessionCodec } from './auth/session';
import type { Config } from './config';
import type { AppContext } from './context';
import { createConversionQueue } from './conversion';
import { createRepositories, openDatabase } from './db';
import { WEB_DIST_DIR } from './paths';
import { registerRoutes } from './routes';
import { ownerHash } from './security/hmac';
import { createSocketServer } from './sockets';
import { registerStatic } from './static';

export interface BuildAppOptions {
  /** Defaults to `config.dbFile`; tests pass `:memory:`. */
  dbFile?: string;
  webDistDir?: string;
}

export async function buildApp(config: Config, opts: BuildAppOptions = {}) {
  mkdirSync(config.filesDir, { recursive: true });
  const db = openDatabase(opts.dbFile ?? config.dbFile);
  const repos = createRepositories(db);

  const ctx: AppContext = {
    config,
    db,
    repos,
    conversion: createConversionQueue(config, repos),
    sessions: createSessionCodec(config.secret),
    ownerHash: (personId) => ownerHash(personId, config.secret),
    stateEvents: new EventEmitter(),
  };

  const app = Fastify({
    logger: { level: config.logLevel },
    bodyLimit: 1024 * 1024,
    // Trust only the direct peer (the proxy): the client is the address it appended last, so
    // entries a client forged further left are ignored. Fastify refuses a plain hop count.
    trustProxy: config.trustProxy ? (_addr: string, hop: number) => hop === 0 : false,
  });
  await app.register(fastifyCookie);
  await registerRoutes(app, ctx);
  await registerStatic(app, opts.webDistDir ?? WEB_DIST_DIR);

  const sockets = createSocketServer(app.server, ctx);

  app.addHook('onClose', async () => {
    await sockets.close();
    await ctx.conversion.close();
    db.close();
  });

  return { app, ctx, sockets };
}
