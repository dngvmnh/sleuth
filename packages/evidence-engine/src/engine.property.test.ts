import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { FrameObservation, TranscriptSegment } from "@sleuth/contracts";
import { segmentScript } from "@sleuth/domain";
import { analyse, type EngineInput } from "./analyse";
import { mergeEvidence, mergeFindings } from "./merge";

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
  "encrypted",
];
const wordArb = fc.constantFrom(...WORDS);
const lineArb = fc.array(wordArb, { minLength: 2, maxLength: 5 }).map((w) => w.join(" "));

const inputArb = fc
  .record({
    durationMs: fc.integer({ min: 0, max: 60000 }),
    script: fc.array(lineArb, { minLength: 1, maxLength: 5 }),
    speech: fc.array(
      fc.record({
        start: fc.integer({ min: 0, max: 70000 }),
        len: fc.integer({ min: 0, max: 8000 }),
        text: lineArb,
      }),
      { maxLength: 6 },
    ),
    frames: fc.array(fc.record({ at: fc.integer({ min: 0, max: 70000 }), text: lineArb }), {
      maxLength: 8,
    }),
  })
  .map((r): EngineInput => {
    const transcript: TranscriptSegment[] = r.speech.map((s, i) => ({
      id: `t${i}`,
      projectId: "p1",
      assetVersionId: "av1",
      startMs: s.start,
      endMs: s.start + s.len,
      text: s.text,
      words: [],
    }));
    const observations: FrameObservation[] = r.frames.map((f, i) => ({
      id: `f${i}`,
      projectId: "p1",
      assetVersionId: "av1",
      timestampMs: f.at,
      description: f.text,
      onScreenText: [],
    }));
    return {
      projectId: "p1",
      assetVersionId: "av1",
      durationMs: r.durationMs,
      analysisRunId: "run1",
      segments: segmentScript(r.script.join("\n"), { scriptVersionId: "sv1" }),
      checklist: [{ id: "c1", projectId: "p1", label: "Open settings", position: 0 }],
      transcript,
      observations,
    };
  });

describe("evidence engine properties", () => {
  it("keeps every stored timestamp within 0 <= startMs <= endMs <= durationMs", () => {
    fc.assert(
      fc.property(inputArb, (input) => {
        for (const e of analyse(input).evidence) {
          expect(e.startMs).toBeGreaterThanOrEqual(0);
          expect(e.startMs).toBeLessThanOrEqual(e.endMs);
          expect(e.endMs).toBeLessThanOrEqual(input.durationMs);
          expect(Number.isInteger(e.startMs) && Number.isInteger(e.endMs)).toBe(true);
        }
      }),
    );
  });

  it("never produces confirmed or human-sourced evidence", () => {
    fc.assert(
      fc.property(inputArb, (input) => {
        const { evidence } = analyse(input);
        expect(evidence.every((e) => e.status !== "confirmed" && e.source === "ai")).toBe(true);
      }),
    );
  });

  it("creates no duplicate candidates or findings when the same analysis runs twice", () => {
    fc.assert(
      fc.property(inputArb, (input) => {
        const first = analyse(input);
        const second = analyse(input);
        const evidence = mergeEvidence(mergeEvidence([], first.evidence), second.evidence);
        const findings = mergeFindings(mergeFindings([], first.findings), second.findings);
        expect(evidence).toHaveLength(new Set(evidence.map((e) => e.id)).size);
        expect(evidence).toEqual(mergeEvidence([], first.evidence));
        expect(findings).toHaveLength(new Set(findings.map((f) => f.id)).size);
      }),
    );
  });

  it("gives every finding a plain label and the three explanation parts", () => {
    fc.assert(
      fc.property(inputArb, (input) => {
        for (const f of analyse(input).findings) {
          expect(f.plainLabel.length).toBeGreaterThan(0);
          expect(f.found.length + f.notFound.length + f.limits.length).toBeGreaterThan(0);
          expect(f.found && f.notFound && f.limits).toBeTruthy();
        }
      }),
    );
  });
});
