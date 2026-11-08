import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { Db } from "../client";
import * as t from "../schema";
import {
  deleteTestProjects,
  openTestDb,
  TEST_PROJECT_PREFIX,
  testDatabaseUrl,
  testUser,
} from "./test-support";

/**
 * Row-level security on the real database: the second wall behind the store's own checks.
 * Each check runs in a transaction that switches to the `authenticated` or `anon` role and sets
 * `request.jwt.claims` the way Supabase does for a signed-in request, then rolls back. So nothing
 * a check writes is ever kept, even when RLS lets it through.
 */

const url = testDatabaseUrl();
if (!url) console.warn("[rls] TEST_DATABASE_URL is not set: the RLS suite is skipped.");
const suite = url ? describe : describe.skip;
vi.setConfig({ testTimeout: 120_000, hookTimeout: 60_000 });

const A = testUser("rls", 1);
const B = testUser("rls", 2);
const PA = `${TEST_PROJECT_PREFIX}rls-a`;
const PB = `${TEST_PROJECT_PREFIX}rls-b`;
const DEMO = "proofpay-demo";

type Who = { role: "authenticated"; sub: string } | { role: "anon" };
const userA: Who = { role: "authenticated", sub: A };
const userB: Who = { role: "authenticated", sub: B };
const visitor: Who = { role: "anon" };

class Rollback extends Error {}

/** Run `fn` as `who`, then roll back. Returns what `fn` returned, or the error it threw. */
async function as<T>(db: Db, who: Who, fn: (tx: Db) => Promise<T>): Promise<T> {
  let out: { ok: true; value: T } | { ok: false; error: unknown } | undefined;
  try {
    await db.transaction(async (tx) => {
      const claims = JSON.stringify(
        who.role === "anon" ? { role: "anon" } : { role: who.role, sub: who.sub },
      );
      await tx.execute(sql`select set_config('request.jwt.claims', ${claims}, true)`);
      await tx.execute(sql.raw(`set local role ${who.role}`));
      try {
        out = { ok: true, value: await fn(tx as unknown as Db) };
      } catch (error) {
        out = { ok: false, error };
      }
      throw new Rollback();
    });
  } catch (e) {
    if (!(e instanceof Rollback)) throw e;
  }
  if (!out) throw new Error("check did not run");
  if (!out.ok) throw out.error;
  return out.value;
}

/** Postgres error code of a refused statement (42501 = RLS or privilege refusal). */
async function sqlState(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (e) {
    const err = e as { code?: string; cause?: { code?: string } };
    return err.cause?.code ?? err.code ?? "unknown";
  }
  return "allowed";
}

const ids = (rows: { id: string }[]) => rows.map((r) => r.id).sort();

/** Tables with a project_id column; every one carries the same read and write policies. */
const PROJECT_TABLES = [
  "asset_versions",
  "script_versions",
  "script_segments",
  "checklist_items",
  "transcript_segments",
  "frame_observations",
  "evidence_candidates",
  "findings",
  "review_decisions",
  "reshoot_tasks",
  "processing_jobs",
  "audit_events",
  "seals",
] as const;

suite("row-level security on Postgres [1.4]", () => {
  let handle: ReturnType<typeof openTestDb>;

  beforeAll(async () => {
    handle = openTestDb();
    const { db } = handle;
    await deleteTestProjects(db, "rls");
    await db.insert(t.projects).values([
      { id: PA, name: PA, ownerId: A },
      { id: PB, name: PB, ownerId: B },
    ]);
    await db.insert(t.checklistItems).values([
      { id: `${PA}-ck`, projectId: PA, label: "A item", position: 0 },
      { id: `${PB}-ck`, projectId: PB, label: "B item", position: 0 },
    ]);
    await db.insert(t.auditEvents).values([
      { id: `${PA}-ae`, projectId: PA, actorId: A, type: "project_created", data: {} },
      { id: `${PB}-ae`, projectId: PB, actorId: B, type: "project_created", data: {} },
    ]);
  }, 60_000);

  afterAll(async () => {
    await deleteTestProjects(handle.db, "rls");
    await handle.close();
  }, 60_000);

  it("has RLS switched on for every table in the public schema", async () => {
    const rows = await handle.db.execute<{ relname: string; rls: boolean }>(
      sql`select c.relname, c.relrowsecurity as rls from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r'`,
    );
    const off = [...rows].filter((r) => !r.rls).map((r) => r.relname);
    expect(off).toEqual([]);
    expect([...rows].length).toBeGreaterThanOrEqual(PROJECT_TABLES.length + 1);
  });

  it("takes the user id from request.jwt.claims", async () => {
    const [row] = await as(handle.db, userA, (tx) =>
      tx.execute<{ uid: string; role: string }>(
        sql`select auth.uid()::text as uid, current_user as role`,
      ),
    );
    expect(row).toEqual({ uid: A, role: "authenticated" });
  });

  describe("user A and user B", () => {
    it("each sees the demo and their own project, never the other's", async () => {
      const seenByA = await as(handle.db, userA, (tx) =>
        tx.select({ id: t.projects.id }).from(t.projects),
      );
      const seenByB = await as(handle.db, userB, (tx) =>
        tx.select({ id: t.projects.id }).from(t.projects),
      );
      expect(ids(seenByA)).toContain(PA);
      expect(ids(seenByA)).toContain(DEMO);
      expect(ids(seenByA)).not.toContain(PB);
      expect(ids(seenByB)).toContain(PB);
      expect(ids(seenByB)).not.toContain(PA);
    });

    it("cannot read the other's child rows in any table", async () => {
      for (const table of PROJECT_TABLES) {
        const rows = await as(handle.db, userA, (tx) =>
          tx.execute<{ n: number }>(
            sql`select count(*)::int as n from ${sql.identifier(table)} where project_id = ${PB}`,
          ),
        );
        expect([...rows][0]?.n, table).toBe(0);
      }
      const own = await as(handle.db, userA, (tx) => tx.select().from(t.checklistItems));
      expect(own.map((r) => r.projectId)).toContain(PA);
      expect(own.map((r) => r.projectId)).not.toContain(PB);
    });

    it("cannot insert into, change or delete the other's rows", async () => {
      const insert = as(handle.db, userA, (tx) =>
        tx
          .insert(t.checklistItems)
          .values({ id: `${PB}-hijack`, projectId: PB, label: "x", position: 1 }),
      );
      expect(await sqlState(insert)).toBe("42501");

      const renamed = await as(handle.db, userA, (tx) =>
        tx
          .update(t.projects)
          .set({ name: "hijacked" })
          .where(sql`${t.projects.id} = ${PB}`)
          .returning(),
      );
      expect(renamed).toEqual([]);
      const relabelled = await as(handle.db, userA, (tx) =>
        tx
          .update(t.checklistItems)
          .set({ label: "hijacked" })
          .where(sql`${t.checklistItems.projectId} = ${PB}`)
          .returning(),
      );
      expect(relabelled).toEqual([]);
      const deleted = await as(handle.db, userA, (tx) =>
        tx
          .delete(t.projects)
          .where(sql`${t.projects.id} = ${PB}`)
          .returning(),
      );
      expect(deleted).toEqual([]);

      // Moving one's own row into the other's project is refused too.
      const moved = as(handle.db, userA, (tx) =>
        tx
          .update(t.checklistItems)
          .set({ projectId: PB })
          .where(sql`${t.checklistItems.id} = ${`${PA}-ck`}`),
      );
      expect(await sqlState(moved)).toBe("42501");
    });

    it("cannot create a project in someone else's name or a demo project", async () => {
      const forOther = as(handle.db, userA, (tx) =>
        tx.insert(t.projects).values({ id: `${PA}-x`, name: "x", ownerId: B }),
      );
      expect(await sqlState(forOther)).toBe("42501");
      const fakeDemo = as(handle.db, userA, (tx) =>
        tx.insert(t.projects).values({ id: `${PA}-d`, name: "x", ownerId: A, isDemo: true }),
      );
      expect(await sqlState(fakeDemo)).toBe("42501");
    });

    it("can write their own project (so the refusals above are about ownership)", async () => {
      const added = await as(handle.db, userA, (tx) =>
        tx
          .insert(t.checklistItems)
          .values({ id: `${PA}-new`, projectId: PA, label: "ok", position: 1 })
          .returning(),
      );
      expect(added.map((r) => r.id)).toEqual([`${PA}-new`]);
      const made = await as(handle.db, userA, (tx) =>
        tx
          .insert(t.projects)
          .values({ id: `${PA}-own`, name: "ok", ownerId: A })
          .returning(),
      );
      expect(made.map((r) => r.id)).toEqual([`${PA}-own`]);
    });

    it("cannot write to the demo project, even signed in", async () => {
      const ins = as(handle.db, userA, (tx) =>
        tx
          .insert(t.checklistItems)
          .values({ id: `${DEMO}-x`, projectId: DEMO, label: "x", position: 9 }),
      );
      expect(await sqlState(ins)).toBe("42501");
      const upd = await as(handle.db, userA, (tx) =>
        tx
          .update(t.projects)
          .set({ name: "x" })
          .where(sql`${t.projects.id} = ${DEMO}`)
          .returning(),
      );
      expect(upd).toEqual([]);
    });
  });

  describe("anonymous visitor (anon role)", () => {
    it("reads only the demo project and its rows", async () => {
      const seen = await as(handle.db, visitor, (tx) =>
        tx.select({ id: t.projects.id, isDemo: t.projects.isDemo }).from(t.projects),
      );
      expect(seen.length).toBeGreaterThan(0);
      expect(seen.every((p) => p.isDemo)).toBe(true);
      expect(ids(seen)).toContain(DEMO);
      for (const table of PROJECT_TABLES) {
        const rows = await as(handle.db, visitor, (tx) =>
          tx.execute<{ n: number }>(
            sql`select count(*)::int as n from ${sql.identifier(table)} t where not exists (select 1 from projects p where p.id = t.project_id and p.is_demo)`,
          ),
        );
        expect([...rows][0]?.n, table).toBe(0);
      }
      const evidence = await as(handle.db, visitor, (tx) => tx.select().from(t.evidenceCandidates));
      expect(evidence.filter((e) => e.projectId === DEMO)).toHaveLength(4);
    });

    it("cannot write anywhere, not even to the demo", async () => {
      const newProject = as(handle.db, visitor, (tx) =>
        tx
          .insert(t.projects)
          .values({ id: `${TEST_PROJECT_PREFIX}anon`, name: "x", ownerId: null }),
      );
      expect(await sqlState(newProject)).toBe("42501");
      const demoChild = as(handle.db, visitor, (tx) =>
        tx
          .insert(t.checklistItems)
          .values({ id: `${DEMO}-anon`, projectId: DEMO, label: "x", position: 9 }),
      );
      expect(await sqlState(demoChild)).toBe("42501");
      const upd = await as(handle.db, visitor, (tx) =>
        tx
          .update(t.projects)
          .set({ name: "x" })
          .where(sql`${t.projects.id} = ${DEMO}`)
          .returning(),
      );
      expect(upd).toEqual([]);
      const del = await as(handle.db, visitor, (tx) =>
        tx
          .delete(t.evidenceCandidates)
          .where(sql`${t.evidenceCandidates.projectId} = ${DEMO}`)
          .returning(),
      );
      expect(del).toEqual([]);
    });
  });
});
