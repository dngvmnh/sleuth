import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DISPATCH_MIN_INTERVAL_MS,
  requestWorkerRun,
  resetWorkerDispatchForTests,
} from "./worker-dispatch";

const TOKEN = "github_pat_fake_do_not_print";
const supabase = { SLEUTH_DATA_MODE: "supabase", WORKER_DISPATCH_TOKEN: TOKEN };

function setup(status = 204) {
  const fetchImpl = vi.fn(async () => new Response(null, { status }));
  const logs: unknown[] = [];
  let t = 1_000_000;
  return {
    fetchImpl,
    logs,
    advance: (ms: number) => (t += ms),
    opts: (env: Record<string, string | undefined> = supabase) => ({
      env,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      now: () => t,
      log: (event: string, fields: Record<string, string | number>) => logs.push({ event, fields }),
    }),
  };
}

afterEach(() => resetWorkerDispatchForTests());

describe("requestWorkerRun", () => {
  it("starts worker.yml on main with the token, and reports sent on 204", async () => {
    const s = setup();
    expect(await requestWorkerRun(s.opts())).toBe("sent");
    expect(s.fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = s.fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(
      "https://api.github.com/repos/dngvmnh/sleuth/actions/workflows/worker.yml/dispatches",
    );
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({ ref: "main" });
    const headers = init.headers as Record<string, string>;
    expect(headers.authorization).toBe(`Bearer ${TOKEN}`);
    expect(headers["x-github-api-version"]).toBe("2022-11-28");
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("sends nothing in fixture mode or without a token", async () => {
    const s = setup();
    expect(await requestWorkerRun(s.opts({ WORKER_DISPATCH_TOKEN: TOKEN }))).toBe(
      "skipped_fixture",
    );
    expect(await requestWorkerRun(s.opts({ SLEUTH_DATA_MODE: "supabase" }))).toBe(
      "skipped_no_token",
    );
    expect(
      await requestWorkerRun(s.opts({ SLEUTH_DATA_MODE: "supabase", WORKER_DISPATCH_TOKEN: "  " })),
    ).toBe("skipped_no_token");
    expect(s.fetchImpl).not.toHaveBeenCalled();
  });

  it("logs a missing token in Supabase mode, so it shows in the runtime logs", async () => {
    const s = setup();
    await requestWorkerRun(s.opts({ SLEUTH_DATA_MODE: "supabase" }));
    await requestWorkerRun(s.opts({ WORKER_DISPATCH_TOKEN: TOKEN }));
    expect(s.logs).toEqual([{ event: "worker_dispatch", fields: { result: "skipped_no_token" } }]);
  });

  it("starts at most once a minute per server", async () => {
    const s = setup();
    expect(await requestWorkerRun(s.opts())).toBe("sent");
    s.advance(DISPATCH_MIN_INTERVAL_MS - 1);
    expect(await requestWorkerRun(s.opts())).toBe("skipped_recent");
    s.advance(1);
    expect(await requestWorkerRun(s.opts())).toBe("sent");
    expect(s.fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("does not throw when GitHub refuses or the network fails, and lets the next request retry", async () => {
    const refused = setup(403);
    expect(await requestWorkerRun(refused.opts())).toBe("refused");
    expect(await requestWorkerRun(refused.opts())).toBe("refused");
    expect(refused.fetchImpl).toHaveBeenCalledTimes(2);

    const broken = setup();
    broken.fetchImpl.mockRejectedValue(new Error(`boom ${TOKEN}`));
    expect(await requestWorkerRun(broken.opts())).toBe("failed");
  });

  it("never logs the token or GitHub's reply", async () => {
    const s = setup(401);
    await requestWorkerRun(s.opts());
    const broken = setup();
    broken.fetchImpl.mockRejectedValue(new Error(`network down for ${TOKEN}`));
    await requestWorkerRun(broken.opts());
    const out = JSON.stringify([...s.logs, ...broken.logs]);
    expect(out).not.toContain(TOKEN);
    expect(out).toContain('"result":"refused"');
    expect(out).toContain('"status":401');
    expect(out).toContain('"result":"failed"');
  });
});
