import { endpoint } from "../../../../_lib/api";

export const dynamic = "force-dynamic";

export const PATCH = endpoint("reviewEvidence", async ({ actor, store, params, body }) =>
  store.reviewEvidence(actor, params.id ?? "", body),
);
