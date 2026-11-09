import { z } from "zod";

/** Integer milliseconds from video start. */
export const MsSchema = z.number().int().nonnegative();
export const IdSchema = z.string().min(1);
export const IsoDateSchema = z.string().datetime();

export const ProjectSchema = z.object({
  id: IdSchema,
  name: z.string().min(1).max(120),
  /** Null for the public demo project. */
  ownerId: z.string().min(1).nullable(),
  isDemo: z.boolean(),
  currentScriptVersionId: IdSchema.nullable(),
  currentAssetVersionId: IdSchema.nullable(),
  createdAt: IsoDateSchema,
  /**
   * Last change: any new video, script, checklist, review, reshoot, seal or finished analysis.
   * Equals `createdAt` until the first change. Project lists sort by this, newest first.
   */
  updatedAt: IsoDateSchema,
});
export type Project = z.infer<typeof ProjectSchema>;

export const AssetVersionSchema = z.object({
  id: IdSchema,
  projectId: IdSchema,
  version: z.number().int().positive(),
  storagePath: z.string().min(1),
  mimeType: z.string().min(1),
  durationMs: MsSchema,
  createdAt: IsoDateSchema,
});
export type AssetVersion = z.infer<typeof AssetVersionSchema>;

export const ScriptSegmentSchema = z.object({
  /** Stable across script versions: an edited sentence keeps its id. */
  id: IdSchema,
  scriptVersionId: IdSchema,
  index: z.number().int().nonnegative(),
  text: z.string().min(1),
  /** Hash of the normalised text. See ADR 0004. */
  hash: z.string().regex(/^[0-9a-f]{64}$/),
});
export type ScriptSegment = z.infer<typeof ScriptSegmentSchema>;

export const ScriptVersionSchema = z.object({
  id: IdSchema,
  projectId: IdSchema,
  version: z.number().int().positive(),
  text: z.string(),
  segments: z.array(ScriptSegmentSchema),
  createdAt: IsoDateSchema,
});
export type ScriptVersion = z.infer<typeof ScriptVersionSchema>;

export const ChecklistItemSchema = z.object({
  id: IdSchema,
  projectId: IdSchema,
  label: z.string().min(1).max(300),
  position: z.number().int().nonnegative(),
});
export type ChecklistItem = z.infer<typeof ChecklistItemSchema>;

export const TranscriptWordSchema = z
  .object({ text: z.string().min(1), startMs: MsSchema, endMs: MsSchema })
  .refine((w) => w.startMs <= w.endMs, { message: "startMs must be <= endMs" });
export type TranscriptWord = z.infer<typeof TranscriptWordSchema>;

export const TranscriptSegmentSchema = z
  .object({
    id: IdSchema,
    projectId: IdSchema,
    assetVersionId: IdSchema,
    startMs: MsSchema,
    endMs: MsSchema,
    text: z.string().min(1),
    words: z.array(TranscriptWordSchema),
  })
  .refine((s) => s.startMs <= s.endMs, { message: "startMs must be <= endMs" });
export type TranscriptSegment = z.infer<typeof TranscriptSegmentSchema>;

export const FrameObservationSchema = z.object({
  id: IdSchema,
  projectId: IdSchema,
  assetVersionId: IdSchema,
  timestampMs: MsSchema,
  description: z.string().min(1),
  /** Text read from the screen at this frame. */
  onScreenText: z.array(z.string()),
});
export type FrameObservation = z.infer<typeof FrameObservationSchema>;

export const ConfidenceSchema = z.enum(["low", "medium", "high"]);
export type Confidence = z.infer<typeof ConfidenceSchema>;

export const EvidenceStatusSchema = z.enum([
  "candidate",
  "confirmed",
  "rejected",
  "stale",
  "needs_reshoot",
  "needs_outside_proof",
]);
export type EvidenceStatus = z.infer<typeof EvidenceStatusSchema>;

export const EvidenceCandidateSchema = z
  .object({
    id: IdSchema,
    projectId: IdSchema,
    checklistItemId: IdSchema.nullable(),
    scriptSegmentId: IdSchema,
    scriptVersionId: IdSchema,
    segmentHash: z.string().regex(/^[0-9a-f]{64}$/),
    assetVersionId: IdSchema,
    startMs: MsSchema,
    endMs: MsSchema,
    transcriptSegmentIds: z.array(IdSchema),
    frameObservationIds: z.array(IdSchema),
    explanation: z.string().min(1),
    confidence: ConfidenceSchema,
    status: EvidenceStatusSchema,
    source: z.enum(["ai", "human"]),
    analysisRunId: IdSchema,
  })
  .refine((e) => e.startMs <= e.endMs, { message: "startMs must be <= endMs" });
export type EvidenceCandidate = z.infer<typeof EvidenceCandidateSchema>;

export const FindingTypeSchema = z.enum([
  "ghost",
  "phantom_dialogue",
  "cursed_frame",
  "poltergeist",
  "needs_outside_proof",
]);
export type FindingType = z.infer<typeof FindingTypeSchema>;

export const FindingSchema = z.object({
  id: IdSchema,
  projectId: IdSchema,
  type: FindingTypeSchema,
  /** Ordinary-language label shown beside the spooky one. */
  plainLabel: z.string().min(1),
  checklistItemId: IdSchema.nullable(),
  scriptSegmentId: IdSchema.nullable(),
  evidenceId: IdSchema.nullable(),
  /** What was found. */
  found: z.string().min(1),
  /** What was not found. */
  notFound: z.string().min(1),
  /** The limits of this check. */
  limits: z.string().min(1),
  status: z.enum(["open", "resolved"]),
  analysisRunId: IdSchema,
});
export type Finding = z.infer<typeof FindingSchema>;

export const ReviewDecisionKindSchema = z.enum([
  "confirm",
  "reject",
  "needs_reshoot",
  "needs_outside_proof",
]);
export type ReviewDecisionKind = z.infer<typeof ReviewDecisionKindSchema>;

export const ReviewDecisionSchema = z.object({
  id: IdSchema,
  evidenceId: IdSchema,
  decision: ReviewDecisionKindSchema,
  /** A human user id. Required: no decision without a person. */
  reviewerId: z.string().min(1),
  note: z.string().max(1000).nullable(),
  createdAt: IsoDateSchema,
});
export type ReviewDecision = z.infer<typeof ReviewDecisionSchema>;

export const ReshootTaskSchema = z.object({
  id: IdSchema,
  projectId: IdSchema,
  checklistItemId: IdSchema.nullable(),
  scriptSegmentId: IdSchema.nullable(),
  findingId: IdSchema.nullable(),
  note: z.string().min(1).max(1000),
  status: z.enum(["open", "done"]),
  createdAt: IsoDateSchema,
});
export type ReshootTask = z.infer<typeof ReshootTaskSchema>;

export const ProcessingJobSchema = z.object({
  id: IdSchema,
  projectId: IdSchema,
  kind: z.enum(["analysis", "reanalysis"]),
  status: z.enum(["queued", "running", "succeeded", "failed"]),
  attempts: z.number().int().nonnegative(),
  maxAttempts: z.number().int().positive(),
  lockedBy: z.string().nullable(),
  heartbeatAt: IsoDateSchema.nullable(),
  error: z.string().nullable(),
  payload: z.object({
    assetVersionId: IdSchema,
    scriptVersionId: IdSchema,
    /** Present on reanalysis: only these segments are re-analysed. */
    segmentIds: z.array(IdSchema).optional(),
  }),
  createdAt: IsoDateSchema,
  updatedAt: IsoDateSchema,
});
export type ProcessingJob = z.infer<typeof ProcessingJobSchema>;

export const AuditEventSchema = z.object({
  id: IdSchema,
  projectId: IdSchema,
  actorId: z.string().min(1).nullable(),
  type: z.string().min(1),
  data: z.record(z.string(), z.unknown()),
  createdAt: IsoDateSchema,
});
export type AuditEvent = z.infer<typeof AuditEventSchema>;

export const ErrorResponseSchema = z.object({
  error: z.object({
    code: z.string().min(1),
    message: z.string().min(1),
    details: z.unknown().optional(),
  }),
});
export type ErrorResponse = z.infer<typeof ErrorResponseSchema>;
