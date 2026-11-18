import { randomUUID } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import fastifyMultipart from '@fastify/multipart';
import type { FastifyInstance } from 'fastify';
import {
  API_PATHS,
  apiError,
  AVATAR_MAX_BYTES,
  ERROR_MESSAGES_DE,
  GuestInputSchema,
  PHOTO_FIELD,
  UPLOAD_FIELDS,
} from '@pribe/shared';
import type { AppContext } from '../context';
import { adminGuestDto } from '../game/guest';
import { contentMatches, isFileTooLarge, uploadTypeOf } from './submit';
import { deleteSubmissionFiles } from './submitFiles';
import { avatarsDir, imageExtension } from './submitPhoto';

/**
 * Surprise guest (R90), admin only. The presentation goes through the same checks and PPTX
 * metadata cleanup as a normal upload, but is stored as the guest submission: never in the
 * pool, the overview or the counts, and never a round.
 */
export async function adminGuestRoutes(app: FastifyInstance, ctx: AppContext): Promise<void> {
  const { repos, config } = ctx;
  const maxBytes = Math.floor(config.maxUploadMb * 1024 * 1024);
  await app.register(fastifyMultipart, { limits: { fileSize: maxBytes, files: 1, fields: 4, fieldSize: 1024, parts: 6 } });

  const onStage = () => repos.game.get().phase === 'guest';
  const busy = () => apiError('WRONG_PHASE', 'Der Gast ist gerade auf der Bühne.');

  app.get(API_PATHS.admin.guest, async () => adminGuestDto(repos));

  app.put(API_PATHS.admin.guest, async (req, reply) => {
    const body = GuestInputSchema.safeParse(req.body);
    if (!body.success) return reply.code(400).send(apiError('INVALID_PAYLOAD'));
    if (body.data.personId && !repos.persons.get(body.data.personId)) return reply.code(404).send(apiError('UNKNOWN_PERSON'));
    repos.guest.update(body.data);
    return adminGuestDto(repos);
  });

  app.put(API_PATHS.admin.guestPhoto, async (req, reply) => {
    if (!req.isMultipart()) return reply.code(400).send(apiError('INVALID_PAYLOAD'));
    const part = await req.file({ limits: { fileSize: AVATAR_MAX_BYTES, files: 1 } }).catch(() => undefined);
    if (!part || part.fieldname !== PHOTO_FIELD) return reply.code(400).send(apiError('INVALID_PAYLOAD'));
    let data: Buffer;
    try {
      data = await part.toBuffer();
    } catch (err) {
      if (isFileTooLarge(err)) return reply.code(413).send(apiError('FILE_TOO_LARGE', ERROR_MESSAGES_DE.UNSUPPORTED_IMAGE));
      throw err;
    }
    const ext = imageExtension(data);
    if (!ext) return reply.code(415).send(apiError('UNSUPPORTED_IMAGE'));
    // Same random naming as person photos, so the public avatars route serves it.
    const file = `${randomUUID()}.${ext}`;
    await mkdir(avatarsDir(ctx), { recursive: true });
    await writeFile(path.join(avatarsDir(ctx), file), data);
    const previous = repos.guest.get().photoFile;
    repos.guest.setPhotoFile(file);
    if (previous) await rm(path.join(avatarsDir(ctx), previous), { force: true });
    return adminGuestDto(repos);
  });

  app.delete(API_PATHS.admin.guestPhoto, async () => {
    const previous = repos.guest.get().photoFile;
    repos.guest.setPhotoFile(null);
    if (previous) await rm(path.join(avatarsDir(ctx), previous), { force: true });
    return adminGuestDto(repos);
  });

  app.post(API_PATHS.admin.guestPresentation, async (req, reply) => {
    if (onStage()) return reply.code(409).send(busy());
    if (!req.isMultipart()) return reply.code(400).send(apiError('INVALID_PAYLOAD'));
    const part = await req.file().catch(() => undefined);
    if (!part || part.fieldname !== UPLOAD_FIELDS.file) return reply.code(400).send(apiError('INVALID_PAYLOAD'));
    const type = uploadTypeOf(part.filename);
    if (!type) {
      part.file.resume();
      return reply.code(415).send(apiError('UNSUPPORTED_FILE_TYPE'));
    }

    const tmpPath = path.join(config.filesDir, `upload-${randomUUID()}.tmp`);
    try {
      await pipeline(part.file, createWriteStream(tmpPath));
      if (part.file.truncated) throw Object.assign(new Error('too large'), { code: 'FST_REQ_FILE_TOO_LARGE' });
      if (!(await contentMatches(tmpPath, type))) {
        await rm(tmpPath, { force: true });
        return reply.code(415).send(apiError('UNSUPPORTED_FILE_TYPE'));
      }
    } catch (err) {
      await rm(tmpPath, { force: true });
      if (isFileTooLarge(err)) return reply.code(413).send(apiError('FILE_TOO_LARGE'));
      throw err;
    }
    if (onStage()) {
      await rm(tmpPath, { force: true });
      return reply.code(409).send(busy());
    }

    const { submission, replaced } = repos.submissions.replaceGuest({
      kind: type,
      status: type === 'html' ? 'ready' : 'converting',
      filePath: null,
    });
    const fileName = `${submission.id}.${type}`;
    const finalPath = path.join(config.filesDir, fileName);
    await rename(tmpPath, finalPath);
    const stored = repos.submissions.updateStatus(submission.id, { status: submission.status, filePath: fileName })!;
    if (replaced) await deleteSubmissionFiles(ctx, replaced);

    if (type === 'pptx') {
      void ctx.conversion
        .enqueue({ submissionId: stored.id, inputPath: finalPath })
        .then(async () => {
          if (!repos.submissions.get(stored.id)) await deleteSubmissionFiles(ctx, { id: stored.id, filePath: null });
        })
        .catch((err: unknown) => req.log.error({ err }, 'guest conversion follow-up failed'));
    }
    return reply.code(201).send(adminGuestDto(repos));
  });

  app.delete(API_PATHS.admin.guestPresentation, async (_req, reply) => {
    if (onStage()) return reply.code(409).send(busy());
    const sub = repos.submissions.getGuest();
    if (sub) {
      repos.submissions.remove(sub.id);
      await deleteSubmissionFiles(ctx, sub);
    }
    return adminGuestDto(repos);
  });
}
