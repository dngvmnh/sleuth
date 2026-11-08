import { endpoint } from "../../../../../_lib/api";

export const dynamic = "force-dynamic";

export const GET = endpoint("getJob", async ({ actor, store, params }) => ({
  job: await store.getJob(actor, params.id ?? "", params.jobId ?? ""),
}));
