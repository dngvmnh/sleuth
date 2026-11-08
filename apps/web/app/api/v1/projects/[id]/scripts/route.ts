import { endpoint } from "../../../../_lib/api";

export const dynamic = "force-dynamic";

export const POST = endpoint("createScript", async ({ actor, store, params, body }) =>
  store.createScript(actor, params.id ?? "", body.text),
);
