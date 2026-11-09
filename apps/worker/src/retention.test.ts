import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadConfig } from "./config";
import { startRetentionTimer } from "./retention";

describe("retention timer (ingestion 5.4, ADR 0008)", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("purges once at start and then every interval, with the configured days", async () => {
    const purge = vi.fn(async () => ({ projectIds: ["a", "b"], files: 3 }));
    const events: [string, Record<string, string | number> | undefined][] = [];
    const t = startRetentionTimer({
      purge,
      intervalMs: 3_600_000,
      days: 7,
      now: () => new Date("2026-11-09T00:00:00.000Z"),
      log: (e, f) => events.push([e, f]),
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(purge).toHaveBeenCalledTimes(1);
    expect(purge).toHaveBeenCalledWith(new Date("2026-11-09T00:00:00.000Z"), 7);
    await vi.advanceTimersByTimeAsync(3_600_000 * 2);
    expect(purge).toHaveBeenCalledTimes(3);
    t.stop();
    await vi.advanceTimersByTimeAsync(3_600_000 * 5);
    expect(purge).toHaveBeenCalledTimes(3);
    // Counts only: no project id reaches the log.
    expect(events[0]).toEqual(["retention_purged", { projects: 2, files: 3 }]);
    expect(JSON.stringify(events)).not.toMatch(/"a"|"b"/);
  });

  it("logs a failure and tries again on the next tick", async () => {
    let calls = 0;
    const purge = vi.fn(async () => {
      calls += 1;
      if (calls === 1) throw new TypeError("storage is down: secret-path/123");
      return { projectIds: [], files: 0 };
    });
    const events: string[] = [];
    const t = startRetentionTimer({
      purge,
      intervalMs: 1000,
      days: 7,
      log: (e, f) => events.push(`${e} ${JSON.stringify(f)}`),
    });
    await vi.advanceTimersByTimeAsync(1000);
    t.stop();
    expect(events[0]).toBe('retention_failed {"error":"TypeError"}');
    expect(events[1]).toBe('retention_purged {"projects":0,"files":0}');
    expect(events.join()).not.toContain("secret-path");
  });

  it("never runs two purges at once", async () => {
    let release: () => void = () => undefined;
    const purge = vi.fn(
      () =>
        new Promise<{ projectIds: string[]; files: number }>((r) => {
          release = () => r({ projectIds: [], files: 0 });
        }),
    );
    const t = startRetentionTimer({ purge, intervalMs: 1000, days: 7 });
    await vi.advanceTimersByTimeAsync(5000);
    expect(purge).toHaveBeenCalledTimes(1);
    release();
    await vi.advanceTimersByTimeAsync(1000);
    expect(purge).toHaveBeenCalledTimes(2);
    t.stop();
  });

  it("reads the interval and period from the environment, hourly and 7 days by default", () => {
    expect(loadConfig({})).toMatchObject({
      RETENTION_INTERVAL_MS: 3_600_000,
      ANONYMOUS_RETENTION_DAYS: 7,
    });
    expect(
      loadConfig({ RETENTION_INTERVAL_MS: "60000", ANONYMOUS_RETENTION_DAYS: "3" }),
    ).toMatchObject({ RETENTION_INTERVAL_MS: 60_000, ANONYMOUS_RETENTION_DAYS: 3 });
  });
});
