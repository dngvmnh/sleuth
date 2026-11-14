import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { ChecklistItem, FrameObservation, TranscriptSegment } from "@sleuth/contracts";
import { segmentScript } from "@sleuth/domain";
import { analyse } from "@sleuth/evidence-engine";

// The expected output of scripts/make-evidence-clip.ps1: its speech and its on-screen text, as the
// provider would report them, run through the real engine. No network, no ffmpeg.
const spec = JSON.parse(readFileSync(join(__dirname, "evidence-clip.json"), "utf8")) as {
  script: string[];
  checklist: string[];
  slides: { speech: string; onScreen: string[]; nominalSeconds: number }[];
};

function run() {
  let t = 0;
  const transcript: TranscriptSegment[] = [];
  const observations: FrameObservation[] = [];
  spec.slides.forEach((s, i) => {
    const startMs = t;
    const endMs = t + s.nominalSeconds * 1000 - 500;
    transcript.push({ id: `t${i}`, projectId: "p1", assetVersionId: "av1", startMs, endMs, text: s.speech, words: [] });
    observations.push({
      id: `f${i}`,
      projectId: "p1",
      assetVersionId: "av1",
      timestampMs: Math.round((startMs + endMs) / 2),
      description: "A plain slide with text",
      onScreenText: s.onScreen,
    });
    t += s.nominalSeconds * 1000;
  });
  const checklist: ChecklistItem[] = spec.checklist.map((label, i) => ({ id: `c${i}`, projectId: "p1", label, position: i }));
  return analyse({
    projectId: "p1",
    assetVersionId: "av1",
    durationMs: t,
    analysisRunId: "run1",
    segments: segmentScript(spec.script.join("\n"), { scriptVersionId: "sv1" }),
    checklist,
    transcript,
    observations,
  });
}

describe("evidence clip (WP3)", () => {
  const out = run();

  it("makes evidence for every script line, all candidates", () => {
    expect(out.evidence).toHaveLength(spec.script.length);
    expect(out.evidence.every((e) => e.status === "candidate")).toBe(true);
  });

  it("raises a Cursed Frame finding tied to evidence, so prod-e2e step 7 has a target", () => {
    const tied = out.findings.filter((f) => f.status === "open" && f.evidenceId);
    expect(tied.length).toBeGreaterThanOrEqual(1);
    expect(tied.every((f) => f.type === "cursed_frame")).toBe(true);
  });

  it("covers the first checklist item, so there is no Ghost for it", () => {
    expect(out.findings.some((f) => f.type === "ghost" && f.checklistItemId === "c0")).toBe(false);
  });

  it("has the same script and checklist as scripts/prod-e2e.ts", () => {
    const src = readFileSync(join(__dirname, "prod-e2e.ts"), "utf8");
    for (const line of [...spec.script, ...spec.checklist]) expect(src).toContain(`"${line}"`);
  });
});
