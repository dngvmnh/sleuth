import type { GoldenFixture } from "@sleuth/contracts";
import type * as schema from "./schema";

type Insert<T extends { $inferInsert: unknown }> = T["$inferInsert"];

export interface SeedRows {
  projects: Insert<typeof schema.projects>[];
  assetVersions: Insert<typeof schema.assetVersions>[];
  scriptVersions: Insert<typeof schema.scriptVersions>[];
  scriptSegments: Insert<typeof schema.scriptSegments>[];
  checklistItems: Insert<typeof schema.checklistItems>[];
  transcriptSegments: Insert<typeof schema.transcriptSegments>[];
  frameObservations: Insert<typeof schema.frameObservations>[];
  evidenceCandidates: Insert<typeof schema.evidenceCandidates>[];
  findings: Insert<typeof schema.findings>[];
  processingJobs: Insert<typeof schema.processingJobs>[];
}

/**
 * Pure mapping from the golden fixture to table rows. Insert in the key order shown
 * (foreign keys). The types tie each row to the Drizzle schema, so schema drift fails typecheck.
 */
export function fixtureToRows(fx: GoldenFixture): SeedRows {
  const projectId = fx.project.id;
  return {
    projects: [fx.project],
    assetVersions: [fx.assetVersion],
    scriptVersions: [
      {
        id: fx.script.id,
        projectId,
        version: fx.script.version,
        text: fx.script.text,
        createdAt: fx.script.createdAt,
      },
    ],
    scriptSegments: fx.script.segments.map((s) => ({ ...s, projectId })),
    checklistItems: fx.checklist,
    transcriptSegments: fx.transcript,
    frameObservations: fx.frames,
    evidenceCandidates: fx.expectedEvidence,
    findings: fx.expectedFindings,
    processingJobs: [fx.job],
  };
}
