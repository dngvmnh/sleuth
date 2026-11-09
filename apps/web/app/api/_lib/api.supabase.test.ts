import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { ListProjectsResponseSchema, CreateProjectResponseSchema } from "@sleuth/contracts";
import {
  deleteProjectsOwnedBy,
  deleteTestProjects,
  openTestDb,
  TEST_PROJECT_PREFIX,
  testDatabaseUrl,
  testUser,
} from "@sleuth/db/testing";
import { GET as listProjects, POST as createProject } from "../v1/projects/route";
import { GET as getProject } from "../v1/projects/[id]/route";
import { setSessionVerifierForTests } from "./data-source";
import { authConfigFromEnv, createSupabaseSessionVerifier } from "./supabase-server";

// Supabase mode against the dev database. Test users come from a fixed namespace; every project
// this file makes is removed afterwards. The seeded demo is only read.
const configured = Boolean(testDatabaseUrl() && authConfigFromEnv());
if (!configured) {
  console.warn("[api supabase] database or Supabase keys are not set: the suite is skipped.");
}
const suite = configured ? describe : describe.skip;
vi.setConfig({ testTimeout: 120_000, hookTimeout: 60_000 });

const DEMO = "proofpay-demo";
const ctx = (params: Record<string, string> = {}) => ({ params: Promise.resolve(params) });
const req = (method: string, headers: Record<string, string>, body?: unknown) =>
  new Request("http://localhost/x", {
    method,
    headers: { "content-type": "application/json", ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });

/** Stands in for Supabase Auth: only `Bearer good-<n>` is a real session. */
const fakeVerifier = async (r: Request) => {
  const m = /^Bearer good-(\d)$/.exec(r.headers.get("authorization") ?? "");
  return m ? testUser("web", Number(m[1])) : null;
};
const signedIn = (n: number) => ({ authorization: `Bearer good-${n}` });

suite("API routes in Supabase mode", () => {
  let handle: ReturnType<typeof openTestDb>;
  const oldMode = process.env.SLEUTH_DATA_MODE;
  const oldUrl = process.env.DATABASE_URL;

  beforeAll(async () => {
    process.env.SLEUTH_DATA_MODE = "supabase";
    process.env.DATABASE_URL = testDatabaseUrl();
    handle = openTestDb();
    await deleteTestProjects(handle.db, "web");
  }, 60_000);

  afterAll(async () => {
    setSessionVerifierForTests(undefined);
    await deleteTestProjects(handle.db, "web");
    await handle.close();
    process.env.SLEUTH_DATA_MODE = oldMode;
    process.env.DATABASE_URL = oldUrl;
  }, 60_000);

  describe("with a stand-in verifier", () => {
    beforeAll(() => setSessionVerifierForTests(fakeVerifier));

    it("lets a verified user create a project and read it back", async () => {
      const res = await createProject(
        req("POST", signedIn(1), { name: `${TEST_PROJECT_PREFIX}api` }),
        ctx(),
      );
      expect(res.status).toBe(201);
      const { project } = CreateProjectResponseSchema.parse(await res.json());
      expect(project.ownerId).toBe(testUser("web", 1));
      expect((await getProject(req("GET", signedIn(1)), ctx({ id: project.id }))).status).toBe(200);
      expect((await getProject(req("GET", signedIn(2)), ctx({ id: project.id }))).status).toBe(404);
      const list = ListProjectsResponseSchema.parse(
        await (await listProjects(req("GET", signedIn(1)), ctx())).json(),
      );
      expect(list.projects.map((p) => p.id)).toEqual([DEMO, project.id]);
    });

    it("ignores a forged x-fixture-user header: the caller stays a visitor", async () => {
      const forged = { "x-fixture-user": testUser("web", 1) };
      const res = await createProject(
        req("POST", forged, { name: `${TEST_PROJECT_PREFIX}x` }),
        ctx(),
      );
      expect(res.status).toBe(401);
      const list = ListProjectsResponseSchema.parse(
        await (await listProjects(req("GET", forged), ctx())).json(),
      );
      expect(list.projects.map((p) => p.id)).toEqual([DEMO]);
    });

    it("treats a bad token as a visitor, who still sees the demo", async () => {
      const bad = { authorization: "Bearer good-1-but-forged" };
      expect((await createProject(req("POST", bad, { name: "x" }), ctx())).status).toBe(401);
      expect((await getProject(req("GET", bad), ctx({ id: DEMO }))).status).toBe(200);
    });
  });

  describe("with the real Supabase Auth verifier", () => {
    const config = authConfigFromEnv();
    const verify = config ? createSupabaseSessionVerifier(config) : async () => null;
    const createdUsers: string[] = [];

    afterAll(async () => {
      const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
      if (!config || !serviceKey) return;
      const admin = createClient(config.url, serviceKey, { auth: { persistSession: false } });
      for (const id of createdUsers) {
        await deleteProjectsOwnedBy(handle.db, id);
        await admin.auth.admin.deleteUser(id);
      }
    }, 60_000);

    it("finds no user without a session, and none for a forged token or cookie", async () => {
      expect(await verify(req("GET", {}))).toBeNull();
      expect(await verify(req("GET", { authorization: "Bearer not.a.jwt" }))).toBeNull();
      expect(
        await verify(req("GET", { cookie: "sb-x-auth-token=base64-eyJmb3JnZWQiOnRydWV9" })),
      ).toBeNull();
    });

    it("signs in anonymously, creates a project, and cannot read another user's", async (t) => {
      if (!config) return t.skip();
      const browser = createClient(config.url, config.anonKey, { auth: { persistSession: false } });
      const { data, error } = await browser.auth.signInAnonymously();
      if (error || !data.session || !data.user) {
        console.warn("[api supabase] anonymous sign-in is not enabled on this project.");
        return t.skip();
      }
      createdUsers.push(data.user.id);
      setSessionVerifierForTests(verify);
      const token = { authorization: `Bearer ${data.session.access_token}` };
      expect(await verify(req("GET", token))).toBe(data.user.id);

      const res = await createProject(
        req("POST", token, { name: `${TEST_PROJECT_PREFIX}anon` }),
        ctx(),
      );
      expect(res.status).toBe(201);
      const { project } = CreateProjectResponseSchema.parse(await res.json());
      expect(project.ownerId).toBe(data.user.id);

      // Someone else's project, made through the stand-in verifier above.
      setSessionVerifierForTests(fakeVerifier);
      const other = CreateProjectResponseSchema.parse(
        await (
          await createProject(
            req("POST", signedIn(3), { name: `${TEST_PROJECT_PREFIX}other` }),
            ctx(),
          )
        ).json(),
      ).project;
      setSessionVerifierForTests(verify);
      expect((await getProject(req("GET", token), ctx({ id: other.id }))).status).toBe(404);
      expect((await getProject(req("GET", token), ctx({ id: project.id }))).status).toBe(200);
    });
  });
});
