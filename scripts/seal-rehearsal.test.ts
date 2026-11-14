import { describe, expect, it } from "vitest";
// Importing seal-rehearsal.ts does not touch the network: it runs only when called as a script.
import {
  isRehearsalName,
  matchesItsLine,
  parseArgs,
  planReshoots,
  planReviews,
  rehearsalName,
  type EvidenceLike,
  type SegmentLike,
} from "./seal-rehearsal";

const segments: SegmentLike[] = [
  { id: "s1", index: 0, hash: "h1" },
  { id: "s2", index: 1, hash: "h2" },
  { id: "s3", index: 2, hash: "h3" },
];
const ev = (over: Partial<EvidenceLike>): EvidenceLike => ({
  id: "e",
  status: "candidate",
  scriptSegmentId: "s1",
  segmentHash: "h1",
  confidence: "high",
  ...over,
});

describe("matchesItsLine", () => {
  it("needs a current line, the same text hash, and medium or high confidence", () => {
    expect(matchesItsLine(ev({}), segments)).toBe(true);
    expect(matchesItsLine(ev({ confidence: "medium" }), segments)).toBe(true);
    expect(matchesItsLine(ev({ confidence: "low" }), segments)).toBe(false);
    expect(matchesItsLine(ev({ segmentHash: "old" }), segments)).toBe(false);
    expect(matchesItsLine(ev({ scriptSegmentId: "gone" }), segments)).toBe(false);
  });
});

describe("planReviews", () => {
  it("confirms matching candidates, rejects the rest and stale ones, acknowledges outside proof, and skips decided ones", () => {
    const plan = planReviews(
      [
        ev({ id: "a", scriptSegmentId: "s1", segmentHash: "h1", confidence: "medium" }),
        ev({ id: "b", scriptSegmentId: "s2", segmentHash: "h2", confidence: "low" }),
        ev({ id: "c", scriptSegmentId: "s3", segmentHash: "h3", status: "stale" }),
        ev({ id: "d", scriptSegmentId: "s3", segmentHash: "h3", status: "needs_outside_proof" }),
        ev({ id: "e", status: "confirmed" }),
        ev({ id: "f", status: "rejected" }),
        ev({ id: "g", status: "needs_reshoot" }),
      ],
      segments,
    );
    expect(plan.map((p) => [p.evidenceId, p.line, p.decision])).toEqual([
      ["a", 1, "confirm"],
      ["b", 2, "reject"],
      ["c", 3, "reject"],
      ["d", 3, "needs_outside_proof"],
    ]);
  });

  it("never confirms evidence for a line that no longer exists", () => {
    const [only] = planReviews([ev({ scriptSegmentId: "gone" })], segments);
    expect(only).toMatchObject({ decision: "reject", line: null });
  });
});

describe("planReshoots", () => {
  const items = [
    { checklistItemId: "c1", state: "proven" },
    { checklistItemId: "c2", state: "uncovered" },
    { checklistItemId: "c3", state: "reshoot" },
  ];

  it("asks for a reshoot only for uncovered items, and only when they block the seal", () => {
    expect(planReshoots(["uncovered_items"], items)).toEqual(["c2"]);
    expect(planReshoots(["undecided_candidates", "uncovered_items"], items)).toEqual(["c2"]);
    expect(planReshoots(["undecided_candidates"], items)).toEqual([]);
    expect(planReshoots([], items)).toEqual([]);
  });
});

describe("names and arguments", () => {
  it("makes zz-seal-* names and accepts only those", () => {
    const name = rehearsalName(() => 0.5);
    expect(name).toMatch(/^zz-seal-[a-z0-9]{8}$/);
    expect(isRehearsalName(name)).toBe(true);
    for (const other of ["ProofPay demo (public example)", "zz-test-e2e-abc123", "zz-seal-", "zz-seal-AB12CD", "x zz-seal-abcdef", null]) {
      expect(isRehearsalName(other)).toBe(false);
    }
  });

  it("reads the clip path and --dry-run in any order", () => {
    expect(parseArgs(["clip.mp4", "--dry-run"])).toEqual({ clip: "clip.mp4", dryRun: true });
    expect(parseArgs(["--dry-run", "clip.mp4"])).toEqual({ clip: "clip.mp4", dryRun: true });
    expect(parseArgs(["clip.mp4"])).toEqual({ clip: "clip.mp4", dryRun: false });
  });
});
