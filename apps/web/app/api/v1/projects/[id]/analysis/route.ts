import { endpoint } from "../../../../_lib/api";
import { requestWorkerRun } from "../../../../_lib/worker-dispatch";

export const dynamic = "force-dynamic";

export const POST = endpoint("startAnalysis", async ({ actor, store, params, body, headers }) => {
  const job = await store.startAnalysis(actor, params.id ?? "", body);
  // Start the worker now instead of waiting for the next cron run (ADR 0009). It never throws and
  // waits at most a few seconds; the job is already saved, so a failed start only means the
  // scheduled run picks it up.
  // The result word (sent, skipped_no_token, refused, ...) is safe to show; it holds no secret.
  headers.set(
    "x-sleuth-worker-dispatch",
    job.status === "queued" ? await requestWorkerRun() : "not_queued",
  );
  return { job };
});
