import type { FastifyInstance } from 'fastify';
import { API_PATHS, apiError, LoginRequestSchema, SESSION_COOKIE_NAME, type AuthStatusDto } from '@pribe/shared';
import { createLoginLimiter, lockMessage } from '../auth/loginLimiter';
import { passwordMatches } from '../auth/session';
import type { AppContext } from '../context';

export async function authRoutes(app: FastifyInstance, ctx: AppContext) {
  const cookieOptions = {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: ctx.config.secureCookies,
  } as const;
  const limiter = createLoginLimiter();

  app.post(API_PATHS.auth.login, async (req, reply) => {
    const body = LoginRequestSchema.safeParse(req.body);
    if (!body.success) return reply.code(400).send(apiError('INVALID_PAYLOAD'));

    const locked = (ms: number) =>
      reply
        .code(429)
        .header('retry-after', String(Math.ceil(ms / 1000)))
        .send(apiError('LOGIN_LOCKED', lockMessage(ms)));

    // While locked, even the right password is refused, or the lock would not stop guessing.
    const lockedFor = limiter.lockedFor(req.ip);
    if (lockedFor) return locked(lockedFor);
    if (!passwordMatches(body.data.password, ctx.config.adminPassword)) {
      const lockMs = limiter.fail(req.ip);
      if (lockMs) {
        req.log.warn({ ip: req.ip }, 'admin login locked');
        return locked(lockMs);
      }
      return reply.code(401).send(apiError('UNAUTHORIZED', 'Falsches Passwort.'));
    }
    limiter.succeed(req.ip);
    const { token, expiresAt } = ctx.sessions.issue();
    reply.setCookie(SESSION_COOKIE_NAME, token, { ...cookieOptions, expires: new Date(expiresAt) });
    return { authenticated: true } satisfies AuthStatusDto;
  });

  app.post(API_PATHS.auth.logout, async (_req, reply) => {
    reply.clearCookie(SESSION_COOKIE_NAME, cookieOptions);
    return { authenticated: false } satisfies AuthStatusDto;
  });

  app.get(API_PATHS.auth.me, async (req) => {
    return { authenticated: ctx.sessions.verify(req.cookies[SESSION_COOKIE_NAME]) } satisfies AuthStatusDto;
  });
}
