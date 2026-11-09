import { randomBytes } from "node:crypto";
import { testDatabaseUrl } from "@sleuth/db/testing";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createPgQueue } from "./pg-queue";

/**
 * The queue's claim SQL against a real Postgres (evidence-analysis 16, requirement 8.3).
 *
 * The suite works in a private schema made for this run. The queue connects with that schema first
 * on its search path, so it reads and writes a copy of `processing_jobs` and can never claim a job
 * that another test (or the seeded demo) owns. The schema is dropped at the end.
 */

const url = testDatabaseUrl();
if (!url) console.warn("[pg-queue] TEST_DATABASE_URL is not set: the suite is skipped.");
const suite = url ? describe : describe.skip;
vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

const STALE_SECONDS = 60;
const SCHEMA = `queue_test_${randomBytes(4).toString("hex")}`;

interface Seed {
  id: string;
  status?: "queued" | "running" | "succeeded" | "failed";
  attempts?: number;
  maxAttempts?: number;
  lockedBy?: string | null;
  /** Seconds in the past. Null leaves the heartbeat empty. */
  heartbeatAgo?: number | null;
  /** Seconds in the past, so the order of creation is explicit. */
  createdAgo?: number;
}

suite("pg-queue claim on Postgres (evidence-analysis 16)", () => {
  let admin: postgres.Sql;
  let queueUrl = "";
  const open: { close: () => Promise<unknown> }[] = [];

  const newQueue = (stale = STALE_SECONDS) => {
    const made = createPgQueue(queueUrl, stale);
    open.push(made);
    return made.queue;
  };

  async function seed(job: Seed): Promise<void> {
    await admin.unsafe(
      `insert into ${SCHEMA}.processing_jobs
         (id, project_id, kind, status, attempts, max_attempts, locked_by, heartbeat_at, payload, created_at)
       values ($1, $2, 'analysis', $3, $4, $5, $6,
         case when $7::int is null then null else now() - make_interval(secs => $7::int) end,
         $8::jsonb, now() - make_interval(secs => $9::int))`,
      [
        job.id,
        `${SCHEMA}-project`,
        job.status ?? "queued",
        job.attempts ?? 0,
        job.maxAttempts ?? 3,
        job.lockedBy ?? null,
        job.heartbeatAgo ?? null,
        JSON.stringify({ assetVersionId: "av", scriptVersionId: "sv" }),
        job.createdAgo ?? 0,
      ],
    );
  }

  const row = async (id: string) => {
    const rows = await admin.unsafe(
      `select status, attempts, locked_by, error, heartbeat_at, updated_at
       from ${SCHEMA}.processing_jobs where id = $1`,
      [id],
    );
    return rows[0] as
      | {
          status: string;
          attempts: number;
          locked_by: string | null;
          error: string | null;
          heartbeat_at: Date | null;
          updated_at: Date;
        }
      | undefined;
  };

  beforeAll(async () => {
    admin = postgres(url as string, { max: 2 });
    await admin.unsafe(`create schema ${SCHEMA}`);
    // Same columns, defaults, checks and indexes as the real table; no foreign keys, so no project is needed.
    await admin.unsafe(
      `create table ${SCHEMA}.processing_jobs (like public.processing_jobs including all)`,
    );
    const withPath = new URL(url as string);
    withPath.searchParams.set("search_path", SCHEMA);
    queueUrl = withPath.toString();
    // Stop before any claim if the setting did not reach the server: a claim on the real table
    // would take jobs that belong to someone else.
    const probe = postgres(queueUrl, { max: 1 });
    try {
      const [shown] = await probe`show search_path`;
      if (!String(shown?.search_path).startsWith(SCHEMA))
        throw new Error(
          "search_path did not reach the server; refusing to run against public tables.",
        );
    } finally {
      await probe.end({ timeout: 5 });
    }
  });

  afterAll(async () => {
    await Promise.all(open.map((q) => q.close()));
    await admin.unsafe(`drop schema if exists ${SCHEMA} cascade`);
    await admin.end({ timeout: 5 });
  });

  async function reset(): Promise<void> {
    await admin.unsafe(`delete from ${SCHEMA}.processing_jobs`);
  }

  it("hands one queued job to only one of two workers that ask at the same time", async () => {
    await reset();
    await seed({ id: "only-one" });
    const [a, b] = await Promise.all([newQueue().claim("w1"), newQueue().claim("w2")]);
    expect([a, b].filter((j) => j !== null)).toHaveLength(1);
    const winner = a ?? b;
    expect(winner?.id).toBe("only-one");
    const stored = await row("only-one");
    expect(stored?.status).toBe("running");
    expect(stored?.attempts).toBe(1);
    expect(stored?.locked_by).toBe(winner?.lockedBy);
    expect(["w1", "w2"]).toContain(stored?.locked_by);
  });

  it("gives every queued job to exactly one of many workers", async () => {
    await reset();
    for (let i = 0; i < 5; i += 1) await seed({ id: `job-${i}`, createdAgo: 100 - i });
    const queues = Array.from({ length: 4 }, () => newQueue());
    const claims = await Promise.all(
      Array.from({ length: 12 }, (_, i) => queues[i % queues.length]?.claim(`w${i}`)),
    );
    const got = claims.filter((j) => j !== null && j !== undefined).map((j) => j.id);
    expect(got).toHaveLength(5);
    expect(new Set(got).size).toBe(5);
  });

  it("claims the oldest queued job first", async () => {
    await reset();
    await seed({ id: "newer", createdAgo: 10 });
    await seed({ id: "older", createdAgo: 500 });
    const first = await newQueue().claim("w1");
    expect(first?.id).toBe("older");
  });

  it("returns nothing when the queue is empty", async () => {
    await reset();
    expect(await newQueue().claim("w1")).toBeNull();
  });

  it("claims a running job again when its heartbeat is older than the stale window", async () => {
    await reset();
    await seed({
      id: "stale",
      status: "running",
      attempts: 1,
      lockedBy: "dead-worker",
      heartbeatAgo: STALE_SECONDS * 3,
    });
    const job = await newQueue().claim("w2");
    expect(job?.id).toBe("stale");
    expect(job?.attempts).toBe(2);
    expect(job?.lockedBy).toBe("w2");
  });

  it("leaves a running job alone while its heartbeat is fresh", async () => {
    await reset();
    await seed({ id: "alive", status: "running", attempts: 1, lockedBy: "w1", heartbeatAgo: 5 });
    expect(await newQueue().claim("w2")).toBeNull();
    expect((await row("alive"))?.locked_by).toBe("w1");
  });

  it("marks a stale job with no attempts left as failed and does not hand it out", async () => {
    await reset();
    await seed({
      id: "dead",
      status: "running",
      attempts: 3,
      maxAttempts: 3,
      lockedBy: "dead-worker",
      heartbeatAgo: STALE_SECONDS * 3,
    });
    expect(await newQueue().claim("w2")).toBeNull();
    const stored = await row("dead");
    expect(stored?.status).toBe("failed");
    expect(stored?.locked_by).toBeNull();
    expect(stored?.error).toBe("Worker stopped sending heartbeats.");
  });

  it("does not claim a queued job that has used all its attempts", async () => {
    await reset();
    await seed({ id: "spent", status: "queued", attempts: 3, maxAttempts: 3 });
    expect(await newQueue().claim("w1")).toBeNull();
  });

  it("does not claim jobs that already succeeded or failed", async () => {
    await reset();
    await seed({ id: "done", status: "succeeded", attempts: 1 });
    await seed({ id: "broken", status: "failed", attempts: 3 });
    expect(await newQueue().claim("w1")).toBeNull();
  });

  it("moves the heartbeat forward when the worker sends one", async () => {
    await reset();
    await seed({ id: "beat" });
    const queue = newQueue();
    const claimed = await queue.claim("w1");
    expect(claimed?.heartbeatAt).not.toBeNull();
    // Age the heartbeat, then send one.
    await admin.unsafe(
      `update ${SCHEMA}.processing_jobs set heartbeat_at = now() - interval '30 seconds' where id = 'beat'`,
    );
    const before = (await row("beat"))?.heartbeat_at?.getTime() ?? 0;
    await queue.heartbeat("beat", "w1");
    const after = (await row("beat"))?.heartbeat_at?.getTime() ?? 0;
    expect(after).toBeGreaterThan(before);
  });

  it("ignores a completion or a failure from a worker that does not hold the job", async () => {
    await reset();
    await seed({ id: "mine" });
    const queue = newQueue();
    await queue.claim("w1");
    await queue.complete("mine", "intruder");
    expect(await queue.fail("mine", "intruder", "nope")).toBe("failed");
    const stored = await row("mine");
    expect(stored?.status).toBe("running");
    expect(stored?.locked_by).toBe("w1");
    expect(stored?.error).toBeNull();
  });

  it("completes a job it holds", async () => {
    await reset();
    await seed({ id: "finish" });
    const queue = newQueue();
    await queue.claim("w1");
    await queue.complete("finish", "w1");
    const stored = await row("finish");
    expect(stored?.status).toBe("succeeded");
    expect(stored?.locked_by).toBeNull();
  });

  it("queues a failed job again until its attempts run out, then fails it", async () => {
    await reset();
    await seed({ id: "retry", maxAttempts: 2 });
    const queue = newQueue();
    expect((await queue.claim("w1"))?.attempts).toBe(1);
    expect(await queue.fail("retry", "w1", "first problem")).toBe("queued");
    expect((await row("retry"))?.status).toBe("queued");
    expect((await queue.claim("w1"))?.attempts).toBe(2);
    expect(await queue.fail("retry", "w1", "second problem")).toBe("failed");
    const stored = await row("retry");
    expect(stored?.status).toBe("failed");
    expect(stored?.error).toBe("second problem");
    expect(await queue.claim("w1")).toBeNull();
  });
});
