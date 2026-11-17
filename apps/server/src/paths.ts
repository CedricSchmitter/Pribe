import path from 'node:path';
import { fileURLToPath } from 'node:url';

// src/ (tsx) and dist/ (bundle) sit at the same depth, so these hold for dev and production.
const serverDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const REPO_ROOT = path.resolve(serverDir, '..', '..');
export const WEB_DIST_DIR = path.join(REPO_ROOT, 'apps', 'web', 'dist');
export const ROOT_ENV_FILE = path.join(REPO_ROOT, '.env');
