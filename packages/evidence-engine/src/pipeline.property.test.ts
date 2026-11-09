import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type {
  ChecklistItem,
  EvidenceCandidate,
  FrameObservation,
  TranscriptSegment,
} from "@sleuth/contracts";
import { segmentScript } from "@sleuth/domain";
import { createMockTranscriptionProvider, createMockVideoAnalysisProvider } from "@sleuth/media";
import { planFrames } from "./frames";
import { mergeEvidence, mergeFindings } from "./merge";
import { runPipeline, type PipelineOptions } from "./pipeline";

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
  "draft",
  "report",
];
const lineArb = fc
  .array(fc.constantFrom(...WORDS), { minLength: 2, maxLength: 5 })
  .map((w) => w.join(" "));

const FRAME_INTERVAL_MS = 2000;
const MAX_FRAMES = 60;

interface Scenario {
  options: PipelineOptions;
  lines: string[];
  transcript: TranscriptSegment[];
  observations: FrameObservation[];
}

/** Random project: a script, a checklist, speech that often repeats script lines, and frames. */
const scenarioArb = fc
  .record({
    durationMs: fc.integer({ min: 0, max: 60_000 }),
    script: fc.array(lineArb, { minLength: 1, maxLength: 6 }),
    checklist: fc.array(lineArb, { maxLength: 4 }),
    speech: fc.array(
      fc.record({
        pick: fc.nat({ max: 6 }),
        reuse: fc.boolean(),
        fresh: lineArb,
        start: fc.double({ min: 0, max: 1, noNaN: true }),
        len: fc.integer({ min: 0, max: 8000 }),
      }),
      { maxLength: 7 },
    ),
    frameTexts: fc.array(fc.option(lineArb, { nil: null }), { maxLength: 40 }),
  })
  .map((r): Scenario => {
    const segments = segmentScript(r.script.join("\n"), { scriptVersionId: "sv-1" });
    const transcript: TranscriptSegment[] = r.speech.map((s, i) => {
      const startMs = Math.floor(s.start * r.durationMs);
      const text = s.reuse ? (r.script[s.pick % r.script.length] ?? s.fresh) : s.fresh;
      return {
        id: `t${i}`,
        projectId: "p1",
        assetVersionId: "av1",
        startMs,
        endMs: Math.min(startMs + s.len, r.durationMs),
        text,
        words: [],
      };
    });
    const observations: FrameObservation[] = [];
    for (const [i, at] of planFrames(r.durationMs, {
      intervalMs: FRAME_INTERVAL_MS,
      maxFrames: MAX_FRAMES,
    }).entries()) {
      const text = r.frameTexts[i];
      if (text)
        observations.push({
          id: `f${i}`,
          projectId: "p1",
          assetVersionId: "av1",
          timestampMs: at,
          description: text,
          onScreenText: [text],
        });
    }
    const checklist: ChecklistItem[] = r.checklist.map((label, i) => ({
      id: `c${i}`,
      projectId: "p1",
      label,
      position: i,
    }));
    return {
      lines: r.script,
      transcript,
      observations,
      options: {
        projectId: "p1",
        assetVersionId: "av1",
        durationMs: r.durationMs,
        analysisRunId: "run-1",
        segments,
        checklist,
        transcription: createMockTranscriptionProvider(transcript),
        videoAnalysis: createMockVideoAnalysisProvider(observations),
        frameIntervalMs: FRAME_INTERVAL_MS,
        maxFrames: MAX_FRAMES,
      },
    };
  });

/** A random non-empty subset of the script's line ids, chosen by a bit mask. */
function pickIds(options: PipelineOptions, mask: number): string[] {
  const ids = options.segments.map((s) => s.id);
  const chosen = ids.filter((_, i) => (mask >> i) & 1);
  return chosen.length > 0 ? chosen : ids.slice(0, 1);
}

const maskArb = fc.integer({ min: 1, max: 63 });

describe("runPipeline with segmentIds", () => {
  it("never produces evidence or line findings outside segmentIds", async () => {
    await fc.assert(
      fc.asyncProperty(scenarioArb, maskArb, async (s, mask) => {
        const segmentIds = pickIds(s.options, mask);
        const wanted = new Set(segmentIds);
        const out = await runPipeline({ ...s.options, segmentIds });
        for (const e of out.evidence) expect(wanted.has(e.scriptSegmentId)).toBe(true);
        for (const f of out.findings) {
          if (f.type !== "ghost") expect(wanted.has(f.scriptSegmentId ?? "")).toBe(true);
        }
      }),
    );
  });

  it("gives, for the chosen lines, exactly what a full run gives", async () => {
    await fc.assert(
      fc.asyncProperty(scenarioArb, maskArb, async (s, mask) => {
        const segmentIds = pickIds(s.options, mask);
        const wanted = new Set(segmentIds);
        const full = await runPipeline(s.options);
        const targeted = await runPipeline({ ...s.options, segmentIds });
        expect(targeted.evidence).toEqual(
          full.evidence.filter((e) => wanted.has(e.scriptSegmentId)),
        );
        expect(targeted.findings.filter((f) => f.type !== "ghost")).toEqual(
          full.findings.filter((f) => f.type !== "ghost" && wanted.has(f.scriptSegmentId ?? "")),
        );
      }),
    );
  });

  it("leaves the evidence on other lines identical when the result is merged", async () => {
    await fc.assert(
      fc.asyncProperty(scenarioArb, maskArb, async (s, mask) => {
        const segmentIds = pickIds(s.options, mask);
        const wanted = new Set(segmentIds);
        const full = await runPipeline(s.options);
        const targeted = await runPipeline({ ...s.options, segmentIds });
        const merged = mergeEvidence(full.evidence, targeted.evidence);
        for (const before of full.evidence) {
          if (!wanted.has(before.scriptSegmentId))
            expect(merged.find((e) => e.id === before.id)).toEqual(before);
        }
      }),
    );
  });

  it("raises no Ghost finding on a targeted run that has no stored evidence to read", async () => {
    await fc.assert(
      fc.asyncProperty(scenarioArb, maskArb, async (s, mask) => {
        const out = await runPipeline({ ...s.options, segmentIds: pickIds(s.options, mask) });
        expect(out.findings.filter((f) => f.type === "ghost")).toEqual([]);
      }),
    );
  });

  it("finds the same Ghosts as a full run when the stored evidence is the full run's", async () => {
    await fc.assert(
      fc.asyncProperty(scenarioArb, maskArb, async (s, mask) => {
        const full = await runPipeline(s.options);
        const targeted = await runPipeline({
          ...s.options,
          segmentIds: pickIds(s.options, mask),
          existingEvidence: full.evidence,
        });
        const ghosts = (r: { findings: { type: string; id: string }[] }) =>
          r.findings.filter((f) => f.type === "ghost").map((f) => f.id);
        expect(ghosts(targeted)).toEqual(ghosts(full));
      }),
    );
  });

  it("ignores existingEvidence on a full run", async () => {
    await fc.assert(
      fc.asyncProperty(scenarioArb, async (s) => {
        const plain = await runPipeline(s.options);
        const withStored = await runPipeline({ ...s.options, existingEvidence: plain.evidence });
        expect(withStored).toEqual(plain);
      }),
    );
  });

  it("treats a stale or rejected stored row as no cover for its checklist item", async () => {
    await fc.assert(
      fc.asyncProperty(scenarioArb, async (s) => {
        const full = await runPipeline(s.options);
        const first = s.options.segments[0];
        if (!first) return;
        const others = s.options.segments.slice(1).map((x) => x.id);
        if (others.length === 0) return;
        const spoiled: EvidenceCandidate[] = full.evidence.map((e) => ({ ...e, status: "stale" }));
        const targeted = await runPipeline({
          ...s.options,
          segmentIds: [first.id],
          existingEvidence: spoiled,
        });
        // With every stored row stale, only the analysed line's frames can cover an item. A claim\n        // on any line still covers its item, because that needs only the script text.
        const covered = new Set(
          targeted.evidence
            .filter((e) => e.status === "candidate" && e.frameObservationIds.length > 0)
            .flatMap((e) => (e.checklistItemId ? [e.checklistItemId] : [])),
        );
        const coveredByProof = new Set(
          full.findings
            .filter((f) => f.type === "needs_outside_proof")
            .flatMap((f) => (f.checklistItemId ? [f.checklistItemId] : [])),
        );
        for (const item of s.options.checklist) {
          const hasGhost = targeted.findings.some(
            (f) => f.type === "ghost" && f.checklistItemId === item.id,
          );
          expect(hasGhost).toBe(!covered.has(item.id) && !coveredByProof.has(item.id));
        }
      }),
    );
  });
});

describe("running the pipeline twice (requirement 5.7)", () => {
  it("gives the same result both times", async () => {
    await fc.assert(
      fc.asyncProperty(scenarioArb, async (s) => {
        expect(await runPipeline(s.options)).toEqual(await runPipeline(s.options));
      }),
    );
  });

  it("adds no duplicate evidence or findings when the second run is merged in", async () => {
    await fc.assert(
      fc.asyncProperty(scenarioArb, async (s) => {
        const first = await runPipeline(s.options);
        const second = await runPipeline(s.options);
        const evidence = mergeEvidence(mergeEvidence([], first.evidence), second.evidence);
        const findings = mergeFindings(mergeFindings([], first.findings), second.findings);
        expect(evidence).toEqual(mergeEvidence([], first.evidence));
        expect(findings).toEqual(mergeFindings([], first.findings));
        expect(new Set(evidence.map((e) => e.id)).size).toBe(evidence.length);
        expect(new Set(findings.map((f) => f.id)).size).toBe(findings.length);
      }),
    );
  });

  it("keeps a human decision whose line text is unchanged, and changes nothing else", async () => {
    await fc.assert(
      fc.asyncProperty(
        scenarioArb,
        fc.nat(),
        fc.constantFrom("confirmed", "rejected"),
        async (s, at, decision) => {
          const first = await runPipeline(s.options);
          if (first.evidence.length === 0) return;
          const target = first.evidence[at % first.evidence.length] as EvidenceCandidate;
          const stored = first.evidence.map((e) =>
            e.id === target.id ? { ...e, status: decision, source: "human" as const } : e,
          );
          const second = await runPipeline(s.options);
          const merged = mergeEvidence(stored, second.evidence);
          expect(merged.find((e) => e.id === target.id)).toEqual({
            ...target,
            status: decision,
            source: "human",
          });
          for (const e of first.evidence) {
            if (e.id !== target.id) expect(merged.find((m) => m.id === e.id)).toEqual(e);
          }
          expect(merged).toHaveLength(first.evidence.length);
        },
      ),
    );
  });

  it("replaces a human decision when the line text changed", async () => {
    await fc.assert(
      fc.asyncProperty(scenarioArb, fc.nat(), async (s, at) => {
        const first = await runPipeline(s.options);
        if (first.evidence.length === 0) return;
        const target = first.evidence[at % first.evidence.length] as EvidenceCandidate;
        const stored = first.evidence.map((e) =>
          e.id === target.id ? { ...e, status: "confirmed" as const, segmentHash: "old-hash" } : e,
        );
        const merged = mergeEvidence(stored, first.evidence);
        expect(merged.find((e) => e.id === target.id)).toEqual(target);
      }),
    );
  });

  it("keeps every timestamp inside the video and in order", async () => {
    await fc.assert(
      fc.asyncProperty(scenarioArb, async (s) => {
        const out = await runPipeline(s.options);
        for (const e of out.evidence) {
          expect(Number.isInteger(e.startMs) && Number.isInteger(e.endMs)).toBe(true);
          expect(e.startMs).toBeGreaterThanOrEqual(0);
          expect(e.startMs).toBeLessThanOrEqual(e.endMs);
          expect(e.endMs).toBeLessThanOrEqual(s.options.durationMs);
        }
      }),
    );
  });

  it("never produces confirmed or human-sourced evidence", async () => {
    await fc.assert(
      fc.asyncProperty(scenarioArb, async (s) => {
        const out = await runPipeline(s.options);
        for (const e of out.evidence) {
          expect(e.status).not.toBe("confirmed");
          expect(e.source).toBe("ai");
        }
      }),
    );
  });
});
