import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { createSupabaseStore, createWorkerStore, type SupabaseStore } from "@sleuth/db";
import {
  deleteProjectsOwnedBy,
  openTestDb,
  TEST_PROJECT_PREFIX,
  testDatabaseUrl,
  uuidV5,
} from "@sleuth/db/testing";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createProviders } from "./providers";
import { createSupabaseHandler, type MediaTools } from "./supabase-handler";

/**
 * The Supabase handler against a real database (evidence-analysis 12): a job queued through the
 * store is claimed (a plain update, as in the store's own contract test), the handler runs the
 * pipeline with the mock providers, and the candidates land in Postgres. The video and FFmpeg are
 * faked here; the unit tests cover them with real FFmpeg.
 */

const url = testDatabaseUrl();
if (!url) console.warn("[supabase handler] TEST_DATABASE_URL is not set: the suite is skipped.");
const suite = url ? describe : describe.skip;
vi.setConfig({ testTimeout: 120_000, hookTimeout: 60_000 });

const OWNER_ID = uuidV5("user-1", "0f6d2f4e-5a1e-4c0b-9a57-5e17e57c0010");
const owner = { userId: OWNER_ID };
const WORKER = "handler-test-1";
const OTHER_WORKER = "handler-test-2";

const media: MediaTools = {
  download: (_url, dest) => Promise.resolve(writeFileSync(dest, "not really a video")),
  probeDurationMs: () => Promise.resolve(52_000),
  extractAudio: (_in, out) => Promise.resolve(writeFileSync(out, "audio")),
  extractFrames: (_in, timestamps, dir) =>
    Promise.resolve(
      timestamps.map((timestampMs) => ({ timestampMs, path: join(dir, `${timestampMs}.jpg`) })),
    ),
};

const storage = {
  createSignedUploadUrl: () => Promise.reject(new Error("not used")),
  remove: () => Promise.resolve(),
  uploadedAt: () => Promise.resolve(new Date().toISOString()),
  createSignedDownloadUrl: () =>
    Promise.resolve({ url: "https://storage.invalid/signed", expiresAt: new Date().toISOString() }),
};

suite("Supabase handler on Postgres (evidence-analysis 12)", () => {
  let handle: ReturnType<typeof openTestDb>;
  let sql: postgres.Sql;
  let api: SupabaseStore;

  beforeAll(async () => {
    handle = openTestDb();
    sql = postgres(url as string, { max: 1 });
    await deleteProjectsOwnedBy(handle.db, OWNER_ID);
    api = createSupabaseStore({ db: handle.db, dailyAnalysisLimit: 1000 });
  }, 60_000);

  afterAll(async () => {
    await deleteProjectsOwnedBy(handle.db, OWNER_ID);
    await sql.end({ timeout: 5 });
    await handle.close();
  }, 60_000);

  const handler = (workerId: string, over: Partial<MediaTools> = {}) =>
    createSupabaseHandler({
      store: createWorkerStore({ db: handle.db, storage }),
      providers: createProviders({
        SLEUTH_DATA_MODE: "supabase",
        TRANSCRIPTION_PROVIDER: "mock",
        VIDEO_ANALYSIS_PROVIDER: "mock",
        ALLOW_MOCK_PROVIDERS: true,
        MAX_FRAMES_PER_VIDEO: 60,
      }),
      workerId,
      maxVideoSeconds: 180,
      maxVideoBytes: 1_000_000,
      maxFrames: 60,
      media: { ...media, ...over },
    });

  async function claimed(segmentIds?: string[]) {
    const project = await api.createProject(owner, {
      name: `${TEST_PROJECT_PREFIX}handler`,
      copyFromDemo: true,
    });
    const queued = await api.startAnalysis(owner, project.id, segmentIds ? { segmentIds } : {});
    await sql`
      update processing_jobs set status = 'running', locked_by = ${WORKER}, attempts = 1
      where id = ${queued.id}`;
    return {
      projectId: project.id,
      job: { ...queued, status: "running" as const, lockedBy: WORKER, attempts: 1 },
    };
  }

  it("turns a claimed job into candidates and findings in the database, never confirmed", async () => {
    const { projectId, job } = await claimed();
    await handler(WORKER)(job);

    const evidence = await api.listEvidence(owner, projectId);
    const fresh = evidence.filter((e) => e.analysisRunId === `run-${job.id}`);
    expect(fresh.length).toBeGreaterThan(0);
    for (const e of fresh) {
      expect(e.source).toBe("ai");
      expect(e.status === "candidate" || e.status === "needs_outside_proof").toBe(true);
    }
    expect((await api.listFindings(owner, projectId)).length).toBeGreaterThan(0);

    const [counted] =
      await sql`select count(*)::int as n from transcript_segments where project_id = ${projectId}`;
    expect(counted?.n).toBeGreaterThan(0);
  });

  it("writes the same rows when the job runs again (a retry)", async () => {
    const { projectId, job } = await claimed();
    await handler(WORKER)(job);
    const first = await api.listEvidence(owner, projectId);
    await handler(WORKER)(job);
    expect(await api.listEvidence(owner, projectId)).toEqual(first);
    const [counted] =
      await sql`select count(*)::int as n, count(distinct id)::int as ids from transcript_segments where project_id = ${projectId}`;
    expect(counted?.n).toBeGreaterThan(0);
    expect(counted?.ids).toBe(counted?.n);
  });

  it("refuses a worker that does not hold the job and writes nothing", async () => {
    const { projectId, job } = await claimed();
    const before = await api.listEvidence(owner, projectId);
    await expect(handler(OTHER_WORKER)(job)).rejects.toThrow("load: lease_lost");
    expect(await api.listEvidence(owner, projectId)).toEqual(before);
  });

  it("fails with a short step: code message and writes nothing when a media step breaks", async () => {
    const { projectId, job } = await claimed();
    const before = await api.listEvidence(owner, projectId);
    await expect(
      handler(WORKER, { probeDurationMs: () => Promise.resolve(200_000) })(job),
    ).rejects.toThrow("probe: duration_exceeded");
    expect(await api.listEvidence(owner, projectId)).toEqual(before);
  });
});
