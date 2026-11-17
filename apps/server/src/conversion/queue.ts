import type { SubmissionId, SubmissionStatus } from '@pribe/shared';

export interface ConversionJob {
  submissionId: SubmissionId;
  /** Absolute path of the uploaded PPTX inside `filesDir`. */
  inputPath: string;
}

export type ConversionOutcome = { status: 'ready'; filePath: string } | { status: 'failed'; error: string };

/** Emitted after the queue has written the new status to the database. */
export interface ConversionStatusEvent {
  submissionId: SubmissionId;
  status: Extract<SubmissionStatus, 'ready' | 'failed'>;
  error: string | null;
}

/**
 * PPTX metadata cleanup, one job at a time (R30, D23). The caller (upload route) stores the
 * PPTX and creates the submission with kind `pptx`, status `converting` and `filePath` =
 * the PPTX relative to `filesDir` (needed to resume after a restart, R4), then calls
 * `enqueue`. The queue owns everything after that: clearing the author metadata in place
 * (R31) and setting the submission to `ready` (same `filePath`) or `failed` (file deleted).
 * The returned promise settles when that is done and never rejects.
 */
export interface ConversionQueue {
  enqueue(job: ConversionJob): Promise<ConversionOutcome>;
  /** Called after every `ready`/`failed` update; returns an unsubscribe function. */
  onStatusChange(listener: (event: ConversionStatusEvent) => void): () => void;
  /** Waiting plus running jobs. */
  readonly size: number;
  close(): Promise<void>;
}
