import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { ProcessingJob } from "@sleuth/contracts";
import { loadGoldenFixture } from "@sleuth/db/fixture";
import { loadConfig } from "./config";
import { createFixtureQueue, OUTPUT_FILE } from "./fixture-queue";
import { createFixtureHandler } from "./handlers";
import { runLoop } from "./loop";
import { statusAfterFailure, type JobQueue } from "./queue";

const fixtureDir = join(__dirname, "..", "..", "..", "fixtures", "golden", "proofpay-demo");
const dirs: string[] = [];
const tmp = () => {
  const d = mkdtempSync(join(tmpdir(), "sleuth-worker-"));
  dirs.push(d);
  return d;
};
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

const loopBase = { workerId: "w1", pollMs: 5, heartbeatMs: 1000, once: true } as const;

describe("statusAfterFailure", () => {
  it("queues again while attempts remain", () => {
    expect(statusAfterFailure({ attempts: 1, maxAttempts: 3 })).toBe("queued");
  });
  it("fails once attempts are used up", () => {
    expect(statusAfterFailure({ attempts: 3, maxAttempts: 3 })).toBe("failed");
  });
});

describe("loadConfig", () => {
  it("defaults to fixture mode and treats blank values as unset", () => {
    const c = loadConfig({ SLEUTH_DATA_MODE: "", DATABASE_URL: "", MAX_FRAMES_PER_VIDEO: "" });
    expect(c.SLEUTH_DATA_MODE).toBe("fixture");
    expect(c.MAX_FRAMES_PER_VIDEO).toBe(60);
  });
  it("requires a database URL in supabase mode", () => {
    expect(() => loadConfig({ SLEUTH_DATA_MODE: "supabase" })).toThrow();
  });
});

describe("fixture mode worker", () => {
  it("claims the fixture job, runs the mock pipeline and writes the expected output", async () => {
    const out = tmp();
    const queue = createFixtureQueue(fixtureDir, out);
    await runLoop({
      ...loopBase,
      queue,
      handler: createFixtureHandler({ outDir: out, maxFrames: 60, maxVideoSeconds: 180 }),
    });
    const written = JSON.parse(readFileSync(join(out, OUTPUT_FILE), "utf8")) as {
      evidence: unknown;
      findings: unknown;
    };
    const fx = loadGoldenFixture();
    expect(written.evidence).toEqual(
      fx.expectedEvidence.map((e) => ({ ...e, analysisRunId: "run-job-demo-1" })),
    );
    expect(written.findings).toEqual(
      fx.expectedFindings.map((f) => ({ ...f, analysisRunId: "run-job-demo-1" })),
    );
    // Nothing left to claim afterwards.
    expect(await queue.claim("w2")).toBeNull();
  });

  it("does not hand the same job to a second worker while it is running", async () => {
    const queue = createFixtureQueue(fixtureDir, tmp());
    expect(await queue.claim("w1")).not.toBeNull();
    expect(await queue.claim("w2")).toBeNull();
  });
});

describe("retry", () => {
  function memoryQueue(job: ProcessingJob) {
    let state = job;
    const queue: JobQueue = {
      async claim(workerId) {
        if (state.status !== "queued" || state.attempts >= state.maxAttempts) return null;
        state = { ...state, status: "running", attempts: state.attempts + 1, lockedBy: workerId };
        return state;
      },
      async heartbeat() {},
      async complete() {
        state = { ...state, status: "succeeded" };
      },
      async fail(_id, _w, message) {
        const next = statusAfterFailure(state);
        state = { ...state, status: next, error: message, lockedBy: null };
        return next;
      },
    };
    return { queue, get: () => state };
  }

  it("retries a failing job up to maxAttempts, then marks it failed", async () => {
    const m = memoryQueue({ ...loadGoldenFixture().job, maxAttempts: 2 });
    let calls = 0;
    const handler = async () => {
      calls += 1;
      throw new Error("boom");
    };
    // `once` stops when the queue is empty, so drain by looping.
    for (let i = 0; i < 4; i++) await runLoop({ ...loopBase, queue: m.queue, handler });
    expect(calls).toBe(2);
    expect(m.get().status).toBe("failed");
    expect(m.get().error).toContain("boom");
  });

  it("succeeds on a later attempt", async () => {
    const m = memoryQueue(loadGoldenFixture().job);
    let calls = 0;
    const handler = async () => {
      calls += 1;
      if (calls === 1) throw new Error("flaky");
    };
    for (let i = 0; i < 3; i++) await runLoop({ ...loopBase, queue: m.queue, handler });
    expect(m.get().status).toBe("succeeded");
    expect(m.get().attempts).toBe(2);
  });
});
