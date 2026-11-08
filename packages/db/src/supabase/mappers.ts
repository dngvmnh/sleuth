import type {
  AssetVersion,
  AuditEvent,
  ChecklistItem,
  EvidenceCandidate,
  Finding,
  ProcessingJob,
  Project,
  ReshootTask,
  ReviewDecision,
  ScriptSegment,
  ScriptVersion,
  Seal,
} from "@sleuth/contracts";
import type * as t from "../schema";

/**
 * Postgres hands back `2026-11-08 12:00:00.123+00`; the contracts want ISO 8601 with a `Z`.
 * Parsing by hand keeps this independent of how the engine formats the zone.
 */
export function toIso(value: string): string {
  const m = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})(\.\d+)?(Z|[+-]\d{2}(?::?\d{2})?)?$/.exec(
    value,
  );
  if (!m) throw new Error("Unexpected timestamp format from the database.");
  const zone = m[4] ?? "Z";
  const normalisedZone =
    zone === "Z"
      ? "Z"
      : zone.length === 3
        ? `${zone}:00`
        : zone.includes(":")
          ? zone
          : `${zone.slice(0, 3)}:${zone.slice(3)}`;
  const date = new Date(`${m[1]}T${m[2]}${m[3] ?? ""}${normalisedZone}`);
  if (Number.isNaN(date.getTime())) throw new Error("Unexpected timestamp from the database.");
  return date.toISOString();
}

export const projectOf = (r: typeof t.projects.$inferSelect): Project => ({
  id: r.id,
  name: r.name,
  ownerId: r.ownerId,
  isDemo: r.isDemo,
  currentScriptVersionId: r.currentScriptVersionId,
  currentAssetVersionId: r.currentAssetVersionId,
  createdAt: toIso(r.createdAt),
});

export const assetOf = (r: typeof t.assetVersions.$inferSelect): AssetVersion => ({
  id: r.id,
  projectId: r.projectId,
  version: r.version,
  storagePath: r.storagePath,
  mimeType: r.mimeType,
  durationMs: r.durationMs,
  createdAt: toIso(r.createdAt),
});

export const segmentOf = (r: typeof t.scriptSegments.$inferSelect): ScriptSegment => ({
  id: r.id,
  scriptVersionId: r.scriptVersionId,
  index: r.index,
  text: r.text,
  hash: r.hash,
});

export const scriptOf = (
  r: typeof t.scriptVersions.$inferSelect,
  segments: (typeof t.scriptSegments.$inferSelect)[],
): ScriptVersion => ({
  id: r.id,
  projectId: r.projectId,
  version: r.version,
  text: r.text,
  segments: segments.map(segmentOf),
  createdAt: toIso(r.createdAt),
});

export const checklistOf = (r: typeof t.checklistItems.$inferSelect): ChecklistItem => ({
  id: r.id,
  projectId: r.projectId,
  label: r.label,
  position: r.position,
});

export const evidenceOf = (r: typeof t.evidenceCandidates.$inferSelect): EvidenceCandidate => ({
  id: r.id,
  projectId: r.projectId,
  checklistItemId: r.checklistItemId,
  scriptSegmentId: r.scriptSegmentId,
  scriptVersionId: r.scriptVersionId,
  segmentHash: r.segmentHash,
  assetVersionId: r.assetVersionId,
  startMs: r.startMs,
  endMs: r.endMs,
  transcriptSegmentIds: r.transcriptSegmentIds,
  frameObservationIds: r.frameObservationIds,
  explanation: r.explanation,
  confidence: r.confidence,
  status: r.status,
  source: r.source,
  analysisRunId: r.analysisRunId,
});

export const findingOf = (r: typeof t.findings.$inferSelect): Finding => ({
  id: r.id,
  projectId: r.projectId,
  type: r.type,
  plainLabel: r.plainLabel,
  checklistItemId: r.checklistItemId,
  scriptSegmentId: r.scriptSegmentId,
  evidenceId: r.evidenceId,
  found: r.found,
  notFound: r.notFound,
  limits: r.limits,
  status: r.status,
  analysisRunId: r.analysisRunId,
});

export const decisionOf = (r: typeof t.reviewDecisions.$inferSelect): ReviewDecision => ({
  id: r.id,
  evidenceId: r.evidenceId,
  decision: r.decision,
  reviewerId: r.reviewerId,
  note: r.note,
  createdAt: toIso(r.createdAt),
});

export const reshootOf = (r: typeof t.reshootTasks.$inferSelect): ReshootTask => ({
  id: r.id,
  projectId: r.projectId,
  checklistItemId: r.checklistItemId,
  scriptSegmentId: r.scriptSegmentId,
  findingId: r.findingId,
  note: r.note,
  status: r.status,
  createdAt: toIso(r.createdAt),
});

export const jobOf = (r: typeof t.processingJobs.$inferSelect): ProcessingJob => ({
  id: r.id,
  projectId: r.projectId,
  kind: r.kind,
  status: r.status,
  attempts: r.attempts,
  maxAttempts: r.maxAttempts,
  lockedBy: r.lockedBy,
  heartbeatAt: r.heartbeatAt === null ? null : toIso(r.heartbeatAt),
  error: r.error,
  payload: r.payload,
  createdAt: toIso(r.createdAt),
  updatedAt: toIso(r.updatedAt),
});

export const auditOf = (r: typeof t.auditEvents.$inferSelect): AuditEvent => ({
  id: r.id,
  projectId: r.projectId,
  actorId: r.actorId,
  type: r.type,
  data: r.data,
  createdAt: toIso(r.createdAt),
});

export const sealOf = (r: typeof t.seals.$inferSelect): Seal => ({
  id: r.id,
  projectId: r.projectId,
  sealedBy: r.sealedBy,
  sealedAt: toIso(r.sealedAt),
  scriptVersionId: r.scriptVersionId,
  assetVersionId: r.assetVersionId,
  coverage: r.coverage,
  note: r.note,
  status: r.status,
  brokenAt: r.brokenAt === null ? null : toIso(r.brokenAt),
  brokenReason: r.brokenReason,
});
