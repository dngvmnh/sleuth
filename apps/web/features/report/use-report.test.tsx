import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { CoverageSummary, ReshootTask } from "@sleuth/contracts";
import { createApiClient } from "@/lib/api-client";
import { detail, finding, json } from "../workspace/test-fixtures";
import { useReport } from "./use-report";

const COVERAGE: CoverageSummary = {
  items: [{ checklistItemId: "c1", state: "needs_review", evidenceIds: ["e1"] }],
  totals: { proven: 0, needs_review: 1, outside_proof: 0, reshoot: 0, uncovered: 0 },
  provenPercent: 0,
  outsideProof: [],
  openReshootIds: ["r1"],
};

const RESHOOT: ReshootTask = {
  id: "r1",
  projectId: "p1",
  checklistItemId: null,
  scriptSegmentId: "s1",
  findingId: null,
  note: "Film the export button.",
  status: "open",
  createdAt: "2026-01-02T00:00:00.000Z",
};

type Route = () => Response | Promise<Response>;

/** A real typed client over a fake fetch, so every answer goes through the contract schemas. */
function reportClient(
  over: { project?: Route; coverage?: Route; reshoots?: Route; findings?: Route; patch?: Route } = {},
) {
  const calls: { url: string; method: string }[] = [];
  const routes: Record<string, Route> = {
    coverage: over.coverage ?? (() => json({ coverage: COVERAGE, seal: null, blockers: ["undecided_candidates"] })),
    reshoots: over.reshoots ?? (() => json({ reshoots: [RESHOOT] })),
    findings: over.findings ?? (() => json({ findings: [finding("f1", "cursed_frame")] })),
    project: over.project ?? (() => json(detail)),
  };
  const fetchImpl = async (url: unknown, init?: RequestInit): Promise<Response> => {
    const u = String(url);
    calls.push({ url: u, method: init?.method ?? "GET" });
    if (init?.method === "PATCH") return (over.patch ?? (() => json({ error: { code: "x", message: "no patch route" } }, 500)))();
    const key = (["coverage", "reshoots", "findings"] as const).find((k) => u.endsWith(`/${k}`)) ?? "project";
    return (routes[key] as Route)();
  };
  return { calls, client: createApiClient({ fetchImpl: fetchImpl as unknown as typeof fetch }) };
}

describe("useReport", () => {
  it("starts loading, then holds project, coverage, seal, blockers, findings and reshoots", async () => {
    const { client } = reportClient();
    const { result } = renderHook(() => useReport("p1", client));
    expect(result.current.status).toBe("loading");
    await waitFor(() => expect(result.current.status).toBe("done"));
    const data = result.current.data;
    expect(data?.project.project.name).toBe("Test project");
    expect(data?.coverage.totals.needs_review).toBe(1);
    expect(data?.seal).toBeNull();
    expect(data?.blockers).toEqual(["undecided_candidates"]);
    expect(data?.findings.map((f) => f.id)).toEqual(["f1"]);
    expect(data?.reshoots.map((r) => r.id)).toEqual(["r1"]);
  });

  it("reports not_found for a 404", async () => {
    const { client } = reportClient({
      project: () => json({ error: { code: "not_found", message: "No such project." } }, 404),
    });
    const { result } = renderHook(() => useReport("nope", client));
    await waitFor(() => expect(result.current.status).toBe("not_found"));
    expect(result.current.data).toBeUndefined();
  });

  it("reports an error with the server message, and loads after reload", async () => {
    let fail = true;
    const { client } = reportClient({
      coverage: () =>
        fail
          ? json({ error: { code: "boom", message: "Coverage is down." } }, 500)
          : json({ coverage: COVERAGE, seal: null, blockers: [] }),
    });
    const { result } = renderHook(() => useReport("p1", client));
    await waitFor(() => expect(result.current.status).toBe("error"));
    expect(result.current.errorMessage).toBe("Coverage is down.");
    fail = false;
    act(() => result.current.reload());
    expect(result.current.status).toBe("loading");
    await waitFor(() => expect(result.current.status).toBe("done"));
    expect(result.current.data?.blockers).toEqual([]);
  });

  it("treats a response that breaks the contract as an error, not as data", async () => {
    const { client } = reportClient({
      coverage: () => json({ coverage: COVERAGE, seal: null, blockers: ["made_up"] }),
    });
    const { result } = renderHook(() => useReport("p1", client));
    await waitFor(() => expect(result.current.status).toBe("error"));
    expect(result.current.data).toBeUndefined();
  });

  it("drops a late answer for a project the user already left", async () => {
    let releaseOld: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      releaseOld = resolve;
    });
    const { client } = reportClient();
    const slow = {
      ...client,
      getProject: async (id: string) => {
        if (id === "old") await gate;
        return {
          ...detail,
          project: { ...detail.project, id, name: id === "old" ? "Old project" : "New project" },
        };
      },
    };
    const { result, rerender } = renderHook(({ id }) => useReport(id, slow), { initialProps: { id: "old" } });
    rerender({ id: "new" });
    expect(result.current.status).toBe("loading");
    await waitFor(() => expect(result.current.data?.project.project.name).toBe("New project"));
    await act(async () => {
      releaseOld();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(result.current.data?.project.project.name).toBe("New project");
  });

  it("drops an answer from before a reload", async () => {
    let first = true;
    let releaseFirst: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const { client } = reportClient();
    const slow = {
      ...client,
      getCoverage: async () => {
        if (first) {
          first = false;
          await gate;
          return { coverage: COVERAGE, seal: null, blockers: ["job_running" as const] };
        }
        return { coverage: COVERAGE, seal: null, blockers: [] };
      },
    };
    const { result } = renderHook(() => useReport("p1", slow));
    act(() => result.current.reload());
    await waitFor(() => expect(result.current.status).toBe("done"));
    expect(result.current.data?.blockers).toEqual([]);
    await act(async () => {
      releaseFirst();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(result.current.data?.blockers).toEqual([]);
  });

  it("does not write after unmount", async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const { client } = reportClient();
    const slow = {
      ...client,
      getProject: async (id: string) => {
        await gate;
        return client.getProject(id);
      },
    };
    const { result, unmount } = renderHook(() => useReport("p1", slow));
    unmount();
    release();
    await Promise.resolve();
    await Promise.resolve();
    expect(result.current.status).toBe("loading");
  });

  it("reads only: it never calls the seal endpoint", async () => {
    const { client, calls } = reportClient();
    const { result } = renderHook(() => useReport("p1", client));
    await waitFor(() => expect(result.current.status).toBe("done"));
    expect(calls.some((c) => c.url.includes("/seal"))).toBe(false);
    expect(calls.every((c) => c.method === "GET")).toBe(true);
  });
});

describe("useReport reshoot updates (Final Seal task 8)", () => {
  const owned = { ...detail, project: { ...detail.project, isDemo: false, ownerId: "fixture-user" } };

  it("cannot manage the demo, and can manage an editable project the viewer can read", async () => {
    const demo = reportClient();
    const a = renderHook(() => useReport("p1", demo.client));
    await waitFor(() => expect(a.result.current.status).toBe("done"));
    expect(a.result.current.canManage).toBe(false);

    const copy = reportClient({ project: () => json(owned) });
    const b = renderHook(() => useReport("p1", copy.client));
    await waitFor(() => expect(b.result.current.status).toBe("done"));
    expect(b.result.current.canManage).toBe(true);
  });

  it("marks a reshoot done, then reloads reshoots and coverage from the API", async () => {
    let doneYet = false;
    const { client, calls } = reportClient({
      project: () => json(owned),
      patch: () => {
        doneYet = true;
        return json({ reshoot: { ...RESHOOT, status: "done" } });
      },
      reshoots: () => json({ reshoots: [{ ...RESHOOT, status: doneYet ? "done" : "open" }] }),
      // After the update the server reports no open reshoot; the item stays needs_review.
      coverage: () =>
        json({ coverage: { ...COVERAGE, openReshootIds: doneYet ? [] : ["r1"] }, seal: null, blockers: ["undecided_candidates"] }),
    });
    const { result } = renderHook(() => useReport("p1", client));
    await waitFor(() => expect(result.current.status).toBe("done"));
    let ok = false;
    await act(async () => {
      ok = await result.current.updateReshoot("r1", "done");
    });
    expect(ok).toBe(true);
    const patch = calls.find((c) => c.method === "PATCH");
    expect(patch?.url).toBe("/api/v1/reshoots/r1");
    expect(result.current.data?.reshoots[0]?.status).toBe("done");
    expect(result.current.data?.coverage.openReshootIds).toEqual([]);
    expect(result.current.data?.coverage.items[0]?.state).toBe("needs_review");
    expect(result.current.status).toBe("done");
    expect(result.current.updatingReshootId).toBeUndefined();
  });

  it("keeps the data and shows the server's message when the update fails", async () => {
    const { client } = reportClient({
      project: () => json(owned),
      patch: () => json({ error: { code: "demo_read_only", message: "The demo project is read-only." } }, 403),
    });
    const { result } = renderHook(() => useReport("p1", client));
    await waitFor(() => expect(result.current.status).toBe("done"));
    let ok = true;
    await act(async () => {
      ok = await result.current.updateReshoot("r1", "done");
    });
    expect(ok).toBe(false);
    expect(result.current.reshootError).toEqual({ reshootId: "r1", message: "The demo project is read-only." });
    expect(result.current.data?.reshoots[0]?.status).toBe("open");
  });

  it("sends one update at a time", async () => {
    let release: (r: Response) => void = () => undefined;
    const pending = new Promise<Response>((resolve) => {
      release = resolve;
    });
    const { client, calls } = reportClient({ project: () => json(owned), patch: () => pending });
    const { result } = renderHook(() => useReport("p1", client));
    await waitFor(() => expect(result.current.status).toBe("done"));
    let first: Promise<boolean> = Promise.resolve(false);
    act(() => {
      first = result.current.updateReshoot("r1", "done");
      void result.current.updateReshoot("r1", "done");
    });
    expect(result.current.updatingReshootId).toBe("r1");
    expect(calls.filter((c) => c.method === "PATCH")).toHaveLength(1);
    await act(async () => {
      release(json({ reshoot: { ...RESHOOT, status: "done" } }));
      await first;
    });
    expect(result.current.updatingReshootId).toBeUndefined();
  });
});

describe("useReport seal (Final Seal task 9)", () => {
  const owned = { ...detail, project: { ...detail.project, isDemo: false, ownerId: "fixture-user" } };
  const SEAL = {
    id: "seal-1",
    projectId: "p1",
    sealedBy: "fixture-user",
    sealedAt: "2026-02-03T04:05:06.000Z",
    scriptVersionId: "sv1",
    assetVersionId: "av1",
    coverage: COVERAGE,
    note: null,
    status: "active" as const,
    brokenAt: null,
    brokenReason: null,
  };

  function sealClient(sealRoute: Route, coverageAfter?: () => Response) {
    let sealed = false;
    const calls: { url: string; method: string; body?: unknown }[] = [];
    const fetchImpl = async (url: unknown, init?: RequestInit): Promise<Response> => {
      const u = String(url);
      calls.push({ url: u, method: init?.method ?? "GET", body: init?.body ? JSON.parse(String(init.body)) : undefined });
      if (u.endsWith("/seal")) {
        const res = await sealRoute();
        if (res.status === 201) sealed = true;
        return res;
      }
      if (u.endsWith("/coverage"))
        return sealed && coverageAfter ? coverageAfter() : json({ coverage: COVERAGE, seal: null, blockers: [] });
      if (u.endsWith("/findings")) return json({ findings: [] });
      if (u.endsWith("/reshoots")) return json({ reshoots: [] });
      return json(owned);
    };
    return { calls, client: createApiClient({ fetchImpl: fetchImpl as unknown as typeof fetch }) };
  }

  it("sends the trimmed note, then takes seal and blockers from the API", async () => {
    const { client, calls } = sealClient(
      () => json({ seal: { ...SEAL, note: "Checked." } }, 201),
      () => json({ coverage: COVERAGE, seal: { ...SEAL, note: "Checked." }, blockers: [] }),
    );
    const { result } = renderHook(() => useReport("p1", client));
    await waitFor(() => expect(result.current.status).toBe("done"));
    let out: Awaited<ReturnType<typeof result.current.seal>> = { kind: "ignored" };
    await act(async () => {
      out = await result.current.seal("  Checked.  ");
    });
    expect(out.kind).toBe("sealed");
    expect(calls.find((c) => c.url.endsWith("/seal"))?.body).toEqual({ note: "Checked." });
    expect(result.current.data?.seal?.status).toBe("active");
    expect(result.current.status).toBe("done");
  });

  it("sends an empty body for a blank note", async () => {
    const { client, calls } = sealClient(() => json({ seal: SEAL }, 201));
    const { result } = renderHook(() => useReport("p1", client));
    await waitFor(() => expect(result.current.status).toBe("done"));
    await act(async () => {
      await result.current.seal("   ");
    });
    expect(calls.find((c) => c.url.endsWith("/seal"))?.body).toEqual({});
  });

  it("turns a 409 seal_blocked into the server's blockers and keeps the page's data", async () => {
    const { client } = sealClient(() =>
      json(
        {
          error: {
            code: "seal_blocked",
            message: "The project cannot be sealed yet.",
            details: { blockers: ["undecided_candidates", "stale_evidence"] },
          },
        },
        409,
      ),
    );
    const { result } = renderHook(() => useReport("p1", client));
    await waitFor(() => expect(result.current.status).toBe("done"));
    let out: Awaited<ReturnType<typeof result.current.seal>> = { kind: "ignored" };
    await act(async () => {
      out = await result.current.seal("");
    });
    expect(out).toEqual({
      kind: "blocked",
      blockers: ["undecided_candidates", "stale_evidence"],
      message: "The project cannot be sealed yet.",
    });
    expect(result.current.data?.blockers).toEqual(["undecided_candidates", "stale_evidence"]);
    expect(result.current.data?.seal).toBeNull();
  });

  it("reports other errors as failed, without blockers", async () => {
    const { client } = sealClient(() => json({ error: { code: "unauthorized", message: "Sign in to apply the Final Seal." } }, 401));
    const { result } = renderHook(() => useReport("p1", client));
    await waitFor(() => expect(result.current.status).toBe("done"));
    let out: Awaited<ReturnType<typeof result.current.seal>> = { kind: "ignored" };
    await act(async () => {
      out = await result.current.seal("");
    });
    expect(out).toEqual({ kind: "failed", message: "Sign in to apply the Final Seal." });
  });

  it("sends one seal request at a time", async () => {
    let release: (r: Response) => void = () => undefined;
    const pending = new Promise<Response>((resolve) => {
      release = resolve;
    });
    const { client, calls } = sealClient(() => pending);
    const { result } = renderHook(() => useReport("p1", client));
    await waitFor(() => expect(result.current.status).toBe("done"));
    let second: Awaited<ReturnType<typeof result.current.seal>> = { kind: "sealed", seal: SEAL };
    let first: Promise<unknown> = Promise.resolve();
    await act(async () => {
      first = result.current.seal("");
      second = await result.current.seal("");
    });
    expect(second).toEqual({ kind: "ignored" });
    expect(calls.filter((c) => c.url.endsWith("/seal"))).toHaveLength(1);
    await act(async () => {
      release(json({ seal: SEAL }, 201));
      await first;
    });
  });
});
