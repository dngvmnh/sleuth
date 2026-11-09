import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ProcessingJob } from "@sleuth/contracts";
import { loadGoldenFixture } from "@sleuth/db/fixture";
import { runPipeline } from "@sleuth/evidence-engine";
import { createMockTranscriptionProvider, createMockVideoAnalysisProvider } from "@sleuth/media";
import { OUTPUT_FILE } from "./fixture-queue";

export type JobHandler = (job: ProcessingJob) => Promise<void>;

export interface FixtureHandlerOptions {
  outDir: string;
  maxFrames: number;
  maxVideoSeconds: number;
}

/**
 * Fixture mode: reads the golden fixture inputs, runs the real pipeline with the mock
 * providers, and writes the result to JSON. Idempotent: the same job writes the same file.
 */
export function createFixtureHandler(options: FixtureHandlerOptions): JobHandler {
  return async (job) => {
    const fx = loadGoldenFixture();
    if (job.payload.assetVersionId !== fx.assetVersion.id) {
      throw new Error("Job refers to a video that is not in the fixture.");
    }
    if (fx.assetVersion.durationMs > options.maxVideoSeconds * 1000) {
      throw new Error("Video is longer than the allowed maximum.");
    }
    const result = await runPipeline({
      projectId: job.projectId,
      assetVersionId: fx.assetVersion.id,
      durationMs: fx.assetVersion.durationMs,
      analysisRunId: `run-${job.id}`,
      segments: fx.script.segments,
      checklist: fx.checklist,
      transcription: createMockTranscriptionProvider(fx.transcript),
      videoAnalysis: createMockVideoAnalysisProvider(fx.frames),
      frameIntervalMs: 2000,
      maxFrames: options.maxFrames,
    });
    mkdirSync(options.outDir, { recursive: true });
    writeFileSync(
      join(options.outDir, OUTPUT_FILE),
      `${JSON.stringify({ jobId: job.id, evidence: result.evidence, findings: result.findings }, null, 2)}\n`,
    );
  };
}
