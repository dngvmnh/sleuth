import { endpoint } from "../../../../_lib/api";

export const dynamic = "force-dynamic";

export const GET = endpoint("listFindings", async ({ actor, store, params }) => ({
  findings: await store.listFindings(actor, params.id ?? ""),
}));
