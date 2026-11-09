import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import * as t from "../schema";
import { StoreError, type Actor, type ProjectStore } from "../store";
import { createSupabaseStore } from "./store";
import {
  deleteTestProjects,
  openTestDb,
  TEST_PROJECT_PREFIX,
  testDatabaseUrl,
  testUser,
} from "./test-support";

const url = testDatabaseUrl();
if (!url) {
  console.warn("[supabase store] TEST_DATABASE_URL is not set: the write-side suite is skipped.");
}
const suite = url ? describe : describe.skip;
vi.setConfig({ testTimeout: 300_000, hookTimeout: 60_000 });

const alice: Actor = { userId: testUser("write", 1) };
const bob: Actor = { userId: testUser("write", 2) };

async function refused(p: Promise<unknown>): Promise<StoreError> {
  try {
    await p;
  } catch (e) {
    if (e instanceof StoreError) return e;
    throw e;
  }
  throw new Error("expected the store to refuse this call");
}

suite("SupabaseStore (write side) on Postgres", () => {
  let handle: ReturnType<typeof openTestDb>;
  let store: ProjectStore;
  let clock = new Date("2026-11-08T10:00:00.000Z");

  beforeAll(async () => {
    handle = openTestDb();
    await deleteTestProjects(handle.db, "write");
    store = createSupabaseStore({
      db: handle.db,
      now: () => clock,
      dailyAnalysisLimit: 2,
    });
  }, 60_000);

  afterAll(async () => {
    await deleteTestProjects(handle.db, "write");
    await handle.close();
  }, 60_000);

  const name = (n: string) => `${TEST_PROJECT_PREFIX}${n}`;

  async function ready(owner: Actor, script = "First step here.\nSecond step here.") {
    const p = await store.createProject(owner, { name: name("ready") });
    await store.createUploadUrl(owner, p.id, {
      fileName: "a.mp4",
      mimeType: "video/mp4",
      durationMs: 30_000,
    });
    await store.createScript(owner, p.id, script);
    return p;
  }

  it("has the partial unique indexes in the database", async () => {
    const rows = await handle.db.execute<{ indexname: string; indexdef: string }>(
      sql`select indexname, indexdef from pg_indexes where schemaname = 'public' and indexname in ('jobs_one_active_per_request', 'seals_one_active_per_project')`,
    );
    const defs = Object.fromEntries([...rows].map((r) => [r.indexname, r.indexdef]));
    expect(defs.jobs_one_active_per_request).toMatch(
      /UNIQUE.*\(project_id, request_key\).*queued.*running/s,
    );
    expect(defs.seals_one_active_per_project).toMatch(/UNIQUE.*\(project_id\).*active/s);
  });

  it("refuses a second active job for the same request even when written around the store [4.3]", async () => {
    const p = await ready(alice);
    const job = await store.startAnalysis(alice, p.id, {});
    const attempt = handle.db.insert(t.processingJobs).values({
      id: `${p.id}-dup`,
      projectId: p.id,
      kind: "analysis",
      status: "queued",
      requestKey: (
        await handle.db.select().from(t.processingJobs).where(eq(t.processingJobs.id, job.id))
      )[0]?.requestKey,
      payload: job.payload,
    });
    await expect(attempt).rejects.toMatchObject({ cause: { code: "23505" } });
  });

  it("hands every concurrent identical request the same job and counts one request", async () => {
    clock = new Date("2026-11-08T10:00:00.000Z");
    const p = await ready(bob);
    const jobs = await Promise.all(
      Array.from({ length: 6 }, () => store.startAnalysis(bob, p.id, {})),
    );
    expect(new Set(jobs.map((j) => j.id)).size).toBe(1);
    const events = await store.listAuditEvents(bob, p.id);
    expect(events.filter((e) => e.type === "analysis_requested")).toHaveLength(1);
  });

  it("refuses the request over the daily limit and accepts it again the next UTC day [5.2]", async () => {
    clock = new Date("2026-11-09T23:00:00.000Z");
    const p = await ready(alice);
    await store.startAnalysis(alice, p.id, {});
    await store.createScript(alice, p.id, "First step here.\nSecond step changed.");
    await store.startAnalysis(alice, p.id, {});
    await store.createScript(alice, p.id, "First step here.\nSecond step changed again.");
    const err = await refused(store.startAnalysis(alice, p.id, {}));
    expect(err.status).toBe(429);
    expect(err.code).toBe("limit_exceeded");
    expect(err.details).toMatchObject({ resetsAt: "2026-11-10T00:00:00.000Z", limit: 2 });
    clock = new Date("2026-11-10T00:00:01.000Z");
    expect((await store.startAnalysis(alice, p.id, {})).status).toBe("queued");
  });

  it("serialises requests from one user across projects so two tabs cannot beat the limit", async () => {
    clock = new Date("2026-11-11T09:00:00.000Z");
    const projects = await Promise.all(Array.from({ length: 4 }, () => ready(alice)));
    const results = await Promise.allSettled(
      projects.map((p) => store.startAnalysis(alice, p.id, {})),
    );
    const ok = results.filter((r) => r.status === "fulfilled").length;
    expect(ok).toBe(2);
    expect(
      results
        .filter((r) => r.status === "rejected")
        .every((r) => r.reason instanceof StoreError && r.reason.status === 429),
    ).toBe(true);
  });

  it("marks evidence stale when a line changes, opens a Poltergeist and writes ids-only audit events", async () => {
    const p = await store.createProject(alice, { name: name("copy"), copyFromDemo: true });
    const before = await store.listEvidence(alice, p.id);
    const detail = await store.getProjectDetail(alice, p.id);
    const changed = (detail.scriptVersion?.segments ?? []).map((s, i) =>
      i === 0 ? "A completely different opening line" : s.text,
    );
    const res = await store.createScript(alice, p.id, changed.join("\n"));
    expect(res.staleEvidenceIds.length).toBeGreaterThan(0);
    const after = await store.listEvidence(alice, p.id);
    expect(after.filter((e) => e.status === "stale").length).toBe(res.staleEvidenceIds.length);
    expect(after).toHaveLength(before.length);
    const findings = await store.listFindings(alice, p.id);
    expect(findings.filter((f) => f.type === "poltergeist").length).toBeGreaterThan(0);
    const events = await store.listAuditEvents(alice, p.id);
    expect(events.map((e) => e.type)).toContain("script_revised");
    const dump = JSON.stringify(events);
    expect(dump).not.toContain("A completely different opening line");
    expect(dump).not.toContain("a.mp4");
  });

  it("confirms evidence only for the owner, resolves its finding, and refuses stale evidence", async () => {
    const p = await store.createProject(alice, { name: name("review"), copyFromDemo: true });
    const evidence = await store.listEvidence(alice, p.id);
    const target = evidence.find((e) => e.status === "candidate");
    expect(target).toBeDefined();
    const id = (target as NonNullable<typeof target>).id;
    expect((await refused(store.reviewEvidence(bob, id, { decision: "confirm" }))).status).toBe(
      404,
    );
    const { evidence: done, decision } = await store.reviewEvidence(alice, id, {
      decision: "confirm",
    });
    expect(done.status).toBe("confirmed");
    expect(decision.reviewerId).toBe(alice.userId);
    const report = await store.getReportData(alice, p.id);
    expect(report.decisions.map((d) => d.evidenceId)).toContain(id);

    // Edit that line: its evidence goes stale and can no longer be confirmed.
    const detail = await store.getProjectDetail(alice, p.id);
    const seg = detail.scriptVersion?.segments.find((s) => s.id === done.scriptSegmentId);
    const edited = (detail.scriptVersion?.segments ?? []).map((s) =>
      s.id === seg?.id ? "Entirely new wording for this step" : s.text,
    );
    await store.createScript(alice, p.id, edited.join("\n"));
    const err = await refused(store.reviewEvidence(alice, id, { decision: "confirm" }));
    expect(err.code).toBe("review_refused");
  });

  it("creates and closes reshoots for the owner only", async () => {
    const p = await ready(bob);
    const r = await store.createReshoot(bob, p.id, { note: "Record the export step again." });
    expect(r.status).toBe("open");
    expect((await refused(store.updateReshoot(alice, r.id, "done"))).status).toBe(404);
    expect((await store.updateReshoot(bob, r.id, "done")).status).toBe("done");
    expect((await store.listReshoots(bob, p.id)).map((x) => x.status)).toEqual(["done"]);
  });

  it("will not seal a project with undecided candidates, and says why", async () => {
    const p = await store.createProject(alice, { name: name("seal"), copyFromDemo: true });
    const err = await refused(store.sealProject(alice, p.id));
    expect(err.status).toBe(409);
    expect(err.code).toBe("seal_blocked");
    expect((err.details as { blockers: string[] }).blockers).toContain("undecided_candidates");
    const { blockers, seal } = await store.getCoverage(alice, p.id);
    expect(blockers).toContain("undecided_candidates");
    expect(seal).toBeNull();
    expect((await refused(store.sealProject({ userId: null }, p.id))).status).toBe(404);
  });
});
