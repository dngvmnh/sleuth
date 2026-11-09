import type { ProcessingJob } from "@sleuth/contracts";

/**
 * A job queue with claim, heartbeat, retry and status updates.
 * Implementations: Postgres (supabase mode) and files on disk (fixture mode).
 */
export interface JobQueue {
  /** Take the next runnable job, or null when there is none. Never hands one job to two workers. */
  claim(workerId: string): Promise<ProcessingJob | null>;
  /** Prove the worker is alive. A job whose heartbeat goes stale can be claimed again. */
  heartbeat(jobId: string, workerId: string): Promise<void>;
  complete(jobId: string, workerId: string): Promise<void>;
  /** Record a failure. The job is queued again until `maxAttempts` is reached, then it is failed. */
  fail(jobId: string, workerId: string, message: string): Promise<ProcessingJob["status"]>;
}

/** What a failure leads to. `attempts` already counts the run that just failed. */
export function statusAfterFailure(
  job: Pick<ProcessingJob, "attempts" | "maxAttempts">,
): "queued" | "failed" {
  return job.attempts >= job.maxAttempts ? "failed" : "queued";
}

/**
 * A failure whose message is already safe to store on the job row: `step: code`, with no paths,
 * text or URLs. `MediaError` (packages/media) follows the same shape.
 */
export class JobFailure extends Error {
  constructor(
    public readonly step: string,
    public readonly code: string,
  ) {
    super(`${step}: ${code}`);
    this.name = "JobFailure";
  }
}

/** Short, content-free error text for the job row. */
export function describeError(err: unknown): string {
  if (
    err instanceof JobFailure ||
    (err instanceof Error && (err.name === "MediaError" || err.name === "ProviderError"))
  )
    return err.message.slice(0, 300);
  const text = err instanceof Error ? `${err.name}: ${err.message}` : "Unknown error";
  return text.slice(0, 300);
}
