import { describe, expect, it } from "vitest";
import type { CoverageState, CoverageSummary } from "@sleuth/contracts";
import { canSeal, sealBlockers, type SealInput } from "./seal";

function coverage(...states: CoverageState[]): CoverageSummary {
  const totals = { proven: 0, needs_review: 0, outside_proof: 0, reshoot: 0, uncovered: 0 };
  states.forEach((s) => (totals[s] += 1));
  return {
    items: states.map((state, i) => ({ checklistItemId: `c${i}`, state, evidenceIds: [] })),
    totals,
    provenPercent: states.length ? Math.floor((100 * totals.proven) / states.length) : 0,
    outsideProof: [],
    openReshootIds: [],
  };
}
const ready = (over: Partial<SealInput> = {}): SealInput => ({
  coverage: coverage("proven", "outside_proof", "reshoot"),
  evidence: [{ status: "confirmed" }, { status: "rejected" }],
  jobs: [{ status: "succeeded" }],
  hasAnalysis: true,
  ...over,
});

describe("sealBlockers", () => {
  it("lets a fully reviewed project be sealed, even with an acknowledged outside-proof item and an open reshoot", () => {
    expect(canSeal(ready())).toEqual({ ok: true });
  });

  it("blocks on an undecided candidate", () => {
    expect(sealBlockers(ready({ evidence: [{ status: "candidate" }] }))).toEqual([
      "undecided_candidates",
    ]);
  });

  it("blocks on an item that still needs review, including an engine-proposed outside-proof claim", () => {
    expect(sealBlockers(ready({ coverage: coverage("proven", "needs_review") }))).toEqual([
      "undecided_candidates",
    ]);
  });

  it("blocks on stale evidence nobody dismissed", () => {
    expect(sealBlockers(ready({ evidence: [{ status: "stale" }] }))).toEqual(["stale_evidence"]);
  });

  it("blocks on an uncovered item", () => {
    expect(sealBlockers(ready({ coverage: coverage("proven", "uncovered") }))).toEqual([
      "uncovered_items",
    ]);
  });

  it("blocks when there is nothing on the checklist to certify", () => {
    expect(sealBlockers(ready({ coverage: coverage() }))).toEqual(["uncovered_items"]);
  });

  it("blocks while a job is queued or running", () => {
    expect(sealBlockers(ready({ jobs: [{ status: "queued" }] }))).toEqual(["job_running"]);
    expect(sealBlockers(ready({ jobs: [{ status: "running" }] }))).toEqual(["job_running"]);
    expect(sealBlockers(ready({ jobs: [{ status: "failed" }, { status: "succeeded" }] }))).toEqual(
      [],
    );
  });

  it("blocks a project that was never analysed", () => {
    expect(sealBlockers(ready({ hasAnalysis: false }))).toEqual(["no_analysis"]);
  });

  it("lists every blocker in a fixed order", () => {
    const all = sealBlockers({
      coverage: coverage("needs_review", "uncovered"),
      evidence: [{ status: "candidate" }, { status: "stale" }],
      jobs: [{ status: "running" }],
      hasAnalysis: false,
    });
    expect(all).toEqual([
      "undecided_candidates",
      "stale_evidence",
      "uncovered_items",
      "job_running",
      "no_analysis",
    ]);
  });

  it("returns the blockers from canSeal", () => {
    expect(canSeal(ready({ hasAnalysis: false }))).toEqual({
      ok: false,
      blockers: ["no_analysis"],
    });
  });
});
