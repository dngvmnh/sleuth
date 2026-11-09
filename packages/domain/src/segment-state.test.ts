import { describe, expect, it } from "vitest";
import type { EvidenceStatus } from "@sleuth/contracts";
import { deriveSegmentStates } from "./segment-state";
import { makeEvidence } from "./test-helpers";

const HASH = "a".repeat(64);
const segments = [{ id: "s1", hash: HASH }];
let n = 0;
const ev = (
  status: EvidenceStatus,
  over: { segmentHash?: string; scriptSegmentId?: string } = {},
) =>
  makeEvidence({
    id: `ev-${++n}`,
    scriptSegmentId: over.scriptSegmentId ?? "s1",
    segmentHash: over.segmentHash ?? HASH,
    status,
  });
const stateOf = (...statuses: EvidenceStatus[]) =>
  deriveSegmentStates(
    segments,
    statuses.map((s) => ev(s)),
  )["s1"];

describe("deriveSegmentStates", () => {
  it("covered: a person confirmed evidence", () => {
    expect(stateOf("confirmed")).toBe("covered");
  });

  it("covered wins over other fresh evidence and stale leftovers", () => {
    expect(stateOf("stale", "candidate", "confirmed")).toBe("covered");
  });

  it("outside_proof: the claim needs proof from outside the video", () => {
    expect(stateOf("needs_outside_proof")).toBe("outside_proof");
  });

  it("needs_review: an undecided candidate", () => {
    expect(stateOf("candidate")).toBe("needs_review");
  });

  it("needs_review: a person asked for a reshoot", () => {
    expect(stateOf("needs_reshoot")).toBe("needs_review");
  });

  it("stale: only out-of-date evidence", () => {
    expect(stateOf("stale")).toBe("stale");
    expect(stateOf("stale", "stale")).toBe("stale");
  });

  it("uncovered: no evidence at all", () => {
    expect(stateOf()).toBe("uncovered");
  });

  it("uncovered: only rejected evidence", () => {
    expect(stateOf("rejected")).toBe("uncovered");
  });

  it("uncovered: stale evidence beside a person's rejection (nothing left to review)", () => {
    expect(stateOf("stale", "rejected")).toBe("uncovered");
  });

  it("a fresh candidate beats stale leftovers", () => {
    expect(stateOf("stale", "candidate")).toBe("needs_review");
  });

  it("treats evidence built on an old segment hash as stale, whatever its status", () => {
    const out = deriveSegmentStates(segments, [ev("confirmed", { segmentHash: "b".repeat(64) })]);
    expect(out["s1"]).toBe("stale");
  });

  it("ignores evidence for segments that are not in the script", () => {
    const out = deriveSegmentStates(segments, [ev("confirmed", { scriptSegmentId: "gone" })]);
    expect(Object.keys(out)).toEqual(["s1"]);
    expect(out["s1"]).toBe("uncovered");
  });

  it("gives every segment its own state", () => {
    const two = [
      { id: "s1", hash: HASH },
      { id: "s2", hash: HASH },
    ];
    const out = deriveSegmentStates(two, [
      ev("confirmed"),
      ev("candidate", { scriptSegmentId: "s2" }),
    ]);
    expect(out).toEqual({ s1: "covered", s2: "needs_review" });
  });
});
