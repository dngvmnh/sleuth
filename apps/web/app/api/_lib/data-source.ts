import { createDb } from "@sleuth/db";
import { createFixtureStore, StoreError, type Actor, type ProjectStore } from "@sleuth/db/fixture";
import { createSupabaseStore, storageFromEnv } from "@sleuth/db/supabase";
import {
  authConfigFromEnv,
  createSupabaseSessionVerifier,
  type SessionVerifier,
} from "./supabase-server";

export type DataMode = "fixture" | "supabase";

/** Blank or invalid env values count as unset, so the store default applies. */
function positiveInt(value: string | undefined): number | undefined {
  const n = Number(value);
  return value && Number.isInteger(n) && n > 0 ? n : undefined;
}
function seconds(value: string | undefined): number | undefined {
  const n = positiveInt(value);
  return n === undefined ? undefined : n * 1000;
}

export function dataMode(): DataMode {
  return process.env.SLEUTH_DATA_MODE === "supabase" ? "supabase" : "fixture";
}

const limits = () => ({
  dailyAnalysisLimit: positiveInt(process.env.DAILY_ANALYSIS_LIMIT_PER_USER),
  maxVideoMs: seconds(process.env.MAX_VIDEO_SECONDS),
});

// Keep one store across hot reloads: the fixture keeps UI edits, Supabase keeps one pool.
const globalForStore = globalThis as unknown as {
  __sleuthFixtureStore?: ProjectStore;
  __sleuthSupabaseStore?: ProjectStore;
  __sleuthVerifier?: SessionVerifier;
};

const notConfigured = (what: string) =>
  new StoreError(
    "not_configured",
    501,
    `Supabase mode needs ${what}. Unset SLEUTH_DATA_MODE to use the fixture.`,
  );

/** The store for the current data mode. */
export function getStore(): ProjectStore {
  if (dataMode() === "supabase") {
    if (!globalForStore.__sleuthSupabaseStore) {
      const url = process.env.DATABASE_URL?.trim();
      if (!url) throw notConfigured("DATABASE_URL");
      globalForStore.__sleuthSupabaseStore = createSupabaseStore({
        // Each Vercel instance holds at most 2 connections and frees them after 10 idle seconds.
        // With the default (5, never idle out), three warm instances filled the session pooler's
        // 15 slots on 14 Nov 2026 and every write returned 500 (EMAXCONNSESSION).
        db: createDb(url, { max: 2, idleTimeoutSeconds: 10 }).db,
        storage: storageFromEnv() ?? undefined,
        ...limits(),
      });
    }
    return globalForStore.__sleuthSupabaseStore;
  }
  globalForStore.__sleuthFixtureStore ??= createFixtureStore(limits());
  return globalForStore.__sleuthFixtureStore;
}

/** Tests only: replace how Supabase mode checks a session. Pass undefined to restore. */
export function setSessionVerifierForTests(verifier: SessionVerifier | undefined): void {
  globalForStore.__sleuthVerifier = verifier;
}

function verifier(): SessionVerifier {
  if (!globalForStore.__sleuthVerifier) {
    const config = authConfigFromEnv();
    if (!config) throw notConfigured("NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY");
    globalForStore.__sleuthVerifier = createSupabaseSessionVerifier(config);
  }
  return globalForStore.__sleuthVerifier;
}

/**
 * Who is calling.
 * - Fixture mode trusts the `x-fixture-user` header so the frontend can try signed-in and
 *   signed-out views: a user id, or `anonymous`. No header means `fixture-user`.
 * - Supabase mode ignores that header. The caller is whoever Supabase Auth says the session
 *   belongs to (anonymous sign-in included), or a visitor (`userId: null`).
 */
export async function resolveActor(req: Request): Promise<Actor> {
  if (dataMode() === "supabase") {
    return { userId: await verifier()(req) };
  }
  const header = req.headers.get("x-fixture-user")?.trim();
  if (header === "anonymous") return { userId: null };
  return { userId: header && header.length > 0 ? header.slice(0, 64) : "fixture-user" };
}

/** Visitor view for server-rendered pages: the public demo is always readable. */
export const VISITOR: Actor = { userId: null };
