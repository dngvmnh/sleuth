import { endpoint } from "../../../../_lib/api";
import { buildHtml } from "../../../../_lib/report";

export const dynamic = "force-dynamic";

export const GET = endpoint("reportHtml", async ({ actor, store, params }) =>
  buildHtml(await store.getReportData(actor, params.id ?? "")),
);
