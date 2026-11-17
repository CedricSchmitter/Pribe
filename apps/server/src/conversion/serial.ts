import type { SubmissionsRepo } from '../db/repos/submissions';
import type { ConversionJob, ConversionOutcome, ConversionQueue, ConversionStatusEvent } from './queue';

export const GENERIC_FAILURE = 'Umwandlung fehlgeschlagen';

/**
 * Runs `convert` for one job at a time and records its outcome. `convert` returns null
 * when the submission vanished (replaced or reset) while waiting; nothing is recorded then.
 */
export function createSerialQueue(
  submissions: SubmissionsRepo,
  convert: (job: ConversionJob) => Promise<ConversionOutcome | null>,
  onError: (job: ConversionJob, err: unknown) => void = () => {},
): ConversionQueue {
  let chain: Promise<unknown> = Promise.resolve();
  let size = 0;
  const listeners = new Set<(event: ConversionStatusEvent) => void>();

  const record = (job: ConversionJob, outcome: ConversionOutcome): ConversionOutcome => {
    const updated =
      outcome.status === 'ready'
        ? submissions.updateStatus(job.submissionId, { status: 'ready', filePath: outcome.filePath, error: null })
        : submissions.updateStatus(job.submissionId, { status: 'failed', filePath: null, error: outcome.error });
    if (updated) {
      const event: ConversionStatusEvent = {
        submissionId: job.submissionId,
        status: outcome.status,
        error: outcome.status === 'failed' ? outcome.error : null,
      };
      for (const l of listeners) {
        try {
          l(event);
        } catch (err) {
          onError(job, err);
        }
      }
    }
    return outcome;
  };

  const run = async (job: ConversionJob): Promise<ConversionOutcome> => {
    let outcome: ConversionOutcome | null;
    try {
      outcome = await convert(job);
    } catch (err) {
      onError(job, err);
      outcome = { status: 'failed', error: GENERIC_FAILURE };
    }
    if (!outcome) return { status: 'failed', error: 'Einreichung existiert nicht mehr' };
    return record(job, outcome);
  };

  return {
    enqueue(job) {
      size++;
      const result = chain.then(() => run(job));
      chain = result.finally(() => size--);
      return result;
    },
    onStatusChange(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    get size() {
      return size;
    },
    async close() {
      await chain;
    },
  };
}
