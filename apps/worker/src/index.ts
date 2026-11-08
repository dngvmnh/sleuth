import { randomUUID } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig } from "./config";
import { createFixtureQueue } from "./fixture-queue";
import { createFixtureHandler, supabaseHandler } from "./handlers";
import { runLoop } from "./loop";
import { createPgQueue } from "./pg-queue";

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

  const { queue, close } = createPgQueue(
    config.DATABASE_URL as string,
    config.WORKER_STALE_SECONDS,
  );
  try {
    await runLoop({ ...common, queue, handler: supabaseHandler });
  } finally {
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
