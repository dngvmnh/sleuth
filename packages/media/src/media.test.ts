import { describe, expect, it } from "vitest";
import type { FrameObservation, TranscriptSegment } from "@sleuth/contracts";
import { createMockTranscriptionProvider, createMockVideoAnalysisProvider } from "./mocks";
import { validateObservations, validateTranscript } from "./validate";

const seg = (over: Partial<TranscriptSegment> = {}): TranscriptSegment => ({
  id: "t1",
  projectId: "p1",
  assetVersionId: "av1",
  startMs: 0,
  endMs: 1000,
  text: "hello",
  words: [{ text: "hello", startMs: 0, endMs: 1000 }],
  ...over,
});
const obs = (over: Partial<FrameObservation> = {}): FrameObservation => ({
  id: "f1",
  projectId: "p1",
  assetVersionId: "av1",
  timestampMs: 500,
  description: "a screen",
  onScreenText: [],
  ...over,
});

describe("mock providers", () => {
  it("returns only transcript for the requested asset version", async () => {
    const p = createMockTranscriptionProvider([seg(), seg({ id: "t2", assetVersionId: "av2" })]);
    const out = await p.transcribe({ projectId: "p1", assetVersionId: "av1", durationMs: 5000 });
    expect(out.map((s) => s.id)).toEqual(["t1"]);
  });

  it("returns only observations at the requested frame timestamps", async () => {
    const p = createMockVideoAnalysisProvider([obs(), obs({ id: "f2", timestampMs: 900 })]);
    const out = await p.analyse({
      projectId: "p1",
      assetVersionId: "av1",
      durationMs: 5000,
      frames: [{ timestampMs: 900 }],
    });
    expect(out.map((o) => o.id)).toEqual(["f2"]);
  });
});

describe("validation", () => {
  it("drops transcript segments past the video duration", () => {
    const r = validateTranscript([seg(), seg({ id: "t2", endMs: 9000 })], 5000);
    expect(r.valid.map((s) => s.id)).toEqual(["t1"]);
    expect(r.rejectedCount).toBe(1);
  });

  it("drops malformed transcript items and reversed intervals", () => {
    const r = validateTranscript([{ nope: true }, seg({ startMs: 900, endMs: 100 })], 5000);
    expect(r.valid).toEqual([]);
    expect(r.rejectedCount).toBe(2);
  });

  it("drops observations past the video duration and non-integer timestamps", () => {
    const r = validateObservations(
      [obs(), obs({ id: "f2", timestampMs: 6000 }), obs({ id: "f3", timestampMs: 1.5 })],
      5000,
    );
    expect(r.valid.map((o) => o.id)).toEqual(["f1"]);
  });
});
