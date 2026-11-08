import { endpoint } from "../../../../_lib/api";

export const dynamic = "force-dynamic";

export const GET = endpoint("listEvidence", async ({ actor, store, params }) => ({
  evidence: await store.listEvidence(actor, params.id ?? ""),
}));
