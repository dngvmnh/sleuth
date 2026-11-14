/**
 * Starts the worker workflow on GitHub Actions when a job is queued, so a visitor's job does not
 * wait for GitHub's cron alone (ADR 0009, amendment of 14 Nov). The 10-minute schedule stays as the
 * second path; the workflow's concurrency group keeps runs from overlapping.
 *
 * Server only. Needs `WORKER_DISPATCH_TOKEN`: a fine-grained token for this one repository with
 * "Actions: Read and write" and nothing else, set in Vercel for Production only. Without it, or in
 * fixture mode, nothing is sent.
 *
 * It never throws and never logs the token, the URL with a token, or GitHub's reply text. Logs say
 * only `worker_dispatch` and a short result word.
 */

export type DispatchResult =
  "sent" | "skipped_fixture" | "skipped_no_token" | "skipped_recent" | "refused" | "failed";

export interface DispatchOptions {
  env?: Record<string, string | undefined>;
  fetchImpl?: typeof fetch;
  now?: () => number;
  log?: (event: string, fields: Record<string, string | number>) => void;
}

/** Repository and workflow to start. Fixed: this app only ever starts its own worker. */
const REPO = "dngvmnh/sleuth";
const WORKFLOW = "worker.yml";
/** One start per server instance per minute is enough; a started run takes every queued job. */
export const DISPATCH_MIN_INTERVAL_MS = 60_000;
/** The visitor waits for this call, so it is short. GitHub usually answers in well under 1 s. */
export const DISPATCH_TIMEOUT_MS = 3_000;

const state = globalThis as unknown as { __sleuthLastWorkerDispatch?: number };

/** Tests only: forget the last start time. */
export function resetWorkerDispatchForTests(): void {
  state.__sleuthLastWorkerDispatch = undefined;
}

export async function requestWorkerRun(options: DispatchOptions = {}): Promise<DispatchResult> {
  const env = options.env ?? process.env;
  const now = options.now ?? Date.now;
  const log =
    options.log ??
    ((event: string, fields: Record<string, string | number>) =>
      console.log(JSON.stringify({ event, ...fields })));
  const done = (result: DispatchResult, extra: Record<string, string | number> = {}) => {
    if (result !== "skipped_fixture" && result !== "skipped_no_token")
      log("worker_dispatch", { result, ...extra });
    return result;
  };

  if (env.SLEUTH_DATA_MODE !== "supabase") return done("skipped_fixture");
  const token = env.WORKER_DISPATCH_TOKEN?.trim();
  if (!token) return done("skipped_no_token");
  const last = state.__sleuthLastWorkerDispatch;
  if (last !== undefined && now() - last < DISPATCH_MIN_INTERVAL_MS) return done("skipped_recent");
  state.__sleuthLastWorkerDispatch = now();

  try {
    const res = await (options.fetchImpl ?? fetch)(
      `https://api.github.com/repos/${REPO}/actions/workflows/${WORKFLOW}/dispatches`,
      {
        method: "POST",
        headers: {
          accept: "application/vnd.github+json",
          authorization: `Bearer ${token}`,
          "x-github-api-version": "2022-11-28",
          "content-type": "application/json",
          "user-agent": "sleuth-web",
        },
        body: JSON.stringify({ ref: "main" }),
        signal: AbortSignal.timeout(DISPATCH_TIMEOUT_MS),
      },
    );
    // 204 No Content means GitHub accepted it. Anything else: the status code only.
    if (res.status === 204) return done("sent");
    // A refused start may be retried by the next request, not blocked for a minute.
    state.__sleuthLastWorkerDispatch = undefined;
    return done("refused", { status: res.status });
  } catch {
    state.__sleuthLastWorkerDispatch = undefined;
    return done("failed");
  }
}
