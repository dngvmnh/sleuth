import { endpoint } from "../../_lib/api";

export const dynamic = "force-dynamic";

export const GET = endpoint("listProjects", async ({ actor, store }) => ({
  projects: await store.listProjects(actor),
}));

export const POST = endpoint("createProject", async ({ actor, store, body }) => ({
  project: await store.createProject(actor, body),
}));
