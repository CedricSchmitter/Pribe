import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Socket } from 'socket.io';
import { apiError, SESSION_COOKIE_NAME } from '@pribe/shared';
import type { SessionCodec } from './session';

/** Fastify `onRequest` hook for admin-only routes. */
export function adminGuard(sessions: SessionCodec) {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    if (!sessions.verify(req.cookies[SESSION_COOKIE_NAME])) {
      return reply.code(401).send(apiError('UNAUTHORIZED'));
    }
  };
}

/** Socket.IO namespace middleware for the host role: checks the cookie sent with the handshake. */
export function socketAdminGuard(sessions: SessionCodec) {
  return (socket: Socket, next: (err?: Error) => void) => {
    if (sessions.verifyCookieHeader(socket.handshake.headers.cookie)) return next();
    const err = new Error('UNAUTHORIZED') as Error & { data?: unknown };
    err.data = apiError('UNAUTHORIZED');
    next(err);
  };
}
