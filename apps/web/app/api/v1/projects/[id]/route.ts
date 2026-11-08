import { endpoint } from "../../../_lib/api";

export const dynamic = "force-dynamic";

export const GET = endpoint("getProject", async ({ actor, store, params }) =>
  store.getProjectDetail(actor, params.id ?? ""),
);
