import type { FastifyInstance } from 'fastify';
import { API_PATHS, apiError, type ProbeStatusDto } from '@pribe/shared';
import type { AppContext } from '../context';

/** Test run with bots (R83). Registered inside the admin scope. */
export async function probeRoutes(app: FastifyInstance, ctx: AppContext): Promise<void> {
  const status = (): ProbeStatusDto => ({ active: ctx.probe.active });

  app.get(API_PATHS.admin.probe, async () => status());

  app.post(API_PATHS.admin.probeStart, async (req, reply) => {
    if (ctx.probe.active) return reply.code(409).send(apiError('PROBE_ACTIVE'));
    ctx.probe.start();
    req.log.info('test run started');
    return status();
  });

  app.post(API_PATHS.admin.probeStop, async (req) => {
    ctx.probe.stop();
    req.log.info('test run stopped');
    return status();
  });
}
