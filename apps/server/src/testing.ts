import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { parseConfig, type Config } from './config';

/** Config for tests with a fresh temporary DATA_DIR. */
export function testConfig(env: Record<string, string> = {}): Config {
  return parseConfig({
    ADMIN_PASSWORD: 'test-password',
    PRIBE_SECRET: 'test-secret-0123456789',
    PUBLIC_URL: 'http://localhost:3000',
    DATA_DIR: mkdtempSync(path.join(tmpdir(), 'pribe-test-')),
    LOG_LEVEL: 'silent',
    ...env,
  });
}
