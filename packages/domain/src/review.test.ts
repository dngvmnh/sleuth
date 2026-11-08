import { describe, expect, it } from "vitest";
import { applyReviewDecision } from "./review";
import { makeEvidence } from "./test-helpers";

const ev = makeEvidence({ scriptSegmentId: "a" });
const by = (decision: "confirm" | "reject" | "needs_reshoot" | "needs_outside_proof") => ({
  evidenceId: ev.id,
  decision,
  reviewerId: "user-1",
});

describe("applyReviewDecision", () => {
  it("confirms when a named person confirms", () => {
    const r = applyReviewDecision(ev, by("confirm"));
    expect(r.ok && r.evidence.status).toBe("confirmed");
  });

  it.each([
    ["reject", "rejected"],
    ["needs_reshoot", "needs_reshoot"],
    ["needs_outside_proof", "needs_outside_proof"],
  ] as const)("maps %s to %s", (decision, status) => {
    const r = applyReviewDecision(ev, by(decision));
    expect(r.ok && r.evidence.status).toBe(status);
  });

  it("refuses a decision with a blank reviewer", () => {
    const r = applyReviewDecision(ev, { ...by("confirm"), reviewerId: "   " });
    expect(r).toEqual({ ok: false, reason: "missing_human_reviewer" });
  });

  it("refuses a decision made for other evidence", () => {
    const r = applyReviewDecision(ev, { ...by("confirm"), evidenceId: "other" });
    expect(r).toEqual({ ok: false, reason: "wrong_evidence" });
  });

  it("refuses to confirm stale evidence", () => {
    const stale = { ...ev, status: "stale" as const };
    expect(applyReviewDecision(stale, by("confirm"))).toEqual({
      ok: false,
      reason: "stale_needs_reanalysis",
    });
  });

  it("lets a person dismiss stale evidence", () => {
    const stale = { ...ev, status: "stale" as const };
    const r = applyReviewDecision(stale, by("reject"));
    expect(r.ok && r.evidence.status).toBe("rejected");
  });

  describe("with the current line and video known", () => {
    const now = { segmentHash: ev.segmentHash, assetVersionId: ev.assetVersionId };

    it("confirms evidence that matches the current line and video", () => {
      const r = applyReviewDecision(ev, by("confirm"), now);
      expect(r.ok && r.evidence.status).toBe("confirmed");
    });

    it("refuses to confirm a rejected candidate whose line text has changed since", () => {
      const dismissed = { ...ev, status: "rejected" as const };
      const r = applyReviewDecision(dismissed, by("confirm"), { ...now, segmentHash: "other" });
      expect(r).toEqual({ ok: false, reason: "stale_needs_reanalysis" });
    });

    it("refuses to confirm a candidate built on an older video", () => {
      const r = applyReviewDecision(ev, by("confirm"), { ...now, assetVersionId: "av2" });
      expect(r).toEqual({ ok: false, reason: "stale_needs_reanalysis" });
    });

    it("refuses when the line is gone, but lets a person dismiss it", () => {
      const gone = { segmentHash: undefined, assetVersionId: ev.assetVersionId };
      expect(applyReviewDecision(ev, by("confirm"), gone).ok).toBe(false);
      expect(applyReviewDecision(ev, by("reject"), gone).ok).toBe(true);
    });
  });

  it("does not change the source field", () => {
    const r = applyReviewDecision(ev, by("confirm"));
    expect(r.ok && r.evidence.source).toBe("ai");
  });
});
