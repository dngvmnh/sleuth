import { endpoint } from "../../../../_lib/api";
import { buildCsv } from "../../../../_lib/report";

export const dynamic = "force-dynamic";

export const GET = endpoint("reportCsv", async ({ actor, store, params }) =>
  buildCsv(await store.getReportData(actor, params.id ?? "")),
);
