import type { PurgeResult } from "@sleuth/db";

export interface RetentionTimerOptions {
  /** The store's `purgeExpiredAnonymousProjects`. */
  purge: (now: Date, days: number) => Promise<PurgeResult>;
  /** How often to run. ADR 0008: once an hour. */
  intervalMs: number;
  /** Retention period. ADR 0008: 7 days. */
  days: number;
  now?: () => Date;
  log?: (event: string, fields?: Record<string, string | number>) => void;
}

export interface RetentionTimer {
  /** Run one purge now. Never throws: a failure is logged and the next run tries again. */
  runOnce(): Promise<void>;
  /** Stops the timer and resolves when a purge that is running has ended, so its pool can close. */
  stop(): Promise<void>;
}

/**
 * One purge, awaited. Never throws: a failure is logged. Used by `--once` runs (a scheduled
 * GitHub Actions job), which have no timer.
 */
export async function purgeOnce(o: RetentionTimerOptions): Promise<void> {
  const log = o.log ?? (() => undefined);
  try {
    const result = await o.purge((o.now ?? (() => new Date()))(), o.days);
    log("retention_purged", { projects: result.projectIds.length, files: result.files });
  } catch (err) {
    log("retention_failed", { error: err instanceof Error ? err.name : "unknown" });
  }
}

/**
 * Ingestion 5.4 and ADR 0008: delete anonymous projects older than `days`, once at start and then
 * every `intervalMs`. Runs never overlap. Logs counts only, never project ids or names.
 */
export function startRetentionTimer(o: RetentionTimerOptions): RetentionTimer {
  let current: Promise<void> | null = null;

  function runOnce(): Promise<void> {
    if (current) return current;
    current = purgeOnce(o).finally(() => {
      current = null;
    });
    return current;
  }

  void runOnce();
  const timer = setInterval(() => void runOnce(), o.intervalMs);
  // The purge timer alone must not keep the process alive.
  timer.unref?.();
  return {
    runOnce,
    async stop() {
      clearInterval(timer);
      // purgeOnce never throws, so this only waits.
      if (current) await current;
    },
  };
}
