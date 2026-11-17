import { buildApp } from './app';
import { loadDotEnv, parseConfig } from './config';

loadDotEnv();

let config;
try {
  config = parseConfig(process.env);
} catch (err) {
  console.error((err as Error).message);
  process.exit(1);
}

const { app } = await buildApp(config);

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    app.close().finally(() => process.exit(0));
  });
}

await app.listen({ port: config.port, host: config.host });
