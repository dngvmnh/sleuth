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

/** Short, content-free error text for the job row. */
export function describeError(err: unknown): string {
  const text = err instanceof Error ? `${err.name}: ${err.message}` : "Unknown error";
  return text.slice(0, 300);
}
