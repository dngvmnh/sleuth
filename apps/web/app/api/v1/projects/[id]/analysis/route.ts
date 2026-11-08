import { endpoint } from "../../../../_lib/api";

export const dynamic = "force-dynamic";

export const POST = endpoint("startAnalysis", async ({ actor, store, params, body }) => ({
  job: await store.startAnalysis(actor, params.id ?? "", body),
}));
