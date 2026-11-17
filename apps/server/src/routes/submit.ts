import { randomUUID } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { open, rename, rm } from 'node:fs/promises';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import fastifyMultipart from '@fastify/multipart';
import type { FastifyInstance, FastifyReply } from 'fastify';
import {
  ACCEPTED_UPLOAD_EXTENSIONS,
  API_PATHS,
  apiError,
  topicTitle,
  UPLOAD_FIELDS,
  type Person,
  type SubmissionKind,
  type SubmissionStatusDto,
  type SubmitStatusDto,
  type TopicDto,
  type TopicResponseDto,
} from '@pribe/shared';
import { createPersonSessions } from '../auth/person';
import type { AppContext } from '../context';
import type { SubmissionRecord } from '../db';
import type { TopicAssignment } from '../db/repos/topics';
import { deleteSubmissionFiles, uploadsOpen } from './submitFiles';
import { personRoutes, requirePerson } from './submitPerson';
import { avatarRoutes } from './submitPhoto';

const toTopicDto = (a: TopicAssignment): TopicDto => ({ index: a.topicIndex, title: topicTitle(a.topicIndex) });

const toStatusDto = (s: SubmissionRecord): SubmissionStatusDto => ({
  submissionId: s.id,
  kind: s.kind,
  status: s.status,
  error: s.error,
});

function uploadTypeOf(filename: string | undefined): SubmissionKind | null {
  const ext = path.extname(filename ?? '').toLowerCase();
  if (!(ACCEPTED_UPLOAD_EXTENSIONS as readonly string[]).includes(ext)) return null;
  return ext === '.pptx' ? 'pptx' : 'html';
}

/** Cheap content check so a renamed binary or random text is rejected early. */
async function contentMatches(file: string, type: SubmissionKind): Promise<boolean> {
  const handle = await open(file, 'r');
  try {
    const buf = Buffer.alloc(8192);
    const { bytesRead } = await handle.read(buf, 0, buf.length, 0);
    const head = buf.subarray(0, bytesRead);
    if (type === 'pptx') return head.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04]));
    if (head.includes(0)) return false;
    return /<(!doctype\s+html|html|head|body)\b/i.test(head.toString('utf8'));
  } finally {
    await handle.close();
  }
}

function isFileTooLarge(err: unknown): boolean {
  return (err as { code?: string } | null)?.code === 'FST_REQ_FILE_TOO_LARGE';
}

/**
 * Open routes for phones (P2): `API_PATHS.persons` and everything under `API_PATHS.submit`.
 * Nothing here logs or returns the person together with a submission (R22).
 */
export async function submitRoutes(app: FastifyInstance, ctx: AppContext): Promise<void> {
  const { repos, config } = ctx;
  const maxBytes = Math.floor(config.maxUploadMb * 1024 * 1024);

  const sessions = createPersonSessions(config.secret, repos.persons);

  await app.register(fastifyMultipart, {
    limits: { fileSize: maxBytes, files: 1, fields: 4, fieldSize: 1024, parts: 6 },
  });
  await personRoutes(app, ctx, sessions);
  await avatarRoutes(app, ctx);

  app.get(API_PATHS.persons, async (): Promise<Person[]> => repos.persons.list());

  app.get(API_PATHS.submit.mine, async (req, reply) => {
    const me = requirePerson(sessions, req, reply);
    if (!me) return reply;
    const sub = repos.submissions.findByOwnerHash(ctx.ownerHash(me.id));
    return sub ? toStatusDto(sub) : reply.code(404).send(apiError('NOT_FOUND'));
  });

  app.get(API_PATHS.submit.topic, async (req, reply) => {
    const me = requirePerson(sessions, req, reply);
    if (!me) return reply;
    const assignment = repos.topics.get(ctx.ownerHash(me.id));
    return { topic: assignment ? toTopicDto(assignment) : null } satisfies TopicResponseDto;
  });

  app.post(API_PATHS.submit.topicSpin, async (req, reply) => {
    const me = requirePerson(sessions, req, reply);
    if (!me) return reply;
    const assignment = repos.topics.assign(ctx.ownerHash(me.id));
    return { topic: toTopicDto(assignment) } satisfies TopicResponseDto;
  });

  app.get(API_PATHS.submit.status, async (): Promise<SubmitStatusDto> => {
    const counts = repos.submissions.countByStatus();
    return {
      deadline: repos.settings.get().submissionDeadline,
      uploadsOpen: uploadsOpen(ctx),
      submissionCount: counts.ready + counts.converting,
      maxUploadMb: config.maxUploadMb,
      serverTime: Date.now(),
    };
  });

  app.get<{ Params: { id: string } }>('/api/submit/submissions/:id', async (req, reply) => {
    const sub = repos.submissions.get(req.params.id);
    return sub ? toStatusDto(sub) : reply.code(404).send(apiError('NOT_FOUND'));
  });

  app.post(API_PATHS.submit.upload, async (req, reply) => {
    const me = requirePerson(sessions, req, reply);
    if (!me) return reply;
    const closed = (r: FastifyReply) => r.code(403).send(apiError('UPLOADS_CLOSED'));
    if (!uploadsOpen(ctx)) return closed(reply);
    if (!req.isMultipart()) return reply.code(400).send(apiError('INVALID_PAYLOAD'));

    const part = await req.file().catch(() => undefined);
    if (!part || part.fieldname !== UPLOAD_FIELDS.file) return reply.code(400).send(apiError('INVALID_PAYLOAD'));

    const type = uploadTypeOf(part.filename);
    if (!type) {
      part.file.resume();
      return reply.code(415).send(apiError('UNSUPPORTED_FILE_TYPE'));
    }

    // The original file name is dropped here (R22); only a random temp name touches disk.
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

    // The game may have started while the file was streaming.
    if (!uploadsOpen(ctx)) {
      await rm(tmpPath, { force: true });
      return closed(reply);
    }

    const { submission, replaced } = repos.submissions.replaceForOwner({
      ownerHash: ctx.ownerHash(me.id),
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
          // Replaced while converting: the queue wrote output for a submission that no longer exists.
          if (!repos.submissions.get(stored.id)) await deleteSubmissionFiles(ctx, { id: stored.id, filePath: null });
        })
        .catch((err: unknown) => req.log.error({ err }, 'conversion follow-up failed'));
    }

    return reply.code(201).send(toStatusDto(stored));
  });
}
