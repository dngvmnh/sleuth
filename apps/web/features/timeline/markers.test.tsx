import { describe, expect, it } from "vitest";
import { detail, evidence, hashOf } from "../workspace/test-fixtures";
import { buildMarkers, describeMarker, formatSeconds, primaryMarkerFor } from "./markers";

const segments = detail.scriptVersion?.segments ?? [];
// segments: s1 is line 1, s2 is line 2 (the fixture lists them out of order on purpose).

describe("buildMarkers", () => {
  it("makes one marker per evidence candidate, ordered by start time", () => {
    const markers = buildMarkers(segments, [
      evidence("late", "candidate", { scriptSegmentId: "s2", startMs: 9000, endMs: 12_000 }),
      evidence("early", "candidate", { scriptSegmentId: "s1", startMs: 1000, endMs: 4000 }),
    ]);
    expect(markers.map((m) => m.id)).toEqual(["early", "late"]);
    expect(markers.map((m) => m.line)).toEqual([1, 2]);
  });

  it("sets the state from the evidence status", () => {
    const markers = buildMarkers(segments, [
      evidence("a", "confirmed", { startMs: 0, endMs: 1 }),
      evidence("b", "candidate", { startMs: 2, endMs: 3 }),
      evidence("c", "stale", { startMs: 4, endMs: 5 }),
      evidence("d", "needs_outside_proof", { startMs: 6, endMs: 7 }),
      evidence("e", "needs_reshoot", { startMs: 8, endMs: 9 }),
    ]);
    expect(markers.map((m) => [m.id, m.state])).toEqual([
      ["a", "covered"],
      ["b", "needs_review"],
      ["c", "stale"],
      ["d", "outside_proof"],
      ["e", "needs_review"],
    ]);
  });

  it("shows a stale candidate as stale even when the line has other evidence", () => {
    const markers = buildMarkers(segments, [
      evidence("old", "stale", { startMs: 0, endMs: 1 }),
      evidence("new", "candidate", { startMs: 2, endMs: 3 }),
    ]);
    expect(markers.find((m) => m.id === "old")?.state).toBe("stale");
    expect(markers.find((m) => m.id === "new")?.state).toBe("needs_review");
  });

  it("passes the segment hash to the domain, so evidence for an edited line shows as stale", () => {
    // Status still says candidate, but the line's text (and hash) changed since it was found.
    const markers = buildMarkers(segments, [
      evidence("edited", "candidate", { segmentHash: "f".repeat(64) }),
      evidence("fresh", "candidate", { scriptSegmentId: "s2", segmentHash: hashOf("s2"), startMs: 9000 }),
    ]);
    expect(markers.find((m) => m.id === "edited")?.state).toBe("stale");
    expect(markers.find((m) => m.id === "fresh")?.state).toBe("needs_review");
  });

  it("gives no marker to rejected evidence or to evidence for a line not in the script", () => {
    const markers = buildMarkers(segments, [
      evidence("rejected", "rejected"),
      evidence("elsewhere", "candidate", { scriptSegmentId: "gone" }),
    ]);
    expect(markers).toEqual([]);
  });
});

describe("primaryMarkerFor", () => {
  it("prefers the earliest marker that is not out of date", () => {
    const markers = buildMarkers(segments, [
      evidence("old", "stale", { startMs: 0, endMs: 1 }),
      evidence("b", "candidate", { startMs: 5000, endMs: 6000 }),
      evidence("a", "candidate", { startMs: 2000, endMs: 3000 }),
    ]);
    expect(primaryMarkerFor(markers, "s1")?.id).toBe("a");
  });

  it("falls back to a stale marker, and returns nothing for a line without evidence", () => {
    const markers = buildMarkers(segments, [evidence("old", "stale")]);
    expect(primaryMarkerFor(markers, "s1")?.id).toBe("old");
    expect(primaryMarkerFor(markers, "s2")).toBeUndefined();
  });
});

describe("describeMarker", () => {
  it("names the line, the time range, the confidence and the state in plain words", () => {
    const [marker] = buildMarkers(segments, [
      evidence("a", "candidate", { startMs: 11_000, endMs: 18_000, confidence: "high" }),
    ]);
    expect(marker && describeMarker(marker)).toBe(
      "Evidence for line 1, 11 to 18 seconds, high confidence, Cursed Frame, needs human check",
    );
  });

  it("pairs the spooky name with the plain one for stale and outside-proof markers", () => {
    const [stale, outside] = buildMarkers(segments, [
      evidence("a", "stale", { startMs: 0, endMs: 1500 }),
      evidence("b", "needs_outside_proof", { startMs: 2000, endMs: 3000 }),
    ]);
    expect(stale && describeMarker(stale)).toContain("Poltergeist, evidence out of date");
    expect(stale && describeMarker(stale)).toContain("0 to 1.5 seconds");
    expect(outside && describeMarker(outside)).toContain("Needs Outside Proof, footage cannot prove this");
  });
});

describe("formatSeconds", () => {
  it("drops a trailing .0 and keeps one decimal otherwise", () => {
    expect(formatSeconds(1000)).toBe("1");
    expect(formatSeconds(1500)).toBe("1.5");
    expect(formatSeconds(0)).toBe("0");
  });
});
