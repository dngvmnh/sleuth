import { endpoint } from "../../../../_lib/api";

export const dynamic = "force-dynamic";

export const GET = endpoint("getCoverage", async ({ actor, store, params }) =>
  store.getCoverage(actor, params.id ?? ""),
);
