import { describe, expect, it } from "vitest";
import type { ChecklistItem, FrameObservation, TranscriptSegment } from "@sleuth/contracts";
import { segmentScript } from "@sleuth/domain";
import { analyse } from "./analyse";
import { planFrames } from "./frames";
import { mergeEvidence, mergeFindings } from "./merge";
import { needsOutsideProof } from "./text";

const base = { projectId: "p1", assetVersionId: "av1", durationMs: 20000, analysisRunId: "run1" };
const tr = (id: string, startMs: number, endMs: number, text: string): TranscriptSegment => ({
  id,
  projectId: "p1",
  assetVersionId: "av1",
  startMs,
  endMs,
  text,
  words: [],
});
const fr = (
  id: string,
  timestampMs: number,
  description: string,
  onScreenText: string[] = [],
): FrameObservation => ({
  id,
  projectId: "p1",
  assetVersionId: "av1",
  timestampMs,
  description,
  onScreenText,
});
const item = (id: string, label: string): ChecklistItem => ({
  id,
  projectId: "p1",
  label,
  position: 0,
});
const segs = (text: string) => segmentScript(text, { scriptVersionId: "sv1" });

describe("analyse", () => {
  it("flags a script line that was not spoken as Phantom Dialogue", () => {
    const out = analyse({
      ...base,
      segments: segs("Click Export to download the PDF."),
      checklist: [],
      transcript: [tr("t1", 0, 1000, "Hello everyone")],
      observations: [],
    });
    expect(out.findings.map((f) => f.type)).toEqual(["phantom_dialogue"]);
    expect(out.evidence).toEqual([]);
  });

  it("flags a checklist item with no matching footage as a Ghost", () => {
    const out = analyse({
      ...base,
      segments: segs("Open the settings page."),
      checklist: [item("c1", "Open settings page")],
      transcript: [tr("t1", 0, 2000, "Open the settings page.")],
      observations: [fr("f1", 0, "A blank desktop")],
    });
    expect(out.findings.map((f) => f.type)).toEqual(["ghost"]);
  });

  it("marks a security claim as Needs Outside Proof and never as visual evidence", () => {
    const out = analyse({
      ...base,
      segments: segs("Our data is encrypted."),
      checklist: [],
      transcript: [tr("t1", 0, 2000, "Our data is encrypted.")],
      observations: [fr("f1", 1000, "encrypted padlock data", ["encrypted"])],
    });
    expect(out.evidence).toHaveLength(1);
    expect(out.evidence[0]?.status).toBe("needs_outside_proof");
    expect(out.evidence[0]?.frameObservationIds).toEqual([]);
    expect(out.findings.map((f) => f.type)).toEqual(["needs_outside_proof"]);
  });

  it("never returns confirmed evidence and always states what was and was not found", () => {
    const out = analyse({
      ...base,
      segments: segs("Click New Invoice to start."),
      checklist: [item("c1", "Create new invoice")],
      transcript: [tr("t1", 0, 2000, "Click New Invoice to start.")],
      observations: [fr("f1", 1000, "invoice form", ["New Invoice"])],
    });
    expect(out.evidence.every((e) => e.status !== "confirmed" && e.source === "ai")).toBe(true);
    for (const f of out.findings) {
      expect(f.found.length).toBeGreaterThan(0);
      expect(f.notFound.length).toBeGreaterThan(0);
      expect(f.limits.length).toBeGreaterThan(0);
    }
  });

  it("ignores frames far from the spoken line", () => {
    const out = analyse({
      ...base,
      segments: segs("Click New Invoice to start."),
      checklist: [],
      transcript: [tr("t1", 0, 2000, "Click New Invoice to start.")],
      observations: [fr("f1", 15000, "invoice form", ["New Invoice"])],
    });
    expect(out.evidence).toEqual([]);
  });
});

describe("needsOutsideProof", () => {
  it.each(["All data is encrypted.", "We guarantee uptime.", "It is GDPR compliant."])(
    "flags %s",
    (t) => {
      expect(needsOutsideProof(t)).toBe(true);
    },
  );
  it("does not flag an ordinary step", () => {
    expect(needsOutsideProof("Click the save button.")).toBe(false);
  });
});

describe("planFrames", () => {
  it("samples from zero at the interval", () => {
    expect(planFrames(6000, { intervalMs: 2000, maxFrames: 60 })).toEqual([0, 2000, 4000, 6000]);
  });
  it("widens the step to respect the frame budget", () => {
    const out = planFrames(180000, { intervalMs: 1000, maxFrames: 60 });
    expect(out.length).toBeLessThanOrEqual(60);
    expect(Math.max(...out)).toBeLessThanOrEqual(180000);
  });
  it("returns nothing for an impossible budget", () => {
    expect(planFrames(1000, { intervalMs: 1000, maxFrames: 0 })).toEqual([]);
  });
});

describe("merge", () => {
  const produced = analyse({
    ...base,
    segments: segs("Click New Invoice to start."),
    checklist: [],
    transcript: [tr("t1", 0, 2000, "Click New Invoice to start.")],
    observations: [fr("f1", 1000, "invoice form", ["New Invoice"])],
  });

  it("keeps a human decision when the segment hash is unchanged", () => {
    const decided = produced.evidence.map((e) => ({ ...e, status: "confirmed" as const }));
    expect(mergeEvidence(decided, produced.evidence)).toEqual(decided);
  });

  it("replaces stale evidence with the fresh candidate", () => {
    const stale = produced.evidence.map((e) => ({ ...e, status: "stale" as const }));
    expect(mergeEvidence(stale, produced.evidence)).toEqual(produced.evidence);
  });

  it("keeps resolved findings resolved", () => {
    const resolved = produced.findings.map((f) => ({ ...f, status: "resolved" as const }));
    expect(mergeFindings(resolved, produced.findings)).toEqual(resolved);
  });
});
