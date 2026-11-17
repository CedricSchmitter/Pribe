import type { FastifyInstance } from 'fastify';
import { API_PATHS, apiError, LoginRequestSchema, SESSION_COOKIE_NAME, type AuthStatusDto } from '@pribe/shared';
import { passwordMatches } from '../auth/session';
import type { AppContext } from '../context';

export async function authRoutes(app: FastifyInstance, ctx: AppContext) {
  const cookieOptions = {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: ctx.config.secureCookies,
  } as const;

  app.post(API_PATHS.auth.login, async (req, reply) => {
    const body = LoginRequestSchema.safeParse(req.body);
    if (!body.success) return reply.code(400).send(apiError('INVALID_PAYLOAD'));
    if (!passwordMatches(body.data.password, ctx.config.adminPassword)) {
      return reply.code(401).send(apiError('UNAUTHORIZED', 'Falsches Passwort.'));
    }
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
