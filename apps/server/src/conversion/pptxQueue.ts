import { readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { SubmissionsRepo } from '../db/repos/submissions';
import type { ConversionJob, ConversionOutcome, ConversionQueue } from './queue';
import { sanitizePptx } from './sanitizePptx';
import { createSerialQueue } from './serial';

export const BROKEN_FILE = 'Datei ist keine gültige PowerPoint-Datei';

export interface PptxQueueOptions {
  filesDir: string;
  submissions: SubmissionsRepo;
  /** Diagnostics only; must not receive anything that names a person. */
  log?: (message: string, details?: unknown) => void;
}

/** Clears the PPTX metadata in place, one file at a time (the Pi has little memory for 100 MB ZIPs). */
export function createPptxQueue(opts: PptxQueueOptions): ConversionQueue {
  const log = opts.log ?? (() => {});

  const convert = async (job: ConversionJob): Promise<ConversionOutcome | null> => {
    const current = opts.submissions.get(job.submissionId);
    if (!current || current.status !== 'converting') return null;

    let outcome: ConversionOutcome;
    try {
      const clean = sanitizePptx(await readFile(job.inputPath));
      await writeFile(`${job.inputPath}.tmp`, clean);
      await rename(`${job.inputPath}.tmp`, job.inputPath);
      outcome = { status: 'ready', filePath: path.relative(opts.filesDir, job.inputPath).split(path.sep).join('/') };
    } catch (err) {
      log('pptx cleanup failed', { submissionId: job.submissionId, error: err instanceof Error ? err.message : String(err) });
      await rm(`${job.inputPath}.tmp`, { force: true });
      // An unreadable file still carries its original metadata, so it does not stay on disk.
      await rm(job.inputPath, { force: true });
      outcome = { status: 'failed', error: BROKEN_FILE };
    }

    if (!opts.submissions.get(job.submissionId)) return null;
    return outcome;
  };

  return createSerialQueue(opts.submissions, convert, (job, err) =>
    log('pptx cleanup crashed', { submissionId: job.submissionId, error: err instanceof Error ? err.message : String(err) }),
  );
}

/** Re-enqueues submissions still `converting`, e.g. after a restart (R4). */
export function resumeConversions(queue: ConversionQueue, submissions: SubmissionsRepo, filesDir: string): number {
  const pending = submissions.listConverting();
  for (const s of pending) {
    if (!s.filePath) {
      submissions.updateStatus(s.id, { status: 'failed', error: BROKEN_FILE });
      continue;
    }
    void queue.enqueue({ submissionId: s.id, inputPath: path.join(filesDir, s.filePath) });
  }
  return pending.length;
}
