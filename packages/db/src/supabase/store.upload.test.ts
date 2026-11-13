import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { StoreError, type ProjectStore } from "../store";
import { createStorageClient, tokenExpiry, type StorageClient } from "./storage";
import { createSupabaseStore } from "./store";
import {
  deleteTestProjects,
  openTestDb,
  TEST_PROJECT_PREFIX,
  testDatabaseUrl,
  testUser,
} from "./test-support";

describe("tokenExpiry", () => {
  const jwt = (claims: object) =>
    `h.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.s`;
  it("reads exp from a token and returns null for anything else", () => {
    expect(tokenExpiry(jwt({ exp: 1_800_000_000 }))).toBe(1_800_000_000);
    expect(tokenExpiry(jwt({ iat: 1 }))).toBeNull();
    expect(tokenExpiry("not-a-token")).toBeNull();
  });
});

const dbUrl = testDatabaseUrl();
const supaUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
const bucket = process.env.SUPABASE_STORAGE_BUCKET?.trim() || "video-assets";
const configured = Boolean(dbUrl && supaUrl && serviceKey && anonKey);
if (!configured) {
  console.warn(
    "[supabase storage] database or Supabase keys are not set: the storage suite is skipped.",
  );
}
const suite = configured ? describe : describe.skip;
vi.setConfig({ testTimeout: 120_000, hookTimeout: 60_000 });

const owner = { userId: testUser("upload", 1) };
const FILE_NAME = "customer-secret-name.mp4";

suite("signed upload URLs on Supabase Storage", () => {
  let handle: ReturnType<typeof openTestDb>;
  let store: ProjectStore;
  let storage: StorageClient;
  const uploaded: string[] = [];

  beforeAll(async () => {
    // Queries run one at a time here: one client keeps the Free pooler's 15-client cap free.
    handle = openTestDb(1);
    storage = createStorageClient({
      url: supaUrl as string,
      serviceRoleKey: serviceKey as string,
      bucket,
    });
    store = createSupabaseStore({ db: handle.db, storage });
    await deleteTestProjects(handle.db, "upload");
  }, 60_000);

  afterAll(async () => {
    await storage.remove(uploaded);
    await deleteTestProjects(handle.db, "upload");
    await handle.close();
  }, 60_000);

  const upload = (projectId: string) =>
    store.createUploadUrl(owner, projectId, {
      fileName: FILE_NAME,
      mimeType: "video/mp4",
      sizeBytes: 1000,
      durationMs: 12_000,
    });

  it("gives a URL with no key in it and a path with no file name in it [2.4]", async () => {
    const p = await store.createProject(owner, { name: `${TEST_PROJECT_PREFIX}url` });
    const out = await upload(p.id);
    const everything = JSON.stringify(out);
    expect(everything).not.toContain(serviceKey as string);
    expect(everything).not.toContain(anonKey as string);
    expect(everything.toLowerCase()).not.toMatch(/service[_-]?role/);
    expect(everything).not.toContain("customer-secret-name");
    expect(out.assetVersion.storagePath).toMatch(new RegExp(`^${p.id}/1/[0-9a-f-]{36}\\.mp4$`));
    expect(new URL(out.uploadUrl).host).toBe(new URL(supaUrl as string).host);
    // The storage token lives longer, but the reported expiry is the five-minute upload window.
    const token = new URL(out.uploadUrl).searchParams.get("token") as string;
    expect((tokenExpiry(token) as number) * 1000).toBeGreaterThan(Date.parse(out.expiresAt));
    expect(Date.parse(out.expiresAt)).toBe(Date.parse(out.assetVersion.createdAt) + 5 * 60_000);
    expect(Date.parse(out.expiresAt)).toBeGreaterThan(Date.now());
    const events = JSON.stringify(await store.listAuditEvents(owner, p.id));
    expect(events).not.toContain("customer-secret-name");
  });

  it("marks evidence on the older video stale the moment a new upload URL is made [2.5]", async () => {
    const p = await store.createProject(owner, {
      name: `${TEST_PROJECT_PREFIX}stale`,
      copyFromDemo: true,
    });
    const before = await store.listEvidence(owner, p.id);
    expect(before.some((e) => e.status !== "stale")).toBe(true);
    await upload(p.id);
    const after = await store.listEvidence(owner, p.id);
    expect(after).toHaveLength(before.length);
    expect(after.every((e) => e.status === "stale" || e.status === "rejected")).toBe(true);
    const findings = await store.listFindings(owner, p.id);
    expect(findings.filter((f) => f.type === "poltergeist").length).toBeGreaterThan(0);
    const events = await store.listAuditEvents(owner, p.id);
    expect(events.map((e) => e.type)).toEqual(
      expect.arrayContaining(["asset_version_created", "asset_replaced"]),
    );
  });

  it("accepts a real upload to the URL and refuses a tampered token", async () => {
    const p = await store.createProject(owner, { name: `${TEST_PROJECT_PREFIX}real` });
    const out = await upload(p.id);
    const path = out.assetVersion.storagePath;
    const token = new URL(out.uploadUrl).searchParams.get("token") as string;
    const browser = createClient(supaUrl as string, anonKey as string, {
      auth: { persistSession: false },
    });
    const body = new Blob([new Uint8Array([0, 1, 2, 3])], { type: "video/mp4" });

    const bad = await browser.storage
      .from(bucket)
      .uploadToSignedUrl(path, `${token.slice(0, -4)}AAAA`, body);
    expect(bad.error).not.toBeNull();

    const good = await browser.storage.from(bucket).uploadToSignedUrl(path, token, body);
    expect(good.error).toBeNull();
    uploaded.push(path);

    // The bucket is private: the anon key cannot read it back.
    const read = await browser.storage.from(bucket).download(path);
    expect(read.error).not.toBeNull();
  });

  it("deletes files through the storage client", async () => {
    const p = await store.createProject(owner, { name: `${TEST_PROJECT_PREFIX}remove` });
    const out = await upload(p.id);
    const token = new URL(out.uploadUrl).searchParams.get("token") as string;
    const browser = createClient(supaUrl as string, anonKey as string, {
      auth: { persistSession: false },
    });
    await browser.storage
      .from(bucket)
      .uploadToSignedUrl(out.assetVersion.storagePath, token, new Blob([new Uint8Array([9])]));
    await storage.remove([out.assetVersion.storagePath]);
    const service = createClient(supaUrl as string, serviceKey as string, {
      auth: { persistSession: false },
    });
    const gone = await service.storage.from(bucket).download(out.assetVersion.storagePath);
    expect(gone.error).not.toBeNull();
    await expect(storage.remove([])).resolves.toBeUndefined();
  });

  describe("five-minute upload window at analysis time [2.1, decision D-1]", () => {
    const putFile = async (out: Awaited<ReturnType<typeof upload>>) => {
      const token = new URL(out.uploadUrl).searchParams.get("token") as string;
      const browser = createClient(supaUrl as string, anonKey as string, {
        auth: { persistSession: false },
      });
      const res = await browser.storage
        .from(bucket)
        .uploadToSignedUrl(out.assetVersion.storagePath, token, new Blob([new Uint8Array([7])]));
      expect(res.error).toBeNull();
      uploaded.push(out.assetVersion.storagePath);
    };
    const readyWithScript = async (s: ProjectStore, label: string) => {
      const p = await s.createProject(owner, { name: `${TEST_PROJECT_PREFIX}${label}` });
      await s.createScript(owner, p.id, "Open the app.\nPress export.");
      return p;
    };

    it("accepts a file that landed inside the window", async () => {
      const p = await readyWithScript(store, "window-ok");
      await putFile(await upload(p.id));
      expect((await store.startAnalysis(owner, p.id, {})).status).toBe("queued");
    });

    it("refuses analysis while nothing has been uploaded", async () => {
      const p = await readyWithScript(store, "window-missing");
      await upload(p.id);
      const err = await refused(store.startAnalysis(owner, p.id, {}));
      expect({ status: err.status, code: err.code }).toEqual({
        status: 409,
        code: "upload_missing",
      });
    });

    it("refuses a file that landed after the window closed", async () => {
      // The URL is made "ten minutes ago" by the store's clock; the file lands now.
      const late = createSupabaseStore({
        db: handle.db,
        storage,
        now: () => new Date(Date.now() - 10 * 60_000),
      });
      const p = await readyWithScript(late, "window-late");
      const out = await late.createUploadUrl(owner, p.id, {
        fileName: FILE_NAME,
        mimeType: "video/mp4",
        sizeBytes: 1000,
        durationMs: 12_000,
      });
      expect(Date.parse(out.expiresAt)).toBeLessThan(Date.now());
      await putFile(out);
      const err = await refused(store.startAnalysis(owner, p.id, {}));
      expect({ status: err.status, code: err.code }).toEqual({ status: 409, code: "upload_late" });
    });
  });
});

async function refused(p: Promise<unknown>): Promise<StoreError> {
  try {
    await p;
  } catch (e) {
    if (e instanceof StoreError) return e;
    throw e;
  }
  throw new Error("expected the store to refuse this call");
}
