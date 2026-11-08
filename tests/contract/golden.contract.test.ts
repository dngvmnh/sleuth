import { describe, expect, it } from "vitest";
import { EvidenceCandidateSchema, FindingSchema, GoldenFixtureSchema } from "@sleuth/contracts";
import { fixtureToRows } from "@sleuth/db";
import { createFixtureStore, loadGoldenFixture } from "@sleuth/db/fixture";
import { segmentScript } from "@sleuth/domain";
import { runPipeline } from "@sleuth/evidence-engine";
import { createMockTranscriptionProvider, createMockVideoAnalysisProvider } from "@sleuth/media";
import { buildGoldenFixture, DURATION_MS, RUN_ID } from "../../fixtures/golden/build";

/**
 * The golden fixture is the shared contract. If this file fails, a contract, the fixture,
 * the engine or the database mapping changed without the others. Fix the cause (or regenerate
 * with `pnpm tsx fixtures/golden/generate.ts` and review the JSON diff), then label the PR `contract-change`.
 */

const fixture = loadGoldenFixture();

describe("golden fixture is valid", () => {
  it("parses against the contract schemas", () => {
    expect(() => GoldenFixtureSchema.parse(fixture)).not.toThrow();
  });

  it("matches what the generator builds (JSON files are not hand-edited)", () => {
    expect(fixture).toEqual(buildGoldenFixture());
  });

  it("keeps every timestamp within 0 <= startMs <= endMs <= durationMs", () => {
    const d = fixture.assetVersion.durationMs;
    for (const e of fixture.expectedEvidence) {
      expect(e.startMs).toBeGreaterThanOrEqual(0);
      expect(e.startMs).toBeLessThanOrEqual(e.endMs);
      expect(e.endMs).toBeLessThanOrEqual(d);
    }
    for (const t of fixture.transcript) expect(t.endMs).toBeLessThanOrEqual(d);
    for (const f of fixture.frames) expect(f.timestampMs).toBeLessThanOrEqual(d);
  });

  it("has no confirmed evidence: AI output is only ever a candidate", () => {
    expect(
      fixture.expectedEvidence.every((e) => e.status !== "confirmed" && e.source === "ai"),
    ).toBe(true);
  });

  it("gives every finding a plain label and an explanation", () => {
    for (const f of fixture.expectedFindings) {
      expect(f.plainLabel).not.toBe("");
      expect(f.found && f.notFound && f.limits).toBeTruthy();
    }
  });

  it("stores script segments exactly as the domain segments the script text", () => {
    expect(fixture.script.segments).toEqual(
      segmentScript(fixture.script.text, { scriptVersionId: fixture.script.id }),
    );
  });
});

describe("worker pipeline (mock providers) reproduces the expected output", () => {
  it("builds exactly the expected evidence graph and findings", async () => {
    const out = await runPipeline({
      projectId: fixture.project.id,
      assetVersionId: fixture.assetVersion.id,
      durationMs: fixture.assetVersion.durationMs,
      analysisRunId: RUN_ID,
      segments: fixture.script.segments,
      checklist: fixture.checklist,
      transcription: createMockTranscriptionProvider(fixture.transcript),
      videoAnalysis: createMockVideoAnalysisProvider(fixture.frames),
      frameIntervalMs: 2000,
      maxFrames: 60,
    });
    expect(out.evidence).toEqual(fixture.expectedEvidence);
    expect(out.findings).toEqual(fixture.expectedFindings);
    expect(out.rejectedTranscriptItems + out.rejectedObservations).toBe(0);
    expect(DURATION_MS).toBe(fixture.assetVersion.durationMs);
  });
});

describe("frontend data source (fixture store) serves the expected output", () => {
  it("returns the same evidence and findings through the store the API uses", async () => {
    const store = createFixtureStore();
    const id = fixture.project.id;
    const evidence = await store.listEvidence({ userId: null }, id);
    const findings = await store.listFindings({ userId: null }, id);
    expect(evidence.map((e) => EvidenceCandidateSchema.parse(e))).toEqual(fixture.expectedEvidence);
    expect(findings.map((f) => FindingSchema.parse(f))).toEqual(fixture.expectedFindings);
  });
});

describe("database seed maps the fixture without loss", () => {
  const rows = fixtureToRows(fixture);

  it("produces one row per fixture entity", () => {
    expect(rows.projects).toHaveLength(1);
    expect(rows.scriptSegments).toHaveLength(fixture.script.segments.length);
    expect(rows.checklistItems).toHaveLength(fixture.checklist.length);
    expect(rows.transcriptSegments).toHaveLength(fixture.transcript.length);
    expect(rows.frameObservations).toHaveLength(fixture.frames.length);
    expect(rows.evidenceCandidates).toEqual(fixture.expectedEvidence);
    expect(rows.findings).toEqual(fixture.expectedFindings);
  });

  it("keeps the demo project public and ownerless", () => {
    expect(rows.projects[0]?.isDemo).toBe(true);
    expect(rows.projects[0]?.ownerId).toBeNull();
  });

  it("scopes every segment row to the project and script version", () => {
    for (const s of rows.scriptSegments) {
      expect(s.projectId).toBe(fixture.project.id);
      expect(s.scriptVersionId).toBe(fixture.script.id);
    }
  });
});
