import { randomUUID } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig } from "./config";
import { createFixtureQueue } from "./fixture-queue";
import { createFixtureHandler } from "./handlers";
import { runLoop } from "./loop";
import { createDb, createSupabaseStore, createWorkerStore, storageFromEnv } from "@sleuth/db";
import { createPgQueue } from "./pg-queue";
import { createProviders } from "./providers";
import { purgeOnce, startRetentionTimer } from "./retention";
import { createSupabaseHandler } from "./supabase-handler";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const config = loadConfig(process.env);
const once = process.argv.includes("--once");
const workerId = `worker-${randomUUID().slice(0, 8)}`;
const abort = new AbortController();
for (const sig of ["SIGINT", "SIGTERM"] as const) process.on(sig, () => abort.abort());

const log = (event: string, fields: Record<string, string | number> = {}) =>
  console.log(JSON.stringify({ at: new Date().toISOString(), event, ...fields }));

async function main() {
  log("start", { mode: config.SLEUTH_DATA_MODE, workerId, once: once ? 1 : 0 });
  const common = {
    workerId,
    pollMs: config.WORKER_POLL_MS,
    heartbeatMs: config.WORKER_HEARTBEAT_MS,
    once,
    signal: abort.signal,
    log,
  };

  if (config.SLEUTH_DATA_MODE === "fixture") {
    const outDir = join(repoRoot, ".sleuth-out");
    await runLoop({
      ...common,
      queue: createFixtureQueue(join(repoRoot, "fixtures", "golden", "proofpay-demo"), outDir),
      handler: createFixtureHandler({
        outDir,
        maxFrames: config.MAX_FRAMES_PER_VIDEO,
        maxVideoSeconds: config.MAX_VIDEO_SECONDS,
      }),
    });
    return;
  }

  // Fail at start-up, not job by job, when the providers are not usable (evidence-analysis 2.1).
  const providers = createProviders(config, (usage) =>
    log("provider_usage", {
      provider: usage.provider,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
    }),
  );
  if (config.ALLOW_MOCK_PROVIDERS)
    log("mock_providers", { warning: "results are not a real analysis" });
  // Counts only: which video provider, and how many owners may have frames sent (D-4).
  log("video_analysis", {
    provider: providers.videoAnalysis?.name ?? "none",
    frameOwners:
      config.VIDEO_ANALYSIS_PROVIDER === "gemini" ? config.VIDEO_ANALYSIS_OWNER_IDS.length : 0,
  });
  const { queue, close } = createPgQueue(
    config.DATABASE_URL as string,
    config.WORKER_STALE_SECONDS,
  );
  // Retention (ingestion 5.4, ADR 0008): purge old anonymous projects. A long-running worker does
  // it hourly on a timer; a `--once` run (scheduled job) does one purge before it takes jobs.
  const retentionDb = createDb(config.DATABASE_URL as string, { max: 1 });
  const retentionOptions = {
    purge: createSupabaseStore({
      db: retentionDb.db,
      storage: storageFromEnv() ?? undefined,
    }).purgeExpiredAnonymousProjects,
    intervalMs: config.RETENTION_INTERVAL_MS,
    days: config.ANONYMOUS_RETENTION_DAYS,
    log,
  };
  if (once) await purgeOnce(retentionOptions);
  const retention = once ? null : startRetentionTimer(retentionOptions);
  const workerDb = createDb(config.DATABASE_URL as string, { max: 2 });
  const handler = createSupabaseHandler({
    store: createWorkerStore({ db: workerDb.db, storage: storageFromEnv() ?? undefined }),
    providers,
    workerId,
    maxVideoSeconds: config.MAX_VIDEO_SECONDS,
    maxVideoBytes: config.MAX_VIDEO_BYTES,
    maxFrames: config.MAX_FRAMES_PER_VIDEO,
    log,
  });
  try {
    await runLoop({ ...common, queue, handler });
  } finally {
    // Wait for a running purge before its pool closes (review 001, finding 1).
    await retention?.stop();
    await workerDb.client.end({ timeout: 5 });
    await retentionDb.client.end({ timeout: 5 });
    await close();
  }
}

main().then(
  () => log("stopped"),
  (err: unknown) => {
    log("crashed", { error: err instanceof Error ? err.message.slice(0, 200) : "unknown" });
    process.exit(1);
  },
);
