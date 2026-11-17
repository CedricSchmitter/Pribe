import path from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

const repoRoot = path.resolve(import.meta.dirname, '../..');

export default defineConfig(({ mode }) => {
  // Same root .env as the server, so parallel checkouts can pick their own ports.
  const env = { ...loadEnv(mode, repoRoot, ''), ...process.env };
  const apiTarget = `http://localhost:${env.PORT ?? 3000}`;

  return {
    plugins: [react()],
    server: {
      port: Number(env.WEB_DEV_PORT ?? 5173),
      strictPort: true,
      proxy: {
        '/api': apiTarget,
        '/socket.io': { target: apiTarget, ws: true },
      },
    },
  };
});
