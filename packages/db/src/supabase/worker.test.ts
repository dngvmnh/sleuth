import type { EvidenceCandidate, ProcessingJob } from "@sleuth/contracts";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import * as t from "../schema";
import { createSupabaseStore, type SupabaseStore } from "./store";
import {
  deleteTestProjects,
  openTestDb,
  TEST_PROJECT_PREFIX,
  testDatabaseUrl,
  testUser,
} from "./test-support";
import { createWorkerStore, WorkerStoreError, type WorkerStore } from "./worker";

/**
 * Contract test for the worker's Supabase calls (evidence-analysis 12 inputs,
 * `docs/worker-supabase-contract.md`). The worker's queue is played by plain updates that do what
 * `pg-queue.ts` does on claim: status `running`, `locked_by` = the worker id.
 */

const url = testDatabaseUrl();
if (!url) console.warn("[worker store] TEST_DATABASE_URL is not set: the suite is skipped.");
const suite = url ? describe : describe.skip;
vi.setConfig({ testTimeout: 120_000, hookTimeout: 60_000 });

const owner = { userId: testUser("worker", 1) };
const W1 = "worker-test-1";
const W2 = "worker-test-2";

async function code(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (e) {
    if (e instanceof WorkerStoreError) return e.code;
    throw e;
  }
  return "allowed";
}

suite("worker store on Postgres (evidence-analysis 12 contract)", () => {
  let handle: ReturnType<typeof openTestDb>;
  let api: SupabaseStore;
  let worker: WorkerStore;

  beforeAll(async () => {
    // Queries run one at a time here: one client keeps the Free pooler's 15-client cap free.
    handle = openTestDb(1);
    await deleteTestProjects(handle.db, "worker");
    api = createSupabaseStore({ db: handle.db, dailyAnalysisLimit: 1000 });
    worker = createWorkerStore({ db: handle.db });
  }, 60_000);

  afterAll(async () => {
    await deleteTestProjects(handle.db, "worker");
    await handle.close();
  }, 60_000);

  /** A copy of the demo with a queued job, claimed by `workerId` the way pg-queue claims. */
  async function claimed(workerId: string, segmentIds?: string[]) {
    const p = await api.createProject(owner, {
      name: `${TEST_PROJECT_PREFIX}worker`,
      copyFromDemo: true,
    });
    const job = await api.startAnalysis(owner, p.id, segmentIds ? { segmentIds } : {});
    await handle.db
      .update(t.processingJobs)
      .set({ status: "running", lockedBy: workerId, attempts: 1 })
      .where(eq(t.processingJobs.id, job.id));
    return { projectId: p.id, job };
  }

  /** One fresh candidate per requested line, as a stand-in for the pipeline. */
  function produce(inputs: Awaited<ReturnType<WorkerStore["loadJobInputs"]>>) {
    const lines = inputs.script.segments.filter(
      (s) => inputs.segmentIds === null || inputs.segmentIds.includes(s.id),
    );
    const evidence: EvidenceCandidate[] = lines.map((s) => ({
      id: `ev-${s.id}-${inputs.asset.id}`,
      projectId: "ignored-the-store-sets-it",
      checklistItemId: null,
      scriptSegmentId: s.id,
      scriptVersionId: inputs.script.id,
      segmentHash: s.hash,
      assetVersionId: inputs.asset.id,
      startMs: 0,
      endMs: 1000,
      transcriptSegmentIds: [`${inputs.job.id}-tr`],
      frameObservationIds: [],
      explanation: "Stand-in for the pipeline. A person must confirm it.",
      confidence: "medium",
      status: "candidate",
      source: "ai",
      analysisRunId: inputs.job.id,
    }));
    return {
      evidence,
      findings: [],
      transcript: [
        {
          id: `${inputs.job.id}-tr`,
          projectId: "ignored",
          assetVersionId: "ignored",
          startMs: 0,
          endMs: 1000,
          text: "stand-in transcript",
          words: [],
        },
      ],
    };
  }

  it("loads the claimed job's inputs: current script in order, checklist, evidence, full run", async () => {
    const { projectId, job } = await claimed(W1);
    const inputs = await worker.loadJobInputs(job.id, W1);
    const detail = await api.getProjectDetail(owner, projectId);
    expect(inputs.projectId).toBe(projectId);
    expect(inputs.asset.id).toBe(detail.assetVersion?.id);
    expect(inputs.script.segments).toEqual(detail.scriptVersion?.segments);
    expect(inputs.checklist).toEqual(detail.checklist);
    expect(inputs.existingEvidence).toEqual(await api.listEvidence(owner, projectId));
    expect(inputs.segmentIds).toBeNull();
  });

  it("refuses a worker that does not hold the job, and a job that is not running", async () => {
    const { job } = await claimed(W1);
    expect(await code(worker.loadJobInputs(job.id, W2))).toBe("lease_lost");
    expect(await code(worker.writeJobResult(job.id, W2, { evidence: [], findings: [] }))).toBe(
      "lease_lost",
    );
    await handle.db
      .update(t.processingJobs)
      .set({ status: "queued", lockedBy: null })
      .where(eq(t.processingJobs.id, job.id));
    expect(await code(worker.loadJobInputs(job.id, W1))).toBe("lease_lost");
    expect(await code(worker.loadJobInputs("no-such-job", W1))).toBe("job_not_found");
  });

  it("refuses a job whose video or script was replaced after it was queued", async () => {
    const { projectId, job } = await claimed(W1);
    const inputs = await worker.loadJobInputs(job.id, W1);
    await api.createScript(owner, projectId, "A brand new script.\nWith other lines.");
    expect(await code(worker.loadJobInputs(job.id, W1))).toBe("superseded");
    expect(await code(worker.writeJobResult(job.id, W1, produce(inputs)))).toBe("superseded");
  });

  it("never writes to the public demo", async () => {
    const [demoJob] = await handle.db
      .select()
      .from(t.processingJobs)
      .where(eq(t.processingJobs.projectId, "proofpay-demo"));
    if (!demoJob) return;
    // Read-only: the demo's job is never claimed here, so the lease check refuses first.
    expect(["lease_lost", "demo_read_only"]).toContain(
      await code(worker.loadJobInputs(demoJob.id, W1)),
    );
  });

  it("writes the result in one go, keeps the job running for the queue, and is idempotent", async () => {
    const { projectId, job } = await claimed(W1);
    const inputs = await worker.loadJobInputs(job.id, W1);
    const result = produce(inputs);
    await worker.writeJobResult(job.id, W1, result);
    const after = await api.listEvidence(owner, projectId);
    for (const e of result.evidence) {
      const old = inputs.existingEvidence.find((x) => x.id === e.id);
      const stored = after.find((a) => a.id === e.id);
      if (old && old.status !== "candidate" && old.status !== "stale") {
        // A status set by a person (or by the outside-proof rule) on the same line text is kept.
        expect(stored).toEqual(old);
      } else {
        expect(stored).toMatchObject({ projectId, status: "candidate", analysisRunId: job.id });
      }
    }
    const [tr] = await handle.db
      .select()
      .from(t.transcriptSegments)
      .where(eq(t.transcriptSegments.id, `${job.id}-tr`));
    expect(tr).toMatchObject({ projectId, assetVersionId: inputs.asset.id });
    // The queue, not the store, finishes the job.
    expect((await api.getJob(owner, projectId, job.id)).status).toBe("running");
    // Same result again: nothing changes.
    await worker.writeJobResult(job.id, W1, result);
    expect(await api.listEvidence(owner, projectId)).toEqual(after);
  });

  it("on a targeted job writes only the planned lines and leaves the rest untouched", async () => {
    const p = await api.createProject(owner, {
      name: `${TEST_PROJECT_PREFIX}worker`,
      copyFromDemo: true,
    });
    const d = await api.getProjectDetail(owner, p.id);
    const first = d.scriptVersion?.segments[0];
    expect(first).toBeDefined();
    const edited = (d.scriptVersion?.segments ?? []).map((s) =>
      s.id === first?.id ? "An entirely different first line" : s.text,
    );
    const out = await api.createScript(owner, p.id, edited.join("\n"));
    const plan = out.reanalysisPlan ?? [];
    expect(plan.length).toBeGreaterThan(0);
    const job: ProcessingJob = await api.startAnalysis(owner, p.id, { segmentIds: plan });
    await handle.db
      .update(t.processingJobs)
      .set({ status: "running", lockedBy: W1, attempts: 1 })
      .where(eq(t.processingJobs.id, job.id));
    const before = await api.listEvidence(owner, p.id);
    const inputs = await worker.loadJobInputs(job.id, W1);
    expect(inputs.segmentIds).toEqual(plan);
    // The producer over-delivers: one candidate for every line. Only planned lines are kept.
    const everything = produce({ ...inputs, segmentIds: null });
    const { replacedEvidenceIds } = await worker.writeJobResult(job.id, W1, everything);
    const after = await api.listEvidence(owner, p.id);
    for (const e of before.filter((x) => !plan.includes(x.scriptSegmentId))) {
      expect(after.find((a) => a.id === e.id)).toEqual(e);
    }
    expect(replacedEvidenceIds).toEqual(out.staleEvidenceIds);
    const findings = await api.listFindings(owner, p.id);
    for (const id of replacedEvidenceIds) {
      expect(findings.find((f) => f.type === "poltergeist" && f.evidenceId === id)?.status).toBe(
        "resolved",
      );
    }
  });
});
