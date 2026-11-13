import { createClient } from "@supabase/supabase-js";
import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, expect, it, describe, vi } from "vitest";
import * as t from "../schema";
import { createStorageClient } from "./storage";
import { createSupabaseStore, type SupabaseStore } from "./store";
import {
  deleteProjectsOwnedBy,
  deleteTestProjects,
  openTestDb,
  TEST_PROJECT_PREFIX,
  testDatabaseUrl,
  testUser,
} from "./test-support";

const supaUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
const bucket = process.env.SUPABASE_STORAGE_BUCKET?.trim() || "video-assets";
const configured = Boolean(testDatabaseUrl() && supaUrl && serviceKey && anonKey);
if (!configured) {
  console.warn(
    "[supabase purge] database or Supabase keys are not set: the purge suite is skipped.",
  );
}
const suite = configured ? describe : describe.skip;
vi.setConfig({ testTimeout: 120_000, hookTimeout: 90_000 });

/**
 * The dev and test databases are one database, so this suite works in the year 2000: every row
 * it makes is dated then, and the purge runs with `now` in 2000. Real rows are all newer than the
 * cutoff, so a run can only ever remove this suite's own projects.
 */
const NOW = new Date("2000-02-01T00:00:00.000Z");
const OLD = "2000-01-01T00:00:00.000Z";
const FRESH = "2000-01-30T00:00:00.000Z";

suite("retention purge on Postgres and Storage [5.4]", () => {
  let handle: ReturnType<typeof openTestDb>;
  let store: SupabaseStore;
  const anonUsers: string[] = [];
  const admin = () =>
    createClient(supaUrl as string, serviceKey as string, { auth: { persistSession: false } });

  async function anonymousUser(): Promise<string> {
    const browser = createClient(supaUrl as string, anonKey as string, {
      auth: { persistSession: false },
    });
    const { data, error } = await browser.auth.signInAnonymously();
    if (error || !data.user) throw new Error("Anonymous sign-in is not enabled on this project.");
    anonUsers.push(data.user.id);
    return data.user.id;
  }

  /** A project with one uploaded file, dated `createdAt`. */
  async function projectWithFile(owner: string, createdAt: string, label: string) {
    const id = `${TEST_PROJECT_PREFIX}purge-${label}-${Date.now()}`;
    const path = `${id}/1/${crypto.randomUUID()}.mp4`;
    await handle.db.insert(t.projects).values({ id, name: id, ownerId: owner, createdAt });
    await handle.db.insert(t.assetVersions).values({
      id: `${id}-av`,
      projectId: id,
      version: 1,
      storagePath: path,
      mimeType: "video/mp4",
      durationMs: 1000,
      createdAt,
    });
    await handle.db.insert(t.checklistItems).values({
      id: `${id}-ck`,
      projectId: id,
      label: "x",
      position: 0,
    });
    const up = await admin()
      .storage.from(bucket)
      .upload(path, new Blob([new Uint8Array([1, 2, 3])]), { contentType: "video/mp4" });
    if (up.error) throw new Error("Test upload failed.");
    return { id, path };
  }

  const fileExists = async (path: string) =>
    (await admin().storage.from(bucket).download(path)).error === null;

  beforeAll(async () => {
    // Queries run one at a time here: one client keeps the Free pooler's 15-client cap free.
    handle = openTestDb(1);
    await deleteTestProjects(handle.db, "purge");
    store = createSupabaseStore({
      db: handle.db,
      storage: createStorageClient({
        url: supaUrl as string,
        serviceRoleKey: serviceKey as string,
        bucket,
      }),
    });
  }, 90_000);

  afterAll(async () => {
    for (const id of anonUsers) {
      await deleteProjectsOwnedBy(handle.db, id);
      await admin().auth.admin.deleteUser(id);
    }
    await deleteTestProjects(handle.db, "purge");
    await handle.close();
  }, 90_000);

  it("removes an old anonymous project's files and rows, and nothing else", async () => {
    const oldAnonUser = await anonymousUser();
    const freshAnonUser = await anonymousUser();
    const oldAnon = await projectWithFile(oldAnonUser, OLD, "old-anon");
    const freshAnon = await projectWithFile(freshAnonUser, FRESH, "fresh-anon");
    // A signed-up user is not in auth.users as anonymous; their old project stays.
    const oldNamed = await projectWithFile(testUser("purge", 1), OLD, "old-named");

    const result = await store.purgeExpiredAnonymousProjects(NOW, 7);
    expect(result).toEqual({ projectIds: [oldAnon.id], files: 1 });

    expect(await fileExists(oldAnon.path)).toBe(false);
    const left = await handle.db
      .select({ id: t.projects.id })
      .from(t.projects)
      .where(inArray(t.projects.id, [oldAnon.id, freshAnon.id, oldNamed.id]));
    expect(left.map((r) => r.id).sort()).toEqual([freshAnon.id, oldNamed.id].sort());
    // Child rows went with the project.
    expect(
      await handle.db
        .select()
        .from(t.assetVersions)
        .where(eq(t.assetVersions.projectId, oldAnon.id)),
    ).toEqual([]);
    expect(
      await handle.db
        .select()
        .from(t.checklistItems)
        .where(eq(t.checklistItems.projectId, oldAnon.id)),
    ).toEqual([]);
    expect(await fileExists(freshAnon.path)).toBe(true);
    expect(await fileExists(oldNamed.path)).toBe(true);

    // The demo is untouched and a second run finds nothing.
    const [demo] = await handle.db
      .select()
      .from(t.projects)
      .where(eq(t.projects.id, "proofpay-demo"));
    expect(demo?.isDemo).toBe(true);
    expect(await store.purgeExpiredAnonymousProjects(NOW, 7)).toEqual({ projectIds: [], files: 0 });

    await admin().storage.from(bucket).remove([freshAnon.path, oldNamed.path]);
  });

  it("keeps the rows when storage refuses, so no file is left without a row", async () => {
    const owner = await anonymousUser();
    const p = await projectWithFile(owner, OLD, "storage-down");
    const broken = createSupabaseStore({
      db: handle.db,
      storage: {
        createSignedUploadUrl: () => Promise.reject(new Error("unused")),
        remove: () => Promise.reject(new Error("storage is down")),
        uploadedAt: () => Promise.resolve(null),
        createSignedDownloadUrl: () => Promise.reject(new Error("unused")),
      },
    });
    await expect(broken.purgeExpiredAnonymousProjects(NOW, 7)).rejects.toThrow("storage is down");
    const [still] = await handle.db.select().from(t.projects).where(eq(t.projects.id, p.id));
    expect(still?.id).toBe(p.id);
    // The real run then clears it.
    expect((await store.purgeExpiredAnonymousProjects(NOW, 7)).projectIds).toEqual([p.id]);
    expect(await fileExists(p.path)).toBe(false);
  });
});
