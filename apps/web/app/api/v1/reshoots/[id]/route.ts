import { endpoint } from "../../../_lib/api";

export const dynamic = "force-dynamic";

export const PATCH = endpoint("updateReshoot", async ({ actor, store, params, body }) => ({
  reshoot: await store.updateReshoot(actor, params.id ?? "", body.status),
}));
