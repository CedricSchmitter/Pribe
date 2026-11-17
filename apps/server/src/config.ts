import { existsSync } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { DEFAULT_MAX_UPLOAD_MB } from '@pribe/shared';
import { REPO_ROOT, ROOT_ENV_FILE } from './paths';

const EnvSchema = z.object({
  ADMIN_PASSWORD: z.string().min(1, 'ADMIN_PASSWORD fehlt'),
  PRIBE_SECRET: z.string().min(16, 'PRIBE_SECRET muss mindestens 16 Zeichen haben'),
  PUBLIC_URL: z.url('PUBLIC_URL muss eine URL sein'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  HOST: z.string().default('0.0.0.0'),
  MAX_UPLOAD_MB: z.coerce.number().positive().default(DEFAULT_MAX_UPLOAD_MB),
  DATA_DIR: z.string().default('./data'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
});

export interface Config {
  adminPassword: string;
  secret: string;
  publicUrl: string;
  port: number;
  host: string;
  maxUploadMb: number;
  /** Absolute; relative DATA_DIR values resolve against the repo root. */
  dataDir: string;
  filesDir: string;
  dbFile: string;
  logLevel: z.infer<typeof EnvSchema>['LOG_LEVEL'];
  secureCookies: boolean;
}

export function loadDotEnv(file = ROOT_ENV_FILE): void {
  // process.loadEnvFile never overrides variables that are already set.
  if (existsSync(file)) process.loadEnvFile(file);
}

export function parseConfig(env: NodeJS.ProcessEnv): Config {
  const parsed = EnvSchema.safeParse(env);
  if (!parsed.success) {
    const lines = parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`);
    throw new Error(`Ungültige Konfiguration:\n${lines.join('\n')}`);
  }
  const e = parsed.data;
  const dataDir = path.resolve(REPO_ROOT, e.DATA_DIR);
  return {
    adminPassword: e.ADMIN_PASSWORD,
    secret: e.PRIBE_SECRET,
    publicUrl: e.PUBLIC_URL.replace(/\/+$/, ''),
    port: e.PORT,
    host: e.HOST,
    maxUploadMb: e.MAX_UPLOAD_MB,
    dataDir,
    filesDir: path.join(dataDir, 'files'),
    dbFile: path.join(dataDir, 'pribe.sqlite'),
    logLevel: e.LOG_LEVEL,
    secureCookies: e.PUBLIC_URL.startsWith('https://'),
  };
}
