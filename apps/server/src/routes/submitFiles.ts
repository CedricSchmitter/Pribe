import { rm } from 'node:fs/promises';
import path from 'node:path';
import type { EpochMs } from '@pribe/shared';
import type { AppContext } from '../context';
import type { SubmissionRecord } from '../db';

/** Uploads close with the deadline, at the latest when the game leaves the lobby (D16). */
export function uploadsOpen(ctx: AppContext, now: EpochMs = Date.now()): boolean {
  if (ctx.repos.game.get().phase !== 'lobby') return false;
  const { submissionDeadline } = ctx.repos.settings.get();
  return submissionDeadline === null || now < submissionDeadline;
}

/** Every file a submission may own: the stored path plus all names derived from its id. */
export async function deleteSubmissionFiles(ctx: AppContext, sub: Pick<SubmissionRecord, 'id' | 'filePath'>) {
  const names = new Set([`${sub.id}.html`, `${sub.id}.pptx`, `${sub.id}.pptx.tmp`]);
  if (sub.filePath) names.add(sub.filePath);
  await Promise.all([...names].map((n) => rm(path.join(ctx.config.filesDir, n), { force: true })));
}
