import { randomUUID } from 'node:crypto';
import type { EventEmitter } from 'node:events';
import { copyFileSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import type { SubmissionKind } from '@pribe/shared';
import type { Config } from '../config';
import { createRepositories, openDatabase, transaction, type Db } from '../db';
import { REPO_ROOT } from '../paths';
import { BOT_PROFILES, startBots, type BotGame, type BotOptions } from './bots';
import type { SwitchableDb } from './switchableDb';

export type { BotGame } from './bots';
export { createSwitchableDb, type SwitchableDb } from './switchableDb';

export const DEMO_DIR = path.join(REPO_ROOT, 'demo');

/** Relative to `demo/`; one per bot, so the draw never runs into "only your own left". */
const DEMO_FILES: { file: string; kind: SubmissionKind }[] = [
  { file: 'html/katze-als-ceo.html', kind: 'html' },
  { file: 'pptx/kaffeemaschine.pptx', kind: 'pptx' },
  { file: 'html/socken-mythos.html', kind: 'html' },
  { file: 'pptx/buero-pflanzen.pptx', kind: 'pptx' },
  { file: 'html/meeting-nicken.html', kind: 'html' },
];

/** Short limits so a test run reaches the gong and the reveal quickly. */
const PROBE_SETTINGS = { talkTimeLimitS: 30, voteCountdownS: 10 };

export const probeDir = (realDataDir: string) => path.join(realDataDir, 'probelauf');

export interface ProbeDeps {
  /** The live config object; `dataDir` and `filesDir` are redirected while the test run lasts. */
  config: Config;
  dbSwitch: SwitchableDb;
  ownerHash(personId: string): string;
  stateEvents: EventEmitter<{ changed: []; world: [] }>;
  demoDir?: string;
  bots?: BotOptions;
}

/**
 * Test run with bots (R83, D30): a separate temporary database and files directory under
 * `DATA_DIR/probelauf`. Whether it is active lives only in memory, so a restart always comes
 * back to the real game; the leftover directory is removed at startup.
 */
export function createProbe(deps: ProbeDeps) {
  const { config, dbSwitch, stateEvents } = deps;
  const realDb = dbSwitch.current;
  const real = { dataDir: config.dataDir, filesDir: config.filesDir };
  const dir = probeDir(real.dataDir);
  const demoDir = deps.demoDir ?? DEMO_DIR;

  const removeDir = () => {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch (err) {
      console.warn('[probe] could not remove test-run directory', err);
    }
  };
  removeDir();

  let game: BotGame | null = null;
  let run: { db: Db; bots: { stop(): void } | null } | null = null;

  const seed = (db: Db, filesDir: string): string[] => {
    const repos = createRepositories(db);
    return transaction(db, () => {
      repos.settings.update(PROBE_SETTINGS);
      return BOT_PROFILES.map((profile, i) => {
        const bot = repos.persons.create(profile);
        const demo = DEMO_FILES[i];
        if (demo) {
          const fileName = `${randomUUID()}.${demo.kind}`;
          copyFileSync(path.join(demoDir, demo.file), path.join(filesDir, fileName));
          repos.submissions.replaceForOwner({ ownerHash: deps.ownerHash(bot.id), kind: demo.kind, status: 'ready', filePath: fileName });
        }
        return bot.id;
      });
    });
  };

  const switchTo = (db: Db, paths: { dataDir: string; filesDir: string }) => {
    dbSwitch.use(db);
    config.dataDir = paths.dataDir;
    config.filesDir = paths.filesDir;
    stateEvents.emit('world');
    stateEvents.emit('changed');
  };

  return {
    get active() {
      return run !== null;
    },

    attachGame(g: BotGame) {
      game = g;
    },

    start(): void {
      if (run) return;
      for (const d of DEMO_FILES) {
        if (!existsSync(path.join(demoDir, d.file))) throw new Error(`Demo-Datei fehlt: ${d.file}`);
      }
      removeDir();
      const filesDir = path.join(dir, 'files');
      mkdirSync(filesDir, { recursive: true });
      const db = openDatabase(path.join(dir, 'pribe.sqlite'));
      let botIds: string[];
      try {
        botIds = seed(db, filesDir);
      } catch (err) {
        db.close();
        removeDir();
        throw err;
      }
      run = { db, bots: null };
      switchTo(db, { dataDir: dir, filesDir });
      if (game) run.bots = startBots(game, botIds, deps.bots);
    },

    stop(): void {
      if (!run) return;
      const { db, bots } = run;
      bots?.stop();
      run = null;
      switchTo(realDb, real);
      db.close();
      removeDir();
    },

    /** App shutdown: no events, the sockets are closing anyway. */
    shutdown(): void {
      if (!run) return;
      run.bots?.stop();
      dbSwitch.use(realDb);
      Object.assign(config, real);
      run.db.close();
      run = null;
      removeDir();
    },
  };
}

export type Probe = ReturnType<typeof createProbe>;
