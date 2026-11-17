import { randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { API_PATHS, apiError, type PersonId } from '@pribe/shared';
import type { AppContext } from '../context';

const IMAGE_TYPES = [
  { ext: 'jpg', mime: 'image/jpeg', matches: (b: Buffer) => b.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff])) },
  { ext: 'png', mime: 'image/png', matches: (b: Buffer) => b.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47])) },
  {
    ext: 'webp',
    mime: 'image/webp',
    matches: (b: Buffer) => b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP',
  },
] as const;

const FILE_PATTERN = /^[0-9a-f-]{36}\.(jpg|png|webp)$/;

export const avatarsDir = (ctx: AppContext) => path.join(ctx.config.dataDir, 'avatars');

/** Detects the image type from its magic bytes; the client-sent content type is not trusted. */
export function imageExtension(data: Buffer): string | null {
  return IMAGE_TYPES.find((t) => t.matches(data))?.ext ?? null;
}

/** Stores a new photo under a random name and deletes the previous one. */
export async function replacePhoto(ctx: AppContext, personId: PersonId, data: Buffer, ext: string): Promise<void> {
  const file = `${randomUUID()}.${ext}`;
  await mkdir(avatarsDir(ctx), { recursive: true });
  await writeFile(path.join(avatarsDir(ctx), file), data);
  const previous = ctx.repos.persons.getPhotoFile(personId);
  if (!ctx.repos.persons.setPhotoFile(personId, file)) {
    await rm(path.join(avatarsDir(ctx), file), { force: true });
    return;
  }
  if (previous) await rm(path.join(avatarsDir(ctx), previous), { force: true });
}

export async function removePhoto(ctx: AppContext, personId: PersonId, knownFile?: string | null): Promise<void> {
  const file = knownFile === undefined ? ctx.repos.persons.getPhotoFile(personId) : knownFile;
  ctx.repos.persons.setPhotoFile(personId, null);
  if (file) await rm(path.join(avatarsDir(ctx), file), { force: true });
}

/** Photos are not secret (D27); names are random, so they can be cached forever. */
export async function avatarRoutes(app: FastifyInstance, ctx: AppContext): Promise<void> {
  app.get<{ Params: { file: string } }>(`${API_PATHS.avatars}/:file`, async (req, reply) => {
    const { file } = req.params;
    const type = IMAGE_TYPES.find((t) => file.endsWith(`.${t.ext}`));
    if (!FILE_PATTERN.test(file) || !type) return reply.code(404).send(apiError('NOT_FOUND'));
    const stream = createReadStream(path.join(avatarsDir(ctx), file));
    try {
      await new Promise<void>((resolve, reject) => {
        stream.once('open', () => resolve());
        stream.once('error', reject);
      });
    } catch {
      return reply.code(404).send(apiError('NOT_FOUND'));
    }
    return reply
      .header('content-type', type.mime)
      .header('cache-control', 'public, max-age=31536000, immutable')
      .header('x-content-type-options', 'nosniff')
      .send(stream);
  });
}
