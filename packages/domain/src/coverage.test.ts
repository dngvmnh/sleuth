import { describe, expect, it } from "vitest";
import type { ChecklistItem, EvidenceStatus, ReviewDecisionKind } from "@sleuth/contracts";
import { computeCoverage, OUTSIDE_PROOF_HINT } from "./coverage";
import { makeEvidence } from "./test-helpers";

const HASH = "a".repeat(64);
const script = {
  segments: [1, 2, 3, 4].map((n) => ({
    id: `s${n}`,
    scriptVersionId: "sv1",
    index: n - 1,
    text: `Line ${n}`,
    hash: HASH,
  })),
};
const checklist: ChecklistItem[] = [1, 2, 3, 4].map((n) => ({
  id: `c${n}`,
  projectId: "p1",
  label: `Item ${n}`,
  position: n - 1,
}));

const ev = (
  item: string,
  segment: string,
  status: EvidenceStatus,
  over: { segmentHash?: string } = {},
) =>
  makeEvidence({
    id: `ev-${item}-${segment}-${status}`,
    checklistItemId: item,
    scriptSegmentId: segment,
    status,
    segmentHash: over.segmentHash ?? HASH,
  });
const decide = (
  evidenceId: string,
  decision: ReviewDecisionKind,
  createdAt = "2026-11-08T10:00:00.000Z",
) => ({
  evidenceId,
  decision,
  createdAt,
});
type Reshoot = { id: string; checklistItemId: string | null; status: "open" | "done" };
const run = (
  evidence: ReturnType<typeof ev>[] = [],
  decisions: ReturnType<typeof decide>[] = [],
  reshoots: Reshoot[] = [],
) => computeCoverage(checklist, script, evidence, decisions, reshoots);
const stateOf = (
  item: string,
  evidence: ReturnType<typeof ev>[] = [],
  decisions: ReturnType<typeof decide>[] = [],
  reshoots: Reshoot[] = [],
) => run(evidence, decisions, reshoots).items.find((i) => i.checklistItemId === item)?.state;
describe("computeCoverage states", () => {
  it("proven: confirmed and a person confirmed it", () => {
    const e = ev("c1", "s1", "confirmed");
    expect(stateOf("c1", [e], [decide(e.id, "confirm")])).toBe("proven");
  });

  it("does not count a confirmed status without a person's decision", () => {
    expect(stateOf("c1", [ev("c1", "s1", "confirmed")], [])).toBe("needs_review");
  });

  it("outside_proof: engine proposed it and a person acknowledged it", () => {
    const e = ev("c2", "s2", "needs_outside_proof");
    expect(stateOf("c2", [e], [decide(e.id, "needs_outside_proof")])).toBe("outside_proof");
  });

  it("needs_review: the engine proposed outside proof and nobody decided", () => {
    expect(stateOf("c2", [ev("c2", "s2", "needs_outside_proof")], [])).toBe("needs_review");
  });

  it("reshoot: a person asked for a reshoot", () => {
    const e = ev("c3", "s3", "needs_reshoot");
    expect(stateOf("c3", [e], [decide(e.id, "needs_reshoot")])).toBe("reshoot");
  });

  it("reshoot: an open reshoot task names the item", () => {
    expect(stateOf("c4", [], [], [{ id: "r1", checklistItemId: "c4", status: "open" }])).toBe(
      "reshoot",
    );
  });

  it("a reshoot marked done does not make the item proven", () => {
    expect(stateOf("c4", [], [], [{ id: "r1", checklistItemId: "c4", status: "done" }])).toBe(
      "uncovered",
    );
  });

  it("needs_review: an undecided candidate", () => {
    expect(stateOf("c1", [ev("c1", "s1", "candidate")])).toBe("needs_review");
  });

  it("uncovered: no evidence, only stale, or only rejected", () => {
    expect(stateOf("c1")).toBe("uncovered");
    expect(stateOf("c1", [ev("c1", "s1", "stale")])).toBe("uncovered");
    expect(stateOf("c1", [ev("c1", "s1", "rejected")])).toBe("uncovered");
  });

  it("proven wins over an open reshoot and a leftover candidate", () => {
    const e = ev("c1", "s1", "confirmed");
    const other = ev("c1", "s2", "candidate");
    expect(
      stateOf(
        "c1",
        [e, other],
        [decide(e.id, "confirm")],
        [{ id: "r", checklistItemId: "c1", status: "open" }],
      ),
    ).toBe("proven");
  });

  it("treats evidence on a changed segment hash as stale, even if its status says confirmed", () => {
    const e = ev("c1", "s1", "confirmed", { segmentHash: "b".repeat(64) });
    expect(stateOf("c1", [e], [decide(e.id, "confirm")])).toBe("uncovered");
  });

  it("uses a person's latest decision when there are several", () => {
    const e = ev("c1", "s1", "confirmed");
    const decisions = [
      decide(e.id, "confirm", "2026-11-08T10:00:00.000Z"),
      decide(e.id, "reject", "2026-11-08T11:00:00.000Z"),
    ];
    expect(stateOf("c1", [e], decisions)).toBe("needs_review");
  });
});

describe("computeCoverage summary", () => {
  it("totals, percent, outside-proof list and open reshoots", () => {
    const a = ev("c1", "s1", "confirmed");
    const b = ev("c2", "s2", "needs_outside_proof");
    const out = computeCoverage(
      checklist,
      script,
      [a, b],
      [decide(a.id, "confirm")],
      [
        { id: "r1", checklistItemId: "c4", status: "open" },
        { id: "r2", checklistItemId: "c3", status: "done" },
      ],
    );
    expect(out.totals).toEqual({
      proven: 1,
      needs_review: 1,
      outside_proof: 0,
      reshoot: 1,
      uncovered: 1,
    });
    expect(out.provenPercent).toBe(25);
    expect(out.outsideProof).toEqual([
      { scriptSegmentId: "s2", hint: OUTSIDE_PROOF_HINT, acknowledged: false },
    ]);
    expect(out.openReshootIds).toEqual(["r1"]);
  });

  it("gives 0 percent for an empty checklist", () => {
    expect(computeCoverage([], script, [], []).provenPercent).toBe(0);
  });
});
