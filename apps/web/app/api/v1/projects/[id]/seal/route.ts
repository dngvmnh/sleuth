import { endpoint } from "../../../../_lib/api";

export const dynamic = "force-dynamic";

export const POST = endpoint("sealProject", async ({ actor, store, params, body }) => ({
  seal: await store.sealProject(actor, params.id ?? "", body.note),
}));
