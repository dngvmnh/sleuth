import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { FrameObservation } from "@sleuth/contracts";
import { STRONG_FRAME_WORDS, matchFrames, rankConfidence } from "./match";
import {
  CHECKLIST_MIN_COVERAGE,
  FRAME_WINDOW_MS,
  SPOKEN_MIN_COVERAGE,
  SPOKEN_STRONG_COVERAGE,
} from "./thresholds";

const frame = (id: string, timestampMs: number, description: string): FrameObservation => ({
  id,
  projectId: "p1",
  assetVersionId: "av1",
  timestampMs,
  description,
  onScreenText: [],
});

describe("matchFrames", () => {
  const spoken = { startMs: 10_000, endMs: 14_000 };
  const tokens = ["invoice", "draft"];

  it("keeps frames inside the window and marks which are inside the spoken time", () => {
    const result = matchFrames(tokens, spoken, [
      frame("a", spoken.startMs - FRAME_WINDOW_MS, "invoice draft"),
      frame("b", 12_000, "invoice"),
      frame("c", spoken.endMs + FRAME_WINDOW_MS, "draft"),
    ]);
    expect(result.map((m) => [m.observation.id, m.insideSpoken])).toEqual([
      ["a", false],
      ["b", true],
      ["c", false],
    ]);
  });

  it("drops frames outside the window and frames that share no key word", () => {
    const result = matchFrames(tokens, spoken, [
      frame("early", spoken.startMs - FRAME_WINDOW_MS - 1, "invoice draft"),
      frame("late", spoken.endMs + FRAME_WINDOW_MS + 1, "invoice draft"),
      frame("other", 12_000, "settings page"),
    ]);
    expect(result).toEqual([]);
  });

  it("counts the key words a frame shares", () => {
    const [match] = matchFrames(tokens, spoken, [frame("a", 12_000, "invoice draft screen")]);
    expect(match?.sharedWords).toBe(2);
  });
});

describe("rankConfidence", () => {
  const base = {
    observation: frame("a", 12_000, "x"),
    sharedWords: STRONG_FRAME_WORDS,
    insideSpoken: true,
  };
  const strongInside = [base];

  it("is high only for an exact line with a strong frame inside the spoken time", () => {
    expect(rankConfidence({ outsideProof: false, label: "exact", matches: strongInside })).toBe(
      "high",
    );
  });

  it("is medium for a changed or reordered line", () => {
    for (const label of ["changed", "reordered"] as const) {
      expect(rankConfidence({ outsideProof: false, label, matches: strongInside })).toBe("medium");
    }
  });

  it("is medium when the best frame shares one word or sits only in the margin", () => {
    const oneWord = [{ ...base, sharedWords: 1 }];
    const margin = [{ ...base, insideSpoken: false }];
    expect(rankConfidence({ outsideProof: false, label: "exact", matches: oneWord })).toBe(
      "medium",
    );
    expect(rankConfidence({ outsideProof: false, label: "exact", matches: margin })).toBe("medium");
  });

  it("is low for a claim footage cannot prove, whatever the frames say", () => {
    expect(rankConfidence({ outsideProof: true, label: "exact", matches: strongInside })).toBe(
      "low",
    );
  });
});

describe("docs/evidence-confidence.md", () => {
  const doc = readFileSync(
    new URL("../../../docs/evidence-confidence.md", import.meta.url),
    "utf8",
  );
  const percent = (n: number) => `${Math.round(n * 100)}%`;
  const ms = (n: number) => `${n.toLocaleString("en-US")} ms`;

  it("states the thresholds the code uses", () => {
    expect(doc).toContain(percent(SPOKEN_MIN_COVERAGE));
    expect(doc).toContain(percent(SPOKEN_STRONG_COVERAGE));
    expect(doc).toContain(percent(CHECKLIST_MIN_COVERAGE));
    expect(doc).toContain(ms(FRAME_WINDOW_MS));
    expect(doc).toContain(`${STRONG_FRAME_WORDS} or more key words`);
  });

  it("says confidence is a ranking and not proof", () => {
    expect(doc).toMatch(/ranking, not proof/);
  });
});
