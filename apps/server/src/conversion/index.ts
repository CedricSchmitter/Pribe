import type { Config } from '../config';
import type { Repositories } from '../db';
import { createPptxQueue, resumeConversions } from './pptxQueue';
import type { ConversionQueue } from './queue';

export type { ConversionJob, ConversionOutcome, ConversionQueue, ConversionStatusEvent } from './queue';

/** PPTX metadata cleanup queue; picks up submissions left `converting` by a previous run (R4). */
export function createConversionQueue(
  config: Config,
  repos: Repositories,
  log: (message: string, details?: unknown) => void = (message, details) => console.warn(`[conversion] ${message}`, details ?? ''),
): ConversionQueue {
  const queue = createPptxQueue({ filesDir: config.filesDir, submissions: repos.submissions, log });
  resumeConversions(queue, repos.submissions, config.filesDir);
  return queue;
}
