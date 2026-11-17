import { createHmac } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { apiError, type SubmissionId } from '@pribe/shared';
import { adminGuard } from '../auth/guards';
import type { AppContext } from '../context';

export const PPTX_CONTENT_TYPE = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';

/**
 * Download name for a PPTX: PowerPoint shows it in the title bar, so it is keyed on the
 * submission (not the owner hash) with its own label, and cannot be matched to other hashes.
 */
export function downloadName(secret: string, submissionId: SubmissionId): string {
  return createHmac('sha256', secret).update(`pribe-file:${submissionId}`).digest('hex').slice(0, 16);
}

/**
 * Presentation file `API_PATHS.file(id)` for the beamer (R44, D23). Host/admin only, so
 * nobody can download the whole pool in advance. HTML gets a CSP sandbox so that, even
 * when opened directly in a tab, it runs in an opaque origin without Pribe's cookies (D04).
 */
export async function fileRoutes(app: FastifyInstance, ctx: AppContext): Promise<void> {
  app.addHook('onRequest', adminGuard(ctx.sessions));

  app.get<{ Params: { id: string } }>('/api/files/:id', async (req, reply) => {
    const sub = ctx.repos.submissions.get(req.params.id);
    if (!sub || sub.status !== 'ready' || !sub.filePath) return reply.code(404).send(apiError('NOT_FOUND'));

    const root = path.resolve(ctx.config.filesDir);
    const file = path.resolve(root, sub.filePath);
    if (!file.startsWith(root + path.sep)) return reply.code(404).send(apiError('NOT_FOUND'));
    const info = await stat(file).catch(() => null);
    if (!info?.isFile()) return reply.code(404).send(apiError('NOT_FOUND'));

    reply
      .header('Cache-Control', 'no-store')
      .header('X-Content-Type-Options', 'nosniff')
      .header('Referrer-Policy', 'no-referrer')
      .header('Content-Length', info.size);
    if (sub.kind === 'html') {
      reply.type('text/html; charset=utf-8').header('Content-Security-Policy', 'sandbox allow-scripts');
    } else {
      reply
        .type(PPTX_CONTENT_TYPE)
        .header('Content-Disposition', `attachment; filename="${downloadName(ctx.config.secret, sub.id)}.pptx"`);
    }
    return reply.send(createReadStream(file));
  });
}
