import { endpoint } from "../../../../../_lib/api";

export const dynamic = "force-dynamic";

export const POST = endpoint("createUploadUrl", async ({ actor, store, params, body }) =>
  store.createUploadUrl(actor, params.id ?? "", body),
);
