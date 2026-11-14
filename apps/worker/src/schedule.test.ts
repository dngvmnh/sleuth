import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadConfig } from "./config";
import { runLoop } from "./loop";
import type { JobQueue } from "./queue";

const workflow = readFileSync(
  join(__dirname, "..", "..", "..", ".github", "workflows", "worker.yml"),
  "utf8",
);
const active = workflow.split("\n").filter((l) => !l.trimStart().startsWith("#"));

describe("worker workflow schedule (ADR 0009)", () => {
  it("has an active schedule every 10 minutes", () => {
    expect(active.some((l) => /^\s*schedule:\s*$/.test(l))).toBe(true);
    expect(active.some((l) => /cron:\s*"\*\/10 \* \* \* \*"/.test(l))).toBe(true);
  });

  it("never runs two workers at once", () => {
    expect(workflow).toMatch(/concurrency:\s*\n\s*group: worker\s*\n\s*cancel-in-progress: false/);
  });

  it("takes jobs once and stops", () => {
    expect(workflow).toContain("pnpm worker -- --once");
  });
});

describe("run budget of a --once run", () => {
  const busyQueue = (claimed: string[]) =>
    ({
      claim: async () => {
        const id = `job-${claimed.length + 1}`;
        claimed.push(id);
        return { id, attempts: 1 };
      },
      heartbeat: async () => undefined,
      complete: async () => undefined,
      fail: async () => "failed",
    }) as unknown as JobQueue;

  it("takes no new job once the budget is used, and finishes the job it started", async () => {
    let clock = 0;
    const claimed: string[] = [];
    const finished: string[] = [];
    const events: string[] = [];
    await runLoop({
      queue: busyQueue(claimed),
      handler: async (job) => {
        clock += 5 * 60_000; // every job takes 5 minutes
        finished.push(job.id);
      },
      workerId: "w1",
      pollMs: 5,
      heartbeatMs: 60_000,
      once: true,
      onceBudgetMs: 12 * 60_000,
      now: () => clock,
      log: (e) => events.push(e),
    });
    // Starts at 0, 5 and 10 minutes; at 15 minutes the budget is used.
    expect(claimed).toEqual(["job-1", "job-2", "job-3"]);
    expect(finished).toEqual(claimed);
    expect(events.at(-1)).toBe("run_budget_reached");
  });

  it("defaults to 12 minutes, under the workflow's 20-minute limit", () => {
    expect(loadConfig({}).WORKER_ONCE_BUDGET_MS).toBe(720_000);
    expect(workflow).toMatch(/timeout-minutes: 20/);
  });
});

describe("empty queue", () => {
  it("makes one claim and returns when --once is set", async () => {
    let claims = 0;
    const queue = {
      claim: async () => {
        claims += 1;
        return null;
      },
      heartbeat: async () => undefined,
      complete: async () => undefined,
      fail: async () => "failed",
    } as unknown as JobQueue;
    await runLoop({
      queue,
      handler: async () => undefined,
      workerId: "w1",
      pollMs: 5,
      heartbeatMs: 1000,
      once: true,
    });
    expect(claims).toBe(1);
  });
});
