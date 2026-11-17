import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import {
  API_PATHS,
  apiError,
  AVATAR_MAX_BYTES,
  ERROR_MESSAGES_DE,
  PERSON_COOKIE_NAME,
  PersonCredentialsSchema,
  PersonIdSchema,
  PHOTO_FIELD,
  RegisterRequestSchema,
  type Person,
  type PersonAuthStatusDto,
  type PersonMeDto,
} from '@pribe/shared';
import { hashPassword, verifyPassword, type PersonSessions } from '../auth/person';
import type { AppContext } from '../context';
import { transaction } from '../db';
import { imageExtension, removePhoto, replacePhoto } from './submitPhoto';

/** Personal login routes for `/submit` and `/vote` (D25). */
export async function personRoutes(app: FastifyInstance, ctx: AppContext, sessions: PersonSessions): Promise<void> {
  const { persons } = ctx.repos;
  const cookieOptions = {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: ctx.config.secureCookies,
  } as const;

  const startSession = (reply: FastifyReply, personId: string, passwordHash: string) => {
    const { token, expiresAt } = sessions.issue(personId, passwordHash);
    reply.setCookie(PERSON_COOKIE_NAME, token, { ...cookieOptions, expires: new Date(expiresAt) });
  };

  app.get<{ Params: { id: string } }>('/api/person/:id/status', async (req, reply) => {
    const id = PersonIdSchema.safeParse(req.params.id);
    const hash = id.success ? persons.getPasswordHash(id.data) : undefined;
    if (hash === undefined) return reply.code(404).send(apiError('UNKNOWN_PERSON'));
    return { hasPassword: hash !== null } satisfies PersonAuthStatusDto;
  });

  app.post(API_PATHS.person.setPassword, async (req, reply) => {
    const body = PersonCredentialsSchema.safeParse(req.body);
    if (!body.success) return reply.code(400).send(apiError('INVALID_PAYLOAD'));
    const current = persons.getPasswordHash(body.data.personId);
    if (current === undefined) return reply.code(404).send(apiError('UNKNOWN_PERSON'));
    if (current !== null) return reply.code(409).send(apiError('PASSWORD_ALREADY_SET'));
    const hash = await hashPassword(body.data.password);
    // Re-check after the slow hash: a parallel request may have set one meanwhile.
    if (persons.getPasswordHash(body.data.personId) !== null) {
      return reply.code(409).send(apiError('PASSWORD_ALREADY_SET'));
    }
    persons.setPasswordHash(body.data.personId, hash);
    startSession(reply, body.data.personId, hash);
    return { person: persons.get(body.data.personId) } satisfies PersonMeDto;
  });

  app.post(API_PATHS.person.login, async (req, reply) => {
    const body = PersonCredentialsSchema.safeParse(req.body);
    if (!body.success) return reply.code(400).send(apiError('INVALID_PAYLOAD'));
    const hash = persons.getPasswordHash(body.data.personId);
    if (hash === undefined) return reply.code(404).send(apiError('UNKNOWN_PERSON'));
    if (hash === null) return reply.code(409).send(apiError('PASSWORD_NOT_SET'));
    if (!(await verifyPassword(body.data.password, hash))) return reply.code(401).send(apiError('WRONG_PASSWORD'));
    startSession(reply, body.data.personId, hash);
    return { person: persons.get(body.data.personId) } satisfies PersonMeDto;
  });

  app.post(API_PATHS.person.logout, async (_req, reply) => {
    reply.clearCookie(PERSON_COOKIE_NAME, cookieOptions);
    return { person: null } satisfies PersonMeDto;
  });

  app.get(API_PATHS.person.me, async (req) => ({ person: sessions.verify(req.cookies[PERSON_COOKIE_NAME]) }) satisfies PersonMeDto);

  app.post(API_PATHS.person.register, async (req, reply) => {
    const body = RegisterRequestSchema.safeParse(req.body);
    if (!body.success) return reply.code(400).send(apiError('INVALID_PAYLOAD'));
    const expected = ctx.repos.settings.get().inviteCode;
    if (!expected || expected.toLowerCase() !== body.data.inviteCode.toLowerCase()) {
      return reply.code(403).send(apiError('INVALID_INVITE_CODE'));
    }
    const { name, emoji, color, password } = body.data;
    const input = { name, emoji, color };
    const hash = await hashPassword(password);
    let person: Person;
    try {
      person = transaction(ctx.db, () => {
        const created = persons.create(input);
        persons.setPasswordHash(created.id, hash);
        return created;
      });
    } catch (err) {
      if (err instanceof Error && /UNIQUE constraint failed/i.test(err.message)) {
        return reply.code(409).send(apiError('NAME_TAKEN'));
      }
      throw err;
    }
    startSession(reply, person.id, hash);
    ctx.stateEvents.emit('changed');
    return reply.code(201).send({ person } satisfies PersonMeDto);
  });

  app.put(API_PATHS.person.photo, async (req, reply) => {
    const me = requirePerson(sessions, req, reply);
    if (!me) return reply;
    if (!req.isMultipart()) return reply.code(400).send(apiError('INVALID_PAYLOAD'));
    const part = await req.file({ limits: { fileSize: AVATAR_MAX_BYTES, files: 1 } }).catch(() => undefined);
    if (!part || part.fieldname !== PHOTO_FIELD) return reply.code(400).send(apiError('INVALID_PAYLOAD'));
    let data: Buffer;
    try {
      data = await part.toBuffer();
    } catch (err) {
      if ((err as { code?: string }).code === 'FST_REQ_FILE_TOO_LARGE') {
        return reply.code(413).send(apiError('FILE_TOO_LARGE', ERROR_MESSAGES_DE.UNSUPPORTED_IMAGE));
      }
      throw err;
    }
    const ext = imageExtension(data);
    if (!ext) return reply.code(415).send(apiError('UNSUPPORTED_IMAGE'));
    await replacePhoto(ctx, me.id, data, ext);
    ctx.stateEvents.emit('changed');
    return { person: persons.get(me.id) } satisfies PersonMeDto;
  });

  app.delete(API_PATHS.person.photo, async (req, reply) => {
    const me = requirePerson(sessions, req, reply);
    if (!me) return reply;
    await removePhoto(ctx, me.id);
    ctx.stateEvents.emit('changed');
    return { person: persons.get(me.id) } satisfies PersonMeDto;
  });
}

/** The logged-in person, or a 401 already sent. */
export function requirePerson(sessions: PersonSessions, req: FastifyRequest, reply: FastifyReply): Person | null {
  const person = sessions.verify(req.cookies[PERSON_COOKIE_NAME]);
  if (!person) void reply.code(401).send(apiError('NOT_IDENTIFIED'));
  return person;
}
