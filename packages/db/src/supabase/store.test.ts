import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as t from "../schema";
import { StoreError, type ProjectStore } from "../store";
import { createSupabaseStore } from "./store";
import { toIso } from "./mappers";
import {
  deleteTestProjects,
  openTestDb,
  TEST_PROJECT_PREFIX,
  testDatabaseUrl,
  testUser,
} from "./test-support";

describe("toIso", () => {
  it("turns Postgres timestamps into ISO 8601 with a Z", () => {
    expect(toIso("2026-11-08 12:00:00.123+00")).toBe("2026-11-08T12:00:00.123Z");
    expect(toIso("2026-11-08 12:00:00+00")).toBe("2026-11-08T12:00:00.000Z");
    expect(toIso("2026-11-08 20:00:00+08:00")).toBe("2026-11-08T12:00:00.000Z");
    expect(toIso("2026-11-08T12:00:00.5Z")).toBe("2026-11-08T12:00:00.500Z");
  });

  it("refuses text that is not a timestamp", () => {
    expect(() => toIso("yesterday")).toThrow();
  });
});

const url = testDatabaseUrl();
if (!url) {
  console.warn("[supabase store] TEST_DATABASE_URL is not set: the Postgres suites are skipped.");
}
const suite = url ? describe : describe.skip;

const DEMO = "proofpay-demo";
const anon = { userId: null };
const owner = { userId: testUser("store", 20) };
const stranger = { userId: testUser("store", 21) };
const PROJECT = `${TEST_PROJECT_PREFIX}read-side`;

async function refused(p: Promise<unknown>): Promise<StoreError> {
  try {
    await p;
  } catch (e) {
    if (e instanceof StoreError) return e;
    throw e;
  }
  throw new Error("expected the store to refuse this call");
}

suite("SupabaseStore (read side) on Postgres", () => {
  const handle = openTestDb();
  const store: ProjectStore = createSupabaseStore({ db: handle.db });
  const ids = { job: "", audit: "" };

  beforeAll(async () => {
    const { db } = handle;
    await deleteTestProjects(db, "store");
    await db.insert(t.projects).values({
      id: PROJECT,
      name: PROJECT,
      ownerId: owner.userId,
      isDemo: false,
    });
    await db.insert(t.checklistItems).values([
      { id: `${PROJECT}-ck-b`, projectId: PROJECT, label: "Second", position: 1 },
      { id: `${PROJECT}-ck-a`, projectId: PROJECT, label: "First", position: 0 },
    ]);
    await db.insert(t.assetVersions).values({
      id: `${PROJECT}-av`,
      projectId: PROJECT,
      version: 1,
      storagePath: `${PROJECT}/1/x.mp4`,
      mimeType: "video/mp4",
      durationMs: 1000,
    });
    await db.insert(t.scriptVersions).values({
      id: `${PROJECT}-sv`,
      projectId: PROJECT,
      version: 1,
      text: "One. Two.",
    });
    await db.insert(t.scriptSegments).values([
      {
        id: "seg-2",
        scriptVersionId: `${PROJECT}-sv`,
        projectId: PROJECT,
        index: 1,
        text: "Two.",
        hash: "b".repeat(64),
      },
      {
        id: "seg-1",
        scriptVersionId: `${PROJECT}-sv`,
        projectId: PROJECT,
        index: 0,
        text: "One.",
        hash: "a".repeat(64),
      },
    ]);
    await db
      .update(t.projects)
      .set({ currentAssetVersionId: `${PROJECT}-av`, currentScriptVersionId: `${PROJECT}-sv` })
      .where(eq(t.projects.id, PROJECT));
    ids.job = `${PROJECT}-job`;
    await db.insert(t.processingJobs).values({
      id: ids.job,
      projectId: PROJECT,
      kind: "analysis",
      status: "queued",
      payload: { assetVersionId: `${PROJECT}-av`, scriptVersionId: `${PROJECT}-sv` },
    });
    ids.audit = `${PROJECT}-ae`;
    await db.insert(t.auditEvents).values({
      id: ids.audit,
      projectId: PROJECT,
      actorId: owner.userId,
      type: "project_created",
      data: { copiedFromDemo: false },
    });
  }, 60_000);

  afterAll(async () => {
    await deleteTestProjects(handle.db, "store");
    await handle.close();
  }, 60_000);

  it("serves the seeded demo project to a visitor who is not signed in [1.6]", async () => {
    const projects = await store.listProjects(anon);
    expect(projects.map((p) => p.id)).toEqual([DEMO]);
    const detail = await store.getProjectDetail(anon, DEMO);
    expect(detail.project.isDemo).toBe(true);
    expect(detail.project.ownerId).toBeNull();
    expect(detail.checklist).toHaveLength(5);
    expect(detail.scriptVersion?.segments.length).toBeGreaterThan(0);
    expect(detail.assetVersion).not.toBeNull();
    expect(await store.listEvidence(anon, DEMO)).toHaveLength(4);
    expect(await store.listFindings(anon, DEMO)).toHaveLength(4);
  });

  it("returns the same data the golden fixture holds, with ISO timestamps", async () => {
    const detail = await store.getProjectDetail(anon, DEMO);
    for (const stamp of [detail.project.createdAt, detail.assetVersion?.createdAt ?? ""]) {
      expect(new Date(stamp).toISOString()).toBe(stamp);
    }
    const segs = detail.scriptVersion?.segments ?? [];
    expect(segs.map((s) => s.index)).toEqual(segs.map((_, i) => i));
    expect(detail.checklist.map((c) => c.position)).toEqual([0, 1, 2, 3, 4]);
  });

  it("builds the report for the demo: four lines to review and one uncovered item", async () => {
    const report = await store.getReportData(anon, DEMO);
    expect(report.coverage.totals).toMatchObject({ proven: 0, needs_review: 4, uncovered: 1 });
    expect(report.decisions).toEqual([]);
  });

  it("lists the owner's project after the demo, and hides it from everyone else", async () => {
    expect((await store.listProjects(owner)).map((p) => p.id)).toEqual([DEMO, PROJECT]);
    expect((await store.listProjects(stranger)).map((p) => p.id)).toEqual([DEMO]);
    expect((await store.listProjects(anon)).map((p) => p.id)).toEqual([DEMO]);
  });

  it("reads an owned project in the right order", async () => {
    const detail = await store.getProjectDetail(owner, PROJECT);
    expect(detail.checklist.map((c) => c.label)).toEqual(["First", "Second"]);
    expect(detail.scriptVersion?.segments.map((s) => s.id)).toEqual(["seg-1", "seg-2"]);
    expect(detail.assetVersion?.id).toBe(`${PROJECT}-av`);
    expect((await store.getJob(owner, PROJECT, ids.job)).status).toBe("queued");
    expect((await store.getReportData(owner, PROJECT)).coverage.totals.uncovered).toBe(2);
  });

  it("answers 404, not 403, on every read of another user's project [1.4]", async () => {
    for (const who of [stranger, anon, { userId: "not-a-uuid" }]) {
      expect((await refused(store.getProjectDetail(who, PROJECT))).status).toBe(404);
      expect((await refused(store.listEvidence(who, PROJECT))).status).toBe(404);
      expect((await refused(store.listFindings(who, PROJECT))).status).toBe(404);
      expect((await refused(store.getJob(who, PROJECT, ids.job))).status).toBe(404);
      expect((await refused(store.getReportData(who, PROJECT))).status).toBe(404);
      expect((await refused(store.listAuditEvents(who, PROJECT))).status).toBe(404);
    }
  });

  it("answers 404 for a project that does not exist, same as for one that is hidden", async () => {
    const missing = await refused(store.getProjectDetail(owner, `${PROJECT}-nope`));
    const hidden = await refused(store.getProjectDetail(stranger, PROJECT));
    expect({ status: missing.status, code: missing.code, message: missing.message }).toEqual({
      status: hidden.status,
      code: hidden.code,
      message: hidden.message,
    });
  });

  it("does not show a job through a different project", async () => {
    expect((await refused(store.getJob(anon, DEMO, ids.job))).status).toBe(404);
  });

  it("shows the audit trail to the owner only", async () => {
    const events = await store.listAuditEvents(owner, PROJECT);
    expect(events.map((e) => e.id)).toEqual([ids.audit]);
    expect((await refused(store.listAuditEvents(anon, DEMO))).status).toBe(403);
  });
});
