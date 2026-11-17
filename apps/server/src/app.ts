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
import { createProbe, createSwitchableDb } from './probe';
import type { BotOptions } from './probe/bots';
import { registerRoutes } from './routes';
import { ownerHash } from './security/hmac';
import { createSocketServer } from './sockets';
import { registerStatic } from './static';

export interface BuildAppOptions {
  /** Defaults to `config.dbFile`; tests pass `:memory:`. */
  dbFile?: string;
  webDistDir?: string;
  /** Tests speed up the test-run bots. */
  probeBots?: BotOptions;
}

export async function buildApp(inputConfig: Config, opts: BuildAppOptions = {}) {
  // Own copy: the test run redirects its data paths (R83).
  const config = { ...inputConfig };
  mkdirSync(config.filesDir, { recursive: true });
  const realDb = openDatabase(opts.dbFile ?? config.dbFile);
  const dbSwitch = createSwitchableDb(realDb);
  const repos = createRepositories(dbSwitch.db);
  const stateEvents: AppContext['stateEvents'] = new EventEmitter();
  const hash = (personId: string) => ownerHash(personId, config.secret);

  const ctx: AppContext = {
    config,
    db: dbSwitch.db,
    repos,
    conversion: createConversionQueue(config, repos),
    sessions: createSessionCodec(config.secret),
    ownerHash: hash,
    stateEvents,
    probe: createProbe({ config, dbSwitch, ownerHash: hash, stateEvents, bots: opts.probeBots }),
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
  ctx.probe.attachGame(sockets.bots);

  app.addHook('onClose', async () => {
    ctx.probe.shutdown();
    await sockets.close();
    await ctx.conversion.close();
    realDb.close();
  });

  return { app, ctx, sockets };
}
