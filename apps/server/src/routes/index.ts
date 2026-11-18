import type { FastifyInstance } from 'fastify';
import { API_PATHS, type HealthResponse } from '@pribe/shared';
import { adminGuard } from '../auth/guards';
import type { AppContext } from '../context';
import { adminRoutes } from './admin';
import { adminGuestRoutes } from './adminGuest';
import { authRoutes } from './auth';
import { fileRoutes } from './files';
import { hostRoutes } from './host';
import { probeRoutes } from './probe';
import { submitRoutes } from './submit';

export async function registerRoutes(app: FastifyInstance, ctx: AppContext) {
  app.get(API_PATHS.health, async (): Promise<HealthResponse> => ({
    status: 'ok',
    uptimeS: Math.round(process.uptime()),
  }));

  await app.register(async (scope) => authRoutes(scope, ctx));
  await app.register(async (scope) => submitRoutes(scope, ctx));
  await app.register(async (scope) => fileRoutes(scope, ctx));
  await app.register(async (scope) => {
    scope.addHook('onRequest', adminGuard(ctx.sessions));
    await adminRoutes(scope, ctx);
    // Own scope for its multipart parser; inherits the admin guard and change hook above.
    await scope.register(async (guest) => adminGuestRoutes(guest, ctx));
    await hostRoutes(scope, ctx);
    await probeRoutes(scope, ctx);
  });
}
