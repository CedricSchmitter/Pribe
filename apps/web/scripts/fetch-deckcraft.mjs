// Puts the pinned DeckCraft web build (PPTX player on the beamer) into public/deckcraft, where Vite
// serves it in dev and copies it into dist. Skips the download when that version is already there.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { unzipSync } from 'fflate';

const VERSION = '0.18.1';
const SHA256 = '3196e537fcfab538aaa2e88584bc74e29bb584459b916ab584ac22fbafe32db5';
const ZIP_URL = `https://github.com/storytold/deckcraft/releases/download/v${VERSION}/deckcraft-web-${VERSION}.zip`;

const target = path.resolve(import.meta.dirname, '../public/deckcraft');
const stamp = path.join(target, '.version');

if (existsSync(stamp) && readFileSync(stamp, 'utf8') === VERSION) process.exit(0);

console.log(`[deckcraft] downloading ${VERSION} …`);
const res = await fetch(ZIP_URL);
if (!res.ok) throw new Error(`[deckcraft] download failed: HTTP ${res.status}`);
const zip = new Uint8Array(await res.arrayBuffer());
const hash = createHash('sha256').update(zip).digest('hex');
if (hash !== SHA256) throw new Error(`[deckcraft] checksum mismatch: ${hash}`);

const prefix = `deckcraft-web-${VERSION}/`;
rmSync(target, { recursive: true, force: true });
for (const [name, data] of Object.entries(unzipSync(zip))) {
  if (!name.startsWith(prefix) || name.endsWith('/')) continue;
  const rel = name.slice(prefix.length);
  const file = path.resolve(target, rel);
  if (!file.startsWith(target + path.sep)) throw new Error(`[deckcraft] unexpected path in zip: ${name}`);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, data);
}
writeFileSync(stamp, VERSION);
console.log(`[deckcraft] ${VERSION} ready in ${path.relative(process.cwd(), target)}`);
