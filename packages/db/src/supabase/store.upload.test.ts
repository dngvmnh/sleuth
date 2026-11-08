import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { ProjectStore } from "../store";
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
    handle = openTestDb();
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
    // The reported expiry is the one inside the URL's own token, in the future.
    const token = new URL(out.uploadUrl).searchParams.get("token") as string;
    expect(Date.parse(out.expiresAt)).toBe((tokenExpiry(token) as number) * 1000);
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

  // Supabase fixes signed upload URLs at about two hours and offers no setting for it, so the
  // five-minute limit of requirement 2.4 cannot be met by the URL alone. See the journal.
  it.todo("upload URL expires within five minutes (needs a design decision)");
});
