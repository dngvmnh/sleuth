import { z } from "zod";
import {
  AssetVersionSchema,
  ChecklistItemSchema,
  EvidenceCandidateSchema,
  FindingSchema,
  FrameObservationSchema,
  ProcessingJobSchema,
  ProjectSchema,
  ScriptVersionSchema,
  TranscriptSegmentSchema,
} from "./entities";

/** Shape of `fixtures/golden/<name>/`. The shared contract between frontend, backend and worker. */
export const GoldenFixtureSchema = z.object({
  project: ProjectSchema,
  assetVersion: AssetVersionSchema,
  script: ScriptVersionSchema,
  checklist: z.array(ChecklistItemSchema),
  transcript: z.array(TranscriptSegmentSchema),
  frames: z.array(FrameObservationSchema),
  expectedEvidence: z.array(EvidenceCandidateSchema),
  expectedFindings: z.array(FindingSchema),
  job: ProcessingJobSchema,
});
export type GoldenFixture = z.infer<typeof GoldenFixtureSchema>;
