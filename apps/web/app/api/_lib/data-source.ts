import { createFixtureStore, StoreError, type Actor, type ProjectStore } from "@sleuth/db/fixture";

export type DataMode = "fixture" | "supabase";

export function dataMode(): DataMode {
  return process.env.SLEUTH_DATA_MODE === "supabase" ? "supabase" : "fixture";
}

// Keep one store across hot reloads so edits made in the UI survive until the server restarts.
const globalForStore = globalThis as unknown as { __sleuthFixtureStore?: ProjectStore };

/** The store for the current data mode. Supabase mode arrives with the ingestion spec. */
export function getStore(): ProjectStore {
  if (dataMode() === "supabase") {
    throw new StoreError(
      "not_implemented",
      501,
      "Supabase mode is not implemented yet. Unset SLEUTH_DATA_MODE to use the fixture.",
    );
  }
  globalForStore.__sleuthFixtureStore ??= createFixtureStore();
  return globalForStore.__sleuthFixtureStore;
}

/**
 * Who is calling. Fixture mode trusts the `x-fixture-user` header so the frontend can try
 * signed-in and signed-out views: a user id, or `anonymous`. No header means `fixture-user`.
 * Supabase mode will read the session instead (ingestion spec).
 */
export function resolveActor(req: Request): Actor {
  if (dataMode() === "supabase") {
    throw new StoreError("not_implemented", 501, "Supabase sign-in is not implemented yet.");
  }
  const header = req.headers.get("x-fixture-user")?.trim();
  if (header === "anonymous") return { userId: null };
  return { userId: header && header.length > 0 ? header.slice(0, 64) : "fixture-user" };
}

/** Visitor view for server-rendered pages: the public demo is always readable. */
export const VISITOR: Actor = { userId: null };
