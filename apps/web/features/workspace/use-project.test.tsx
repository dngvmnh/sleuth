import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  clientFor,
  detail,
  evidence,
  finding,
  json,
  notFoundBody,
  okRoutes,
} from "./test-fixtures";
import { useProject } from "./use-project";

describe("useProject", () => {
  it("starts loading and then holds the project, evidence and findings", async () => {
    const { client } = clientFor(okRoutes());
    const { result } = renderHook(() => useProject("p1", client));
    expect(result.current.status).toBe("loading");
    await waitFor(() => expect(result.current.status).toBe("done"));
    expect(result.current.detail?.project.name).toBe("Test project");
    expect(result.current.evidence).toHaveLength(2);
    expect(result.current.findings).toHaveLength(2);
  });

  it("reports empty when there is no script and no evidence", async () => {
    const { client } = clientFor(
      okRoutes({
        project: () => json({ ...detail, scriptVersion: null, assetVersion: null }),
        evidence: () => json({ evidence: [] }),
        findings: () => json({ findings: [] }),
      }),
    );
    const { result } = renderHook(() => useProject("p1", client));
    await waitFor(() => expect(result.current.status).toBe("empty"));
    expect(result.current.evidence).toEqual([]);
  });

  it("reports not_found for a 404", async () => {
    const { client } = clientFor(okRoutes({ project: () => json(notFoundBody, 404) }));
    const { result } = renderHook(() => useProject("nope", client));
    await waitFor(() => expect(result.current.status).toBe("not_found"));
    expect(result.current.detail).toBeUndefined();
  });

  it("reports an error with a message for other failures, and recovers on refresh", async () => {
    let fail = true;
    const { client } = clientFor(
      okRoutes({
        project: () =>
          fail ? json({ error: { code: "boom", message: "Server down" } }, 500) : json(detail),
      }),
    );
    const { result } = renderHook(() => useProject("p1", client));
    await waitFor(() => expect(result.current.status).toBe("error"));
    expect(result.current.errorMessage).toBe("Server down");
    fail = false;
    act(() => result.current.refresh());
    expect(result.current.status).toBe("loading");
    await waitFor(() => expect(result.current.status).toBe("done"));
    expect(result.current.errorMessage).toBeUndefined();
  });

  it("drops a slow response for the project the user already left", async () => {
    let releaseOld: () => void = () => undefined;
    const oldGate = new Promise<void>((resolve) => {
      releaseOld = resolve;
    });
    const { client } = clientFor(
      okRoutes({
        project: () => json(detail),
      }),
    );
    // Wrap the client so only project "old" is slow.
    const slow = {
      ...client,
      getProject: async (id: string) => {
        if (id === "old") await oldGate;
        return id === "old"
          ? { ...detail, project: { ...detail.project, id: "old", name: "Old project" } }
          : { ...detail, project: { ...detail.project, id: "new", name: "New project" } };
      },
    };
    const { result, rerender } = renderHook(({ id }) => useProject(id, slow), {
      initialProps: { id: "old" },
    });
    rerender({ id: "new" });
    // The old project is not shown while the new one loads.
    expect(result.current.detail).toBeUndefined();
    await waitFor(() => expect(result.current.detail?.project.name).toBe("New project"));
    await act(async () => {
      releaseOld();
      await Promise.resolve();
    });
    expect(result.current.detail?.project.name).toBe("New project");
  });

  it("does not write after unmount", async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const { client } = clientFor(okRoutes());
    const slow = {
      ...client,
      getProject: async (id: string) => {
        await gate;
        return client.getProject(id);
      },
    };
    const { result, unmount } = renderHook(() => useProject("p1", slow));
    unmount();
    release();
    await Promise.resolve();
    await Promise.resolve();
    expect(result.current.status).toBe("loading");
  });

  describe("review", () => {
    it("replaces the reviewed evidence and reloads findings", async () => {
      let findingsCalls = 0;
      const { client, calls } = clientFor(
        okRoutes({
          findings: () => {
            findingsCalls += 1;
            return json({
              findings:
                findingsCalls === 1
                  ? [finding("f1", "ghost")]
                  : [finding("f1", "ghost", "resolved")],
            });
          },
          review: () =>
            json({
              evidence: evidence("e1", "confirmed"),
              decision: {
                id: "d1",
                evidenceId: "e1",
                decision: "confirm",
                reviewerId: "u1",
                note: null,
                createdAt: "2026-01-02T00:00:00.000Z",
              },
            }),
        }),
      );
      const { result } = renderHook(() => useProject("p1", client));
      await waitFor(() => expect(result.current.status).toBe("done"));
      await act(async () => {
        await result.current.review("e1", { decision: "confirm" });
      });
      expect(result.current.evidence.find((e) => e.id === "e1")?.status).toBe("confirmed");
      expect(result.current.evidence.find((e) => e.id === "e2")?.status).toBe("candidate");
      expect(result.current.findings[0]?.status).toBe("resolved");
      expect(calls.filter((c) => c.method === "PATCH")).toHaveLength(1);
      expect(result.current.reviewingId).toBeUndefined();
    });

    it("shows the server's refusal and keeps the evidence as it was", async () => {
      const { client } = clientFor(
        okRoutes({
          review: () => json({ error: { code: "review_refused", message: "Not allowed here." } }, 409),
        }),
      );
      const { result } = renderHook(() => useProject("p1", client));
      await waitFor(() => expect(result.current.status).toBe("done"));
      await act(async () => {
        await result.current.review("e1", { decision: "confirm" });
      });
      expect(result.current.reviewError).toBe("Not allowed here.");
      expect(result.current.evidence.find((e) => e.id === "e1")?.status).toBe("candidate");
    });

    it("records needs_reshoot with the note, then creates a reshoot task for the line", async () => {
      const bodies: unknown[] = [];
      const { client, calls } = clientFor(
        okRoutes({
          review: (init) => {
            bodies.push(JSON.parse(String(init?.body)));
            return json({
              evidence: evidence("e1", "needs_reshoot"),
              decision: {
                id: "d1",
                evidenceId: "e1",
                decision: "needs_reshoot",
                reviewerId: "u1",
                note: "Film it again.",
                createdAt: "2026-01-02T00:00:00.000Z",
              },
            });
          },
        }),
      );
      // The reshoot route falls into the project route in clientFor; answer it here.
      const withReshoot = {
        ...client,
        createReshoot: async (projectId: string, params: Parameters<typeof client.createReshoot>[1]) => {
          calls.push({ url: `/projects/${projectId}/reshoots`, method: "POST" });
          bodies.push(params);
          return {
            reshoot: {
              id: "r1",
              projectId,
              checklistItemId: null,
              scriptSegmentId: params.scriptSegmentId ?? null,
              findingId: null,
              note: params.note,
              status: "open" as const,
              createdAt: "2026-01-02T00:00:00.000Z",
            },
          };
        },
      };
      const { result } = renderHook(() => useProject("p1", withReshoot));
      await waitFor(() => expect(result.current.status).toBe("done"));
      let ok = false;
      await act(async () => {
        ok = await result.current.reshoot(evidence("e1"), "Film it again.");
      });
      expect(ok).toBe(true);
      expect(bodies).toEqual([
        { decision: "needs_reshoot", note: "Film it again." },
        { note: "Film it again.", scriptSegmentId: "s1" },
      ]);
      expect(result.current.evidence.find((e) => e.id === "e1")?.status).toBe("needs_reshoot");
    });

    it("creates no reshoot task when the server refuses the decision", async () => {
      const { client } = clientFor(
        okRoutes({
          review: () => json({ error: { code: "review_refused", message: "Decision refused: stale_needs_reanalysis." } }, 409),
        }),
      );
      let reshootCalls = 0;
      const withReshoot = {
        ...client,
        createReshoot: async () => {
          reshootCalls += 1;
          throw new Error("should not be called");
        },
      };
      const { result } = renderHook(() => useProject("p1", withReshoot));
      await waitFor(() => expect(result.current.status).toBe("done"));
      let ok = true;
      await act(async () => {
        ok = await result.current.reshoot(evidence("e1"), "Film it again.");
      });
      expect(ok).toBe(false);
      expect(reshootCalls).toBe(0);
      expect(result.current.reviewError).toBe("Decision refused: stale_needs_reanalysis.");
      expect(result.current.reviewErrorId).toBe("e1");
    });

    it("sends one request while a review is running", async () => {
      let release: (r: Response) => void = () => undefined;
      const pending = new Promise<Response>((resolve) => {
        release = resolve;
      });
      const { client, calls } = clientFor(okRoutes({ review: () => pending }));
      const { result } = renderHook(() => useProject("p1", client));
      await waitFor(() => expect(result.current.status).toBe("done"));
      let first: Promise<boolean> = Promise.resolve(false);
      act(() => {
        first = result.current.review("e1", { decision: "reject" });
        void result.current.review("e1", { decision: "reject" });
      });
      expect(result.current.reviewingId).toBe("e1");
      expect(calls.filter((c) => c.method === "PATCH")).toHaveLength(1);
      await act(async () => {
        release(json({ error: { code: "x", message: "stop" } }, 400));
        await first;
      });
      expect(result.current.reviewingId).toBeUndefined();
    });
  });
});
