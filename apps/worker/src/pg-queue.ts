import type { ProcessingJob } from "@sleuth/contracts";
import postgres from "postgres";
import { statusAfterFailure, type JobQueue } from "./queue";

interface JobRow {
  id: string;
  project_id: string;
  kind: ProcessingJob["kind"];
  status: ProcessingJob["status"];
  attempts: number;
  max_attempts: number;
  locked_by: string | null;
  heartbeat_at: Date | string | null;
  error: string | null;
  payload: ProcessingJob["payload"];
  created_at: Date | string;
  updated_at: Date | string;
}

const iso = (v: Date | string) => new Date(v).toISOString();

function toJob(r: JobRow): ProcessingJob {
  return {
    id: r.id,
    projectId: r.project_id,
    kind: r.kind,
    status: r.status,
    attempts: r.attempts,
    maxAttempts: r.max_attempts,
    lockedBy: r.locked_by,
    heartbeatAt: r.heartbeat_at ? iso(r.heartbeat_at) : null,
    error: r.error,
    payload: r.payload,
    createdAt: iso(r.created_at),
    updatedAt: iso(r.updated_at),
  };
}

/**
 * Postgres queue. `claim` uses SELECT ... FOR UPDATE SKIP LOCKED, so two workers never take the
 * same job. Uses the service connection (DATABASE_URL), which bypasses Row Level Security.
 */
export function createPgQueue(databaseUrl: string, staleSeconds: number) {
  const sql = postgres(databaseUrl, { max: 2 });

  const queue: JobQueue = {
    async claim(workerId) {
      return sql.begin(async (tx) => {
        // A running job that stopped heartbeating and has no attempts left is dead.
        await tx`
          update processing_jobs
          set status = 'failed', error = 'Worker stopped sending heartbeats.', locked_by = null, updated_at = now()
          where status = 'running'
            and heartbeat_at < now() - make_interval(secs => ${staleSeconds})
            and attempts >= max_attempts`;
        const rows = await tx<JobRow[]>`
          update processing_jobs
          set status = 'running', attempts = attempts + 1, locked_by = ${workerId},
              heartbeat_at = now(), updated_at = now()
          where id = (
            select id from processing_jobs
            where attempts < max_attempts
              and (status = 'queued'
                   or (status = 'running' and heartbeat_at < now() - make_interval(secs => ${staleSeconds})))
            order by created_at
            for update skip locked
            limit 1)
          returning *`;
        const row = rows[0];
        return row ? toJob(row) : null;
      });
    },

    async heartbeat(jobId, workerId) {
      await sql`
        update processing_jobs set heartbeat_at = now(), updated_at = now()
        where id = ${jobId} and locked_by = ${workerId} and status = 'running'`;
    },

    async complete(jobId, workerId) {
      await sql`
        update processing_jobs
        set status = 'succeeded', error = null, locked_by = null, updated_at = now()
        where id = ${jobId} and locked_by = ${workerId}`;
    },

    async fail(jobId, workerId, message) {
      const rows = await sql<JobRow[]>`
        select * from processing_jobs where id = ${jobId} and locked_by = ${workerId}`;
      const row = rows[0];
      if (!row) return "failed";
      const next = statusAfterFailure({ attempts: row.attempts, maxAttempts: row.max_attempts });
      await sql`
        update processing_jobs
        set status = ${next}, error = ${message}, locked_by = null, updated_at = now()
        where id = ${jobId} and locked_by = ${workerId}`;
      return next;
    },
  };

  return { queue, close: () => sql.end() };
}
