import { afterAll, beforeAll, describe, vi } from "vitest";
import { runChangeImpactContract } from "../change-impact-contract";
import { createSupabaseStore, type SupabaseStore } from "./store";
import {
  deleteTestProjects,
  openTestDb,
  TEST_PROJECT_PREFIX,
  testDatabaseUrl,
  testUser,
} from "./test-support";

// Change-impact task 9: the same random-history invariants the fixture store passes, against the
// real database. Every history runs in its own copy of the demo, owned by a test-namespace user,
// and every copy is deleted afterwards.
const url = testDatabaseUrl();
if (!url) {
  console.warn("[supabase change-impact] TEST_DATABASE_URL is not set: the suite is skipped.");
}
vi.setConfig({ testTimeout: 900_000, hookTimeout: 60_000 });

let handle: ReturnType<typeof openTestDb>;
let store: SupabaseStore;

if (url) {
  beforeAll(async () => {
    handle = openTestDb();
    store = createSupabaseStore({ db: handle.db, dailyAnalysisLimit: 10_000 });
    await deleteTestProjects(handle.db, "impact");
  }, 60_000);
  afterAll(async () => {
    await deleteTestProjects(handle.db, "impact");
    await handle.close();
  }, 60_000);

  runChangeImpactContract("SupabaseStore", () => store, {
    actor: { userId: testUser("impact", 1) },
    projectName: `${TEST_PROJECT_PREFIX}impact`,
    // Each step is many round trips to a remote database, so fewer and shorter histories.
    numRuns: Number(process.env.CHANGE_IMPACT_RUNS) || 6,
    maxSteps: 8,
  });
} else {
  describe.skip("SupabaseStore: change-impact invariants over random histories", () => {});
}
