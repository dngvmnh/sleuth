import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ProcessingJobSchema, type ProcessingJob } from "@sleuth/contracts";
import { statusAfterFailure, type JobQueue } from "./queue";

export const OUTPUT_FILE = "analysis-output.json";
export const STATE_FILE = "job-state.json";

/**
 * Fixture mode: the queue is one job file on disk (`job.json` in the fixture folder).
 * A job is done once its output file exists in `outDir`. State between runs lives in `outDir`.
 */
export function createFixtureQueue(fixtureDir: string, outDir: string): JobQueue {
  const jobPath = join(fixtureDir, "job.json");
  const statePath = join(outDir, STATE_FILE);
  mkdirSync(outDir, { recursive: true });

  const readState = (): ProcessingJob => {
    if (existsSync(statePath))
      return ProcessingJobSchema.parse(JSON.parse(readFileSync(statePath, "utf8")));
    return ProcessingJobSchema.parse(JSON.parse(readFileSync(jobPath, "utf8")));
  };
  const writeState = (job: ProcessingJob) =>
    writeFileSync(statePath, `${JSON.stringify(job, null, 2)}\n`);
  const now = () => new Date().toISOString();

  return {
    async claim(workerId) {
      const job = readState();
      if (job.status !== "queued") return null;
      const claimed: ProcessingJob = {
        ...job,
        status: "running",
        attempts: job.attempts + 1,
        lockedBy: workerId,
        heartbeatAt: now(),
        updatedAt: now(),
      };
      writeState(claimed);
      return claimed;
    },
    async heartbeat(_jobId, workerId) {
      const job = readState();
      if (job.lockedBy === workerId && job.status === "running") {
        writeState({ ...job, heartbeatAt: now(), updatedAt: now() });
      }
    },
    async complete(_jobId, workerId) {
      const job = readState();
      if (job.lockedBy === workerId) {
        writeState({ ...job, status: "succeeded", error: null, lockedBy: null, updatedAt: now() });
      }
    },
    async fail(_jobId, workerId, message) {
      const job = readState();
      const next = statusAfterFailure(job);
      if (job.lockedBy === workerId) {
        writeState({ ...job, status: next, error: message, lockedBy: null, updatedAt: now() });
      }
      return next;
    },
  };
}
