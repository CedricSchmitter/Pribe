import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  platform: 'node',
  target: 'node24',
  outDir: 'dist',
  clean: true,
  sourcemap: true,
  // The shared package ships TypeScript sources only, so it must be bundled.
  noExternal: ['@pribe/shared'],
  // `sqlite` only exists as `node:sqlite`; stripping the prefix breaks the import.
  removeNodeProtocol: false,
});
