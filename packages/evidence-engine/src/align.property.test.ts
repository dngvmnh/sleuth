import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { TranscriptSegment } from "@sleuth/contracts";
import { segmentScript } from "@sleuth/domain";
import { align } from "./align";

// Words that survive the key-word filter, so every line has key words.
const WORDS = [
  "click",
  "open",
  "invoice",
  "export",
  "client",
  "amount",
  "save",
  "preview",
  "settings",
  "report",
  "draft",
  "payment",
];
const lineArb = fc
  .array(fc.constantFrom(...WORDS), { minLength: 2, maxLength: 5 })
  .map((w) => w.join(" "));
const linesArb = fc.array(lineArb, { minLength: 1, maxLength: 7 });

const script = (lines: readonly string[]) =>
  segmentScript(lines.join("\n"), { scriptVersionId: "sv-1" });
const spoken = (lines: readonly string[]): TranscriptSegment[] =>
  lines.map((text, i) => ({
    id: `t${i + 1}`,
    projectId: "p1",
    assetVersionId: "av1",
    startMs: i * 5000,
    endMs: i * 5000 + 4000,
    text,
    words: [],
  }));

describe("align properties", () => {
  it("never calls a script read aloud in order reordered, missing or changed", () => {
    fc.assert(
      fc.property(linesArb, (lines) => {
        const result = align(script(lines), spoken(lines));
        for (const a of result.aligned) expect(a.label).toBe("exact");
        expect(result.unscripted).toEqual([]);
      }),
    );
  });

  it("uses each spoken segment for at most one script line unless the lines are identical", () => {
    fc.assert(
      fc.property(linesArb, linesArb, (lines, said) => {
        const segments = script(lines);
        const result = align(segments, spoken(said));
        const textOf = new Map(segments.map((s) => [s.id, s.text]));
        const byTranscript = new Map<string, string[]>();
        for (const a of result.aligned) {
          if (a.transcriptId === null) continue;
          byTranscript.set(a.transcriptId, [...(byTranscript.get(a.transcriptId) ?? []), a.segmentId]);
        }
        for (const ids of byTranscript.values()) {
          const texts = new Set(ids.map((id) => textOf.get(id)));
          expect(texts.size).toBe(1);
        }
      }),
    );
  });

  it("gives every script line exactly one answer, and a transcript id only when it is not missing", () => {
    fc.assert(
      fc.property(linesArb, linesArb, (lines, said) => {
        const segments = script(lines);
        const result = align(segments, spoken(said));
        expect(result.aligned.map((a) => a.segmentId)).toEqual(segments.map((s) => s.id));
        for (const a of result.aligned) {
          expect(a.transcriptId === null).toBe(a.label === "missing");
          expect(a.coverage).toBeGreaterThanOrEqual(0);
          expect(a.coverage).toBeLessThanOrEqual(1);
        }
      }),
    );
  });

  it("splits every spoken segment into used or unscripted, never both", () => {
    fc.assert(
      fc.property(linesArb, linesArb, (lines, said) => {
        const transcript = spoken(said);
        const result = align(script(lines), transcript);
        const used = new Set(result.aligned.flatMap((a) => (a.transcriptId ? [a.transcriptId] : [])));
        for (const id of result.unscripted) expect(used.has(id)).toBe(false);
        // Identical lines may share one spoken segment, so only the sum of distinct ids is fixed.
        expect(used.size + result.unscripted.length).toBe(transcript.length);
      }),
    );
  });

  it("gives the same answer when run twice", () => {
    fc.assert(
      fc.property(linesArb, linesArb, (lines, said) => {
        const segments = script(lines);
        const transcript = spoken(said);
        expect(align(segments, transcript)).toEqual(align(segments, transcript));
      }),
    );
  });
});
