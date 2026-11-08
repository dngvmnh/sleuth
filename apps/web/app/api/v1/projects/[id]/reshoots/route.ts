import { endpoint } from "../../../../_lib/api";

export const dynamic = "force-dynamic";

export const POST = endpoint("createReshoot", async ({ actor, store, params, body }) => ({
  reshoot: await store.createReshoot(actor, params.id ?? "", body),
}));
