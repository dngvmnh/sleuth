import { createHash } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { createDb, type Db } from "../client";
import { loadLocalEnv } from "../env";
import * as t from "../schema";

/**
 * Helpers for tests that run against the real dev database (TEST_DATABASE_URL).
 * The dev and test databases are the same, so tests only ever touch rows they own:
 *   - owners are UUIDs derived from a fixed test namespace (never a real user),
 *   - project names start with `contract-test-`,
 *   - cleanup deletes only non-demo projects owned by those UUIDs. The seeded demo is never touched.
 */

loadLocalEnv();

/**
 * CI's database job sets SLEUTH_REQUIRE_DB=1. Then a missing setting is an error, not a skip,
 * so the job can never go green without running the suites.
 */
export const DB_REQUIRED = process.env.SLEUTH_REQUIRE_DB === "1";
if (DB_REQUIRED) {
  for (const key of [
    "TEST_DATABASE_URL",
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
  ]) {
    if (!process.env[key]?.trim()) throw new Error(`SLEUTH_REQUIRE_DB=1 but ${key} is not set.`);
  }
}

export const TEST_PROJECT_PREFIX = "contract-test-";

/** RFC 4122 version 5 UUID: the same name always gives the same id. */
export function uuidV5(name: string, namespace: string): string {
  const ns = Buffer.from(namespace.replace(/-/g, ""), "hex");
  const h = createHash("sha1").update(ns).update(name).digest();
  h[6] = ((h[6] as number) & 0x0f) | 0x50;
  h[8] = ((h[8] as number) & 0x3f) | 0x80;
  const x = h.subarray(0, 16).toString("hex");
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20)}`;
}

/** Namespaces: one per test file, so files can run in parallel without touching each other. */
export const NAMESPACES = {
  store: "0f6d2f4e-5a1e-4c0b-9a57-5e17e57c0001",
  rls: "0f6d2f4e-5a1e-4c0b-9a57-5e17e57c0002",
  api: "0f6d2f4e-5a1e-4c0b-9a57-5e17e57c0003",
  purge: "0f6d2f4e-5a1e-4c0b-9a57-5e17e57c0004",
  write: "0f6d2f4e-5a1e-4c0b-9a57-5e17e57c0005",
  upload: "0f6d2f4e-5a1e-4c0b-9a57-5e17e57c0006",
  web: "0f6d2f4e-5a1e-4c0b-9a57-5e17e57c0007",
  impact: "0f6d2f4e-5a1e-4c0b-9a57-5e17e57c0008",
  // Reserved for the ingestion tasks still to come.
} as const;

export const testUser = (ns: keyof typeof NAMESPACES, n: number): string =>
  uuidV5(`user-${n}`, NAMESPACES[ns]);

const MAX_TEST_USERS = 30;
export const testUserIds = (ns: keyof typeof NAMESPACES): string[] =>
  Array.from({ length: MAX_TEST_USERS }, (_, n) => testUser(ns, n));

export function testDatabaseUrl(): string | undefined {
  const url = process.env.TEST_DATABASE_URL?.trim();
  return url ? url : undefined;
}

export function openTestDb(): { db: Db; close: () => Promise<void> } {
  const url = testDatabaseUrl();
  if (!url) throw new Error("TEST_DATABASE_URL is not set.");
  const { db, client } = createDb(url, { max: 4 });
  return { db, close: () => client.end({ timeout: 5 }) };
}

/** Delete every project a test namespace created. Children go with them (cascade). Never the demo. */
export async function deleteTestProjects(db: Db, ns: keyof typeof NAMESPACES): Promise<void> {
  await db
    .delete(t.projects)
    .where(and(eq(t.projects.isDemo, false), inArray(t.projects.ownerId, testUserIds(ns))));
}

/** Delete the non-demo projects of one owner (for auth users a test signed in as). */
export async function deleteProjectsOwnedBy(db: Db, ownerId: string): Promise<void> {
  await db
    .delete(t.projects)
    .where(and(eq(t.projects.isDemo, false), eq(t.projects.ownerId, ownerId)));
}
