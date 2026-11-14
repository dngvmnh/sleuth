import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { runLoop } from "./loop";
import type { JobQueue } from "./queue";

const workflow = readFileSync(join(__dirname, "..", "..", "..", ".github", "workflows", "worker.yml"), "utf8");
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
