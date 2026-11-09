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
  stop(): void;
}

/**
 * Ingestion 5.4 and ADR 0008: delete anonymous projects older than `days`, once at start and then
 * every `intervalMs`. Runs never overlap. Logs counts only, never project ids or names.
 */
export function startRetentionTimer(o: RetentionTimerOptions): RetentionTimer {
  const now = o.now ?? (() => new Date());
  const log = o.log ?? (() => undefined);
  let running = false;

  async function runOnce() {
    if (running) return;
    running = true;
    try {
      const result = await o.purge(now(), o.days);
      log("retention_purged", { projects: result.projectIds.length, files: result.files });
    } catch (err) {
      log("retention_failed", { error: err instanceof Error ? err.name : "unknown" });
    } finally {
      running = false;
    }
  }

  void runOnce();
  const timer = setInterval(() => void runOnce(), o.intervalMs);
  // The purge timer alone must not keep the process alive.
  timer.unref?.();
  return { runOnce, stop: () => clearInterval(timer) };
}
