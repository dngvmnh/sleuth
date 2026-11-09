import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { FrameObservation, TranscriptSegment } from "@sleuth/contracts";
import { segmentScript } from "@sleuth/domain";
import { analyse, type EngineInput } from "./analyse";
import {
  explainCursedFrame,
  explainEvidence,
  explainGhost,
  explainNeedsOutsideProof,
  explainPhantomDialogue,
} from "./explain";

// A word no template contains: if it ever shows up in an output, provider text was echoed.
const MARKER = "xqzmarker";
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
  "always",
];
const lineArb = fc
  .array(fc.constantFrom(...WORDS), { minLength: 2, maxLength: 5 })
  .map((w) => w.join(" "));
const markedLineArb = fc
  .tuple(lineArb, fc.boolean())
  .map(([line, mark]) => (mark ? `${line} ${MARKER}` : line));

const inputArb = fc
  .record({
    durationMs: fc.integer({ min: 0, max: 60_000 }),
    script: fc.array(lineArb, { minLength: 1, maxLength: 5 }),
    checklist: fc.array(lineArb, { maxLength: 4 }),
    speech: fc.array(
      fc.record({
        start: fc.integer({ min: 0, max: 70_000 }),
        len: fc.integer({ min: 0, max: 8000 }),
        text: markedLineArb,
      }),
      { maxLength: 6 },
    ),
    frames: fc.array(fc.record({ at: fc.integer({ min: 0, max: 70_000 }), text: markedLineArb }), {
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
      onScreenText: [f.text],
    }));
    return {
      projectId: "p1",
      assetVersionId: "av1",
      durationMs: r.durationMs,
      analysisRunId: "run-1",
      segments: segmentScript(r.script.join("\n"), { scriptVersionId: "sv-1" }),
      checklist: r.checklist.map((label, i) => ({
        id: `c${i}`,
        projectId: "p1",
        label,
        position: i,
      })),
      transcript,
      observations,
    };
  });

describe("explanation properties", () => {
  it("never produces confirmed or human-sourced evidence", () => {
    fc.assert(
      fc.property(inputArb, (input) => {
        for (const e of analyse(input).evidence) {
          expect(e.status).not.toBe("confirmed");
          expect(e.source).toBe("ai");
        }
      }),
    );
  });

  it("gives every finding a non-empty found, notFound and limits", () => {
    fc.assert(
      fc.property(inputArb, (input) => {
        for (const f of analyse(input).findings) {
          expect(f.found.trim().length).toBeGreaterThan(0);
          expect(f.notFound.trim().length).toBeGreaterThan(0);
          expect(f.limits.trim().length).toBeGreaterThan(0);
        }
      }),
    );
  });

  it("gives every candidate a non-empty explanation", () => {
    fc.assert(
      fc.property(inputArb, (input) => {
        for (const e of analyse(input).evidence)
          expect(e.explanation.trim().length).toBeGreaterThan(0);
      }),
    );
  });

  it("never repeats transcript or frame text in an explanation", () => {
    fc.assert(
      fc.property(inputArb, (input) => {
        const out = analyse(input);
        const texts = [
          ...out.evidence.map((e) => e.explanation),
          ...out.findings.flatMap((f) => [f.found, f.notFound, f.limits]),
        ];
        for (const text of texts) expect(text).not.toContain(MARKER);
      }),
    );
  });

  it("describes confidence as a ranking that a person must confirm", () => {
    fc.assert(
      fc.property(inputArb, (input) => {
        for (const e of analyse(input).evidence) {
          if (e.status === "candidate")
            expect(e.explanation).toMatch(/ranks this match; a person must confirm it/);
        }
      }),
    );
  });
});

describe("explain", () => {
  it("fills found, notFound and limits for every finding type", () => {
    const parts = [
      explainPhantomDialogue(),
      explainNeedsOutsideProof(),
      explainCursedFrame({ matchedFrames: 1 }),
      explainCursedFrame({ matchedFrames: 3 }),
      explainGhost({ lineExists: true }),
      explainGhost({ lineExists: false }),
    ];
    for (const p of parts) {
      expect(p.found.length).toBeGreaterThan(0);
      expect(p.notFound.length).toBeGreaterThan(0);
      expect(p.limits.length).toBeGreaterThan(0);
    }
  });

  it("uses the singular for one frame and one key word", () => {
    const text = explainEvidence({
      startMs: 6000,
      endMs: 10_000,
      coverage: 1,
      label: "exact",
      outsideProof: false,
      matchedFrames: 1,
      bestSharedWords: 1,
    });
    expect(text).toContain("1 nearby frame shares up to 1 key word");
  });

  it("says when a line was spoken out of order", () => {
    const text = explainEvidence({
      startMs: 0,
      endMs: 1000,
      coverage: 1,
      label: "reordered",
      outsideProof: false,
      matchedFrames: 2,
      bestSharedWords: 2,
    });
    expect(text).toContain("out of the script's order");
  });
});
