import { existsSync } from 'node:fs';
import fastifyStatic from '@fastify/static';
import type { FastifyInstance } from 'fastify';
import { apiError, CLIENT_ROUTES } from '@pribe/shared';

const isClientRoute = (url: string) => {
  const pathname = url.split('?')[0]!;
  return pathname === '/' || CLIENT_ROUTES.some((r) => pathname === r || pathname.startsWith(`${r}/`));
};

/** Serves the built frontend with an index.html fallback for the SPA routes (production). */
export async function registerStatic(app: FastifyInstance, webDistDir: string) {
  const hasWeb = existsSync(webDistDir);
  if (hasWeb) await app.register(fastifyStatic, { root: webDistDir });

  app.setNotFoundHandler((req, reply) => {
    if (hasWeb && req.method === 'GET' && isClientRoute(req.url)) {
      return reply.sendFile('index.html');
    }
    return reply.code(404).send(apiError('NOT_FOUND'));
  });
}
