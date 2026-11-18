import { rm } from 'node:fs/promises';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import {
  API_PATHS,
  apiError,
  PersonIdSchema,
  PersonInputSchema,
  ResetAllRequestSchema,
  SettingsInputSchema,
  type AdminPersonDto,
  type ResetResponseDto,
  type AdminSettingsDto,
  type SubmissionOverviewDto,
} from '@pribe/shared';
import type { AppContext } from '../context';
import { transaction } from '../db';
import { deleteSubmissionFiles } from './submitFiles';
import { avatarsDir, removePhoto } from './submitPhoto';

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

  const none: ResetResponseDto = { rounds: 0, topics: 0, submissions: 0, persons: 0 };

  /**
   * Back to a fresh lobby. The pool is derived from rounds, so shown submissions return to it.
   * The surprise guest (R90) is setup like persons and submissions, so it stays.
   */
  const resetGame = (): number => {
    const rounds = repos.rounds.list().length;
    repos.rounds.removeAll(); // votes cascade
    repos.game.save('lobby', {});
    return rounds;
  };

  // Resets are meant for the real data (R88); during a test run they would only hit the bots.
  const resetPaths = new Set<string>([API_PATHS.admin.reset, API_PATHS.admin.resetTopics, API_PATHS.admin.resetAll]);
  app.addHook('preHandler', async (req, reply) => {
    if (ctx.probe.active && req.method === 'POST' && resetPaths.has(req.routeOptions.url ?? '')) {
      return reply.code(409).send(apiError('PROBE_ACTIVE'));
    }
  });

  // Open screens get the lobby through the onResponse hook above (stateEvents → engine restart).
  app.post(API_PATHS.admin.reset, async (req) => {
    const rounds = transaction(ctx.db, resetGame);
    req.log.info({ rounds }, 'game reset');
    return { ...none, rounds } satisfies ResetResponseDto;
  });

  app.post(API_PATHS.admin.resetTopics, async (req) => {
    const topics = repos.topics.removeAll();
    req.log.info({ topics }, 'topics reset');
    return { ...none, topics } satisfies ResetResponseDto;
  });

  app.post(API_PATHS.admin.resetAll, async (req, reply) => {
    if (!ResetAllRequestSchema.safeParse(req.body).success) return reply.code(400).send(apiError('INVALID_PAYLOAD'));
    const guestSubmission = repos.submissions.getGuest();
    const doomed = guestSubmission ? [...repos.submissions.list(), guestSubmission] : repos.submissions.list();
    const result = transaction(ctx.db, () => {
      const rounds = resetGame();
      const topics = repos.topics.removeAll();
      // The guest presentation goes too, but is not counted as a submission (R90).
      const submissions = repos.submissions.removeAll() - (guestSubmission ? 1 : 0);
      const persons = repos.persons.removeAll();
      const guestPhoto = repos.guest.reset();
      return { rounds, topics, submissions, persons, guestPhoto };
    });
    const photoFiles = result.guestPhoto ? [...result.persons.photoFiles, result.guestPhoto] : result.persons.photoFiles;
    await Promise.all([
      ...doomed.map((s) => deleteSubmissionFiles(ctx, s)),
      ...photoFiles.map((f) => rm(path.join(avatarsDir(ctx), f), { force: true })),
    ]);
    const { rounds, topics, submissions } = result;
    const dto = { rounds, topics, submissions, persons: result.persons.count } satisfies ResetResponseDto;
    req.log.info(dto, 'everything deleted');
    return dto;
  });
}
