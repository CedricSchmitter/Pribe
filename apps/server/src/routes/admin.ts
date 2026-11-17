import type { FastifyInstance } from 'fastify';
import {
  API_PATHS,
  apiError,
  PersonIdSchema,
  PersonInputSchema,
  ResetRequestSchema,
  SettingsInputSchema,
  type AdminPersonDto,
  type ResetResponseDto,
  type AdminSettingsDto,
  type SubmissionOverviewDto,
} from '@pribe/shared';
import type { AppContext } from '../context';
import { transaction } from '../db';
import { deleteSubmissionFiles } from './submitFiles';
import { removePhoto } from './submitPhoto';

function isUniqueViolation(err: unknown): boolean {
  return err instanceof Error && /UNIQUE constraint failed/i.test(err.message);
}

/**
 * Admin REST routes (P2): persons, settings, submission overview, reset.
 * Registered inside a scope that already enforces the admin session.
 */
export async function adminRoutes(app: FastifyInstance, ctx: AppContext): Promise<void> {
  const { repos } = ctx;

  app.addHook('onResponse', async (req, reply) => {
    if (req.method !== 'GET' && reply.statusCode < 300) ctx.stateEvents.emit('changed');
  });

  app.get(API_PATHS.admin.persons, async (): Promise<AdminPersonDto[]> => {
    const withPassword = repos.persons.idsWithPassword();
    return repos.persons.list().map((p) => ({ ...p, hasPassword: withPassword.has(p.id) }));
  });

  // Submission and topic hang off the owner hash, not the password, so both stay (D25).
  app.post<{ Params: { id: string } }>('/api/admin/persons/:id/password-reset', async (req, reply) => {
    const id = PersonIdSchema.safeParse(req.params.id);
    if (!id.success) return reply.code(400).send(apiError('INVALID_PAYLOAD'));
    if (!repos.persons.setPasswordHash(id.data, null)) return reply.code(404).send(apiError('UNKNOWN_PERSON'));
    return reply.code(204).send();
  });

  app.post(API_PATHS.admin.persons, async (req, reply) => {
    const body = PersonInputSchema.safeParse(req.body);
    if (!body.success) return reply.code(400).send(apiError('INVALID_PAYLOAD'));
    try {
      return reply.code(201).send(repos.persons.create(body.data));
    } catch (err) {
      if (isUniqueViolation(err)) return reply.code(409).send(apiError('NAME_TAKEN'));
      throw err;
    }
  });

  app.put<{ Params: { id: string } }>('/api/admin/persons/:id', async (req, reply) => {
    const id = PersonIdSchema.safeParse(req.params.id);
    const body = PersonInputSchema.safeParse(req.body);
    if (!id.success || !body.success) return reply.code(400).send(apiError('INVALID_PAYLOAD'));
    try {
      const person = repos.persons.update(id.data, body.data);
      return person ?? reply.code(404).send(apiError('UNKNOWN_PERSON'));
    } catch (err) {
      if (isUniqueViolation(err)) return reply.code(409).send(apiError('NAME_TAKEN'));
      throw err;
    }
  });

  app.delete<{ Params: { id: string } }>('/api/admin/persons/:id', async (req, reply) => {
    const id = PersonIdSchema.safeParse(req.params.id);
    if (!id.success) return reply.code(400).send(apiError('INVALID_PAYLOAD'));
    // Mid-game, deleting a person would orphan their submission or rounds that refer to it.
    if (repos.game.get().phase !== 'lobby') {
      return reply.code(409).send(apiError('WRONG_PHASE', 'Personen lassen sich nur vor Spielstart entfernen.'));
    }
    const hash = ctx.ownerHash(id.data);
    const photo = repos.persons.getPhotoFile(id.data);
    const submission = repos.submissions.findByOwnerHash(hash);
    const removed = transaction(ctx.db, () => {
      if (submission) repos.submissions.remove(submission.id);
      repos.topics.remove(hash);
      return repos.persons.remove(id.data);
    });
    if (!removed) return reply.code(404).send(apiError('UNKNOWN_PERSON'));
    if (submission) await deleteSubmissionFiles(ctx, submission);
    if (photo) await removePhoto(ctx, id.data, photo);
    return reply.code(204).send();
  });

  app.delete<{ Params: { id: string } }>('/api/admin/persons/:id/photo', async (req, reply) => {
    const id = PersonIdSchema.safeParse(req.params.id);
    if (!id.success) return reply.code(400).send(apiError('INVALID_PAYLOAD'));
    if (!repos.persons.get(id.data)) return reply.code(404).send(apiError('UNKNOWN_PERSON'));
    await removePhoto(ctx, id.data);
    return reply.code(204).send();
  });

  const settingsDto = (): AdminSettingsDto => ({ ...repos.settings.get(), publicUrl: ctx.config.publicUrl });

  app.get(API_PATHS.admin.settings, async (): Promise<AdminSettingsDto> => settingsDto());

  app.put(API_PATHS.admin.settings, async (req, reply) => {
    const body = SettingsInputSchema.safeParse(req.body);
    if (!body.success) return reply.code(400).send(apiError('INVALID_PAYLOAD'));
    repos.settings.update(body.data);
    return settingsDto();
  });

  app.get(API_PATHS.admin.submissions, async (): Promise<SubmissionOverviewDto> => {
    const items = repos.submissions.list().map(({ id, kind, status }) => ({ id, kind, status }));
    return { total: items.length, byStatus: repos.submissions.countByStatus(), items };
  });

  app.post(API_PATHS.admin.reset, async (req, reply) => {
    const body = ResetRequestSchema.safeParse(req.body ?? {});
    if (!body.success) return reply.code(400).send(apiError('INVALID_PAYLOAD'));
    const doomed = body.data.deleteSubmissions ? repos.submissions.list() : [];
    transaction(ctx.db, () => {
      repos.rounds.removeAll(); // votes cascade
      repos.game.save('lobby', {});
      if (body.data.deleteSubmissions) repos.submissions.removeAll();
    });
    await Promise.all(doomed.map((s) => deleteSubmissionFiles(ctx, s)));
    req.log.info({ submissionsDeleted: doomed.length }, 'game reset');
    return { submissionsDeleted: doomed.length } satisfies ResetResponseDto;
  });
}
