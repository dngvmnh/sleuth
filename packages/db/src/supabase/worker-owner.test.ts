import { createClient } from "@supabase/supabase-js";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import * as t from "../schema";
import { createSupabaseStore, type SupabaseStore } from "./store";
import {
  deleteProjectsOwnedBy,
  openTestDb,
  TEST_PROJECT_PREFIX,
  testDatabaseUrl,
} from "./test-support";
import { createWorkerStore, type WorkerStore } from "./worker";

/**
 * The owner the worker sees for a job (decision D-4). Frames may go to a third party only for a
 * real account, so `realAccount` must come from Supabase Auth: an anonymous user, an owner Auth
 * does not know, and a missing owner are all not real accounts.
 */

const supaUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
const configured = Boolean(testDatabaseUrl() && supaUrl && serviceKey && anonKey);
if (!configured) {
  console.warn("[worker owner] database or Supabase keys are not set: the suite is skipped.");
}
const suite = configured ? describe : describe.skip;
vi.setConfig({ testTimeout: 120_000, hookTimeout: 60_000 });

const W = "worker-owner-test";
const UNKNOWN = "33333333-3333-4333-8333-333333333333";

suite("worker store: who owns the job (D-4)", () => {
  let handle: ReturnType<typeof openTestDb>;
  let api: SupabaseStore;
  let worker: WorkerStore;
  const users: string[] = [];
  const admin = () =>
    createClient(supaUrl as string, serviceKey as string, { auth: { persistSession: false } });

  beforeAll(() => {
    // One query at a time, so one client: the Free pooler's 15 clients are shared by all files.
    handle = openTestDb(1);
    api = createSupabaseStore({ db: handle.db, dailyAnalysisLimit: 1000 });
    worker = createWorkerStore({ db: handle.db });
  });

  afterAll(async () => {
    for (const id of [...users, UNKNOWN]) await deleteProjectsOwnedBy(handle.db, id);
    for (const id of users) await admin().auth.admin.deleteUser(id);
    await handle.close();
  });

  async function ownerSeenByWorker(ownerId: string) {
    const p = await api.createProject(
      { userId: ownerId },
      {
        name: `${TEST_PROJECT_PREFIX}owner`,
        copyFromDemo: true,
      },
    );
    const job = await api.startAnalysis({ userId: ownerId }, p.id, {});
    await handle.db
      .update(t.processingJobs)
      .set({ status: "running", lockedBy: W, attempts: 1 })
      .where(eq(t.processingJobs.id, job.id));
    return (await worker.loadJobInputs(job.id, W)).owner;
  }

  it("calls an anonymous guest not a real account", async () => {
    const browser = createClient(supaUrl as string, anonKey as string, {
      auth: { persistSession: false },
    });
    const { data, error } = await browser.auth.signInAnonymously();
    if (error || !data.user) throw new Error("Anonymous sign-in is not enabled on this project.");
    users.push(data.user.id);
    expect(await ownerSeenByWorker(data.user.id)).toEqual({
      userId: data.user.id,
      realAccount: false,
    });
  });

  it("calls an owner Auth does not know not a real account", async () => {
    expect(await ownerSeenByWorker(UNKNOWN)).toEqual({ userId: UNKNOWN, realAccount: false });
  });

  it("calls a confirmed email account a real account", async () => {
    const { data, error } = await admin().auth.admin.createUser({
      email: `owner-${Date.now()}@example.invalid`,
      email_confirm: true,
    });
    if (error || !data.user) throw new Error("Could not create a test account.");
    users.push(data.user.id);
    expect(await ownerSeenByWorker(data.user.id)).toEqual({
      userId: data.user.id,
      realAccount: true,
    });
  });
});
