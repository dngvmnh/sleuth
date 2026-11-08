import type { JobHandler } from "./handlers";
import { describeError, type JobQueue } from "./queue";

export interface LoopOptions {
  queue: JobQueue;
  handler: JobHandler;
  workerId: string;
  pollMs: number;
  heartbeatMs: number;
  /** Stop after the queue is empty once. */
  once: boolean;
  signal?: AbortSignal;
  log?: (event: string, fields?: Record<string, string | number>) => void;
}

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(t);
      resolve();
    });
  });

/** Claim, heartbeat while working, then complete or fail. Logs ids and counts only. */
export async function runLoop(o: LoopOptions): Promise<void> {
  const log = o.log ?? (() => undefined);
  let idleLogged = false;
  while (!o.signal?.aborted) {
    const job = await o.queue.claim(o.workerId);
    if (!job) {
      if (o.once) return;
      if (!idleLogged) log("idle", { workerId: o.workerId });
      idleLogged = true;
      await sleep(o.pollMs, o.signal);
      continue;
    }
    idleLogged = false;
    log("claimed", { jobId: job.id, attempt: job.attempts });
    const timer = setInterval(() => {
      o.queue.heartbeat(job.id, o.workerId).catch(() => log("heartbeat_failed", { jobId: job.id }));
    }, o.heartbeatMs);
    try {
      await o.handler(job);
      await o.queue.complete(job.id, o.workerId);
      log("succeeded", { jobId: job.id });
    } catch (err) {
      const status = await o.queue.fail(job.id, o.workerId, describeError(err));
      log(status === "queued" ? "retry_scheduled" : "failed", { jobId: job.id });
    } finally {
      clearInterval(timer);
    }
  }
}
