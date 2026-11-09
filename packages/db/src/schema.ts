import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  jsonb,
  pgPolicy,
  pgTable,
  primaryKey,
  text,
  timestamp,
  boolean,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { anonRole, authenticatedRole, authUid } from "drizzle-orm/supabase";
import type {
  Confidence,
  CoverageSummary,
  EvidenceStatus,
  FindingType,
  ReviewDecisionKind,
  TranscriptWord,
} from "@sleuth/contracts";

/**
 * Mirrors packages/contracts. Ids are text so the golden fixture can use readable ids.
 * Timestamps are integer milliseconds from video start. RLS is on for every table:
 * a user sees only their own projects, and the demo project is readable by everyone.
 * The service role (server and worker only) bypasses RLS.
 */

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: "string" });
const createdAt = () => ts("created_at").notNull().defaultNow();

/** The caller may read rows of the project referenced by `project_id`. */
const projectReadable = sql`exists (select 1 from projects p where p.id = project_id and (p.is_demo or p.owner_id = ${authUid}))`;
/** The caller owns the project referenced by `project_id` and it is not the demo. */
const projectWritable = sql`exists (select 1 from projects p where p.id = project_id and not p.is_demo and p.owner_id = ${authUid})`;

/** Standard policy set for a table with a `project_id` column. */
function projectPolicies(table: string) {
  return [
    pgPolicy(`${table}_read`, {
      for: "select",
      to: [anonRole, authenticatedRole],
      using: projectReadable,
    }),
    pgPolicy(`${table}_write`, {
      for: "all",
      to: authenticatedRole,
      using: projectWritable,
      withCheck: projectWritable,
    }),
  ];
}

export const projects = pgTable(
  "projects",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    ownerId: uuid("owner_id"),
    isDemo: boolean("is_demo").notNull().default(false),
    currentScriptVersionId: text("current_script_version_id"),
    currentAssetVersionId: text("current_asset_version_id"),
    createdAt: createdAt(),
    /** Last change to the project or anything in it. Set by the store on every write. */
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("projects_owner_idx").on(t.ownerId),
    pgPolicy("projects_read", {
      for: "select",
      to: [anonRole, authenticatedRole],
      using: sql`${t.isDemo} or ${t.ownerId} = ${authUid}`,
    }),
    pgPolicy("projects_insert", {
      for: "insert",
      to: authenticatedRole,
      withCheck: sql`${t.ownerId} = ${authUid} and not ${t.isDemo}`,
    }),
    pgPolicy("projects_modify", {
      for: "update",
      to: authenticatedRole,
      using: sql`${t.ownerId} = ${authUid} and not ${t.isDemo}`,
      withCheck: sql`${t.ownerId} = ${authUid} and not ${t.isDemo}`,
    }),
    pgPolicy("projects_delete", {
      for: "delete",
      to: authenticatedRole,
      using: sql`${t.ownerId} = ${authUid} and not ${t.isDemo}`,
    }),
  ],
).enableRLS();

export const assetVersions = pgTable(
  "asset_versions",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    storagePath: text("storage_path").notNull(),
    mimeType: text("mime_type").notNull(),
    durationMs: integer("duration_ms").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    unique("asset_versions_project_version").on(t.projectId, t.version),
    check("asset_duration_range", sql`${t.durationMs} >= 0 and ${t.durationMs} <= 180000`),
    ...projectPolicies("asset_versions"),
  ],
).enableRLS();

export const scriptVersions = pgTable(
  "script_versions",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    text: text("text").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    unique("script_versions_project_version").on(t.projectId, t.version),
    ...projectPolicies("script_versions"),
  ],
).enableRLS();

export const scriptSegments = pgTable(
  "script_segments",
  {
    /** Stable across versions, so the key is (script_version_id, id). */
    id: text("id").notNull(),
    scriptVersionId: text("script_version_id")
      .notNull()
      .references(() => scriptVersions.id, { onDelete: "cascade" }),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    index: integer("index").notNull(),
    text: text("text").notNull(),
    hash: text("hash").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.scriptVersionId, t.id] }),
    ...projectPolicies("script_segments"),
  ],
).enableRLS();

export const checklistItems = pgTable(
  "checklist_items",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    position: integer("position").notNull(),
  },
  () => [...projectPolicies("checklist_items")],
).enableRLS();

export const transcriptSegments = pgTable(
  "transcript_segments",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    assetVersionId: text("asset_version_id")
      .notNull()
      .references(() => assetVersions.id, { onDelete: "cascade" }),
    startMs: integer("start_ms").notNull(),
    endMs: integer("end_ms").notNull(),
    text: text("text").notNull(),
    words: jsonb("words").$type<TranscriptWord[]>().notNull(),
  },
  (t) => [
    check("transcript_interval", sql`${t.startMs} >= 0 and ${t.startMs} <= ${t.endMs}`),
    ...projectPolicies("transcript_segments"),
  ],
).enableRLS();

export const frameObservations = pgTable(
  "frame_observations",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    assetVersionId: text("asset_version_id")
      .notNull()
      .references(() => assetVersions.id, { onDelete: "cascade" }),
    timestampMs: integer("timestamp_ms").notNull(),
    description: text("description").notNull(),
    onScreenText: jsonb("on_screen_text").$type<string[]>().notNull(),
  },
  (t) => [
    check("frame_timestamp", sql`${t.timestampMs} >= 0`),
    ...projectPolicies("frame_observations"),
  ],
).enableRLS();

export const evidenceCandidates = pgTable(
  "evidence_candidates",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    checklistItemId: text("checklist_item_id"),
    scriptSegmentId: text("script_segment_id").notNull(),
    scriptVersionId: text("script_version_id").notNull(),
    segmentHash: text("segment_hash").notNull(),
    assetVersionId: text("asset_version_id").notNull(),
    startMs: integer("start_ms").notNull(),
    endMs: integer("end_ms").notNull(),
    transcriptSegmentIds: text("transcript_segment_ids").array().notNull(),
    frameObservationIds: text("frame_observation_ids").array().notNull(),
    explanation: text("explanation").notNull(),
    confidence: text("confidence").$type<Confidence>().notNull(),
    status: text("status").$type<EvidenceStatus>().notNull(),
    source: text("source").$type<"ai" | "human">().notNull(),
    analysisRunId: text("analysis_run_id").notNull(),
  },
  (t) => [
    // Running the same analysis twice must not create a second candidate.
    unique("evidence_one_per_segment_and_video").on(
      t.projectId,
      t.scriptSegmentId,
      t.assetVersionId,
    ),
    check("evidence_interval", sql`${t.startMs} >= 0 and ${t.startMs} <= ${t.endMs}`),
    check("evidence_confidence", sql`${t.confidence} in ('low','medium','high')`),
    check(
      "evidence_status",
      sql`${t.status} in ('candidate','confirmed','rejected','stale','needs_reshoot','needs_outside_proof')`,
    ),
    check("evidence_source", sql`${t.source} in ('ai','human')`),
    index("evidence_project_idx").on(t.projectId),
    ...projectPolicies("evidence_candidates"),
  ],
).enableRLS();

export const findings = pgTable(
  "findings",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    type: text("type").$type<FindingType>().notNull(),
    plainLabel: text("plain_label").notNull(),
    checklistItemId: text("checklist_item_id"),
    scriptSegmentId: text("script_segment_id"),
    evidenceId: text("evidence_id"),
    found: text("found").notNull(),
    notFound: text("not_found").notNull(),
    limits: text("limits").notNull(),
    status: text("status").$type<"open" | "resolved">().notNull(),
    analysisRunId: text("analysis_run_id").notNull(),
  },
  (t) => [
    check(
      "finding_type",
      sql`${t.type} in ('ghost','phantom_dialogue','cursed_frame','poltergeist','needs_outside_proof')`,
    ),
    index("findings_project_idx").on(t.projectId),
    ...projectPolicies("findings"),
  ],
).enableRLS();

export const reviewDecisions = pgTable(
  "review_decisions",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    evidenceId: text("evidence_id")
      .notNull()
      .references(() => evidenceCandidates.id, { onDelete: "cascade" }),
    decision: text("decision").$type<ReviewDecisionKind>().notNull(),
    /** A person. Never blank, never an AI. */
    reviewerId: text("reviewer_id").notNull(),
    note: text("note"),
    createdAt: createdAt(),
  },
  (t) => [
    check("review_reviewer_present", sql`length(trim(${t.reviewerId})) > 0`),
    ...projectPolicies("review_decisions"),
  ],
).enableRLS();

export const reshootTasks = pgTable(
  "reshoot_tasks",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    checklistItemId: text("checklist_item_id"),
    scriptSegmentId: text("script_segment_id"),
    findingId: text("finding_id"),
    note: text("note").notNull(),
    status: text("status").$type<"open" | "done">().notNull(),
    createdAt: createdAt(),
  },
  () => [...projectPolicies("reshoot_tasks")],
).enableRLS();

export const processingJobs = pgTable(
  "processing_jobs",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    kind: text("kind").$type<"analysis" | "reanalysis">().notNull(),
    status: text("status").$type<"queued" | "running" | "succeeded" | "failed">().notNull(),
    attempts: integer("attempts").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(3),
    lockedBy: text("locked_by"),
    heartbeatAt: ts("heartbeat_at"),
    error: text("error"),
    /**
     * Which request this job answers: `<asset>|<script>|<sorted segment ids, or "full">`. Null on
     * rows made before the column existed. Two active jobs may not share a key (ingestion 4.3).
     */
    requestKey: text("request_key"),
    payload: jsonb("payload")
      .$type<{ assetVersionId: string; scriptVersionId: string; segmentIds?: string[] }>()
      .notNull(),
    createdAt: createdAt(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [
    check("job_status", sql`${t.status} in ('queued','running','succeeded','failed')`),
    // The worker's claim query scans by status and age.
    index("jobs_claim_idx").on(t.status, t.createdAt),
    // At most one queued or running job per project and request: repeat requests get that job.
    uniqueIndex("jobs_one_active_per_request")
      .on(t.projectId, t.requestKey)
      .where(sql`${t.status} in ('queued', 'running')`),
    ...projectPolicies("processing_jobs"),
  ],
).enableRLS();

export const auditEvents = pgTable(
  "audit_events",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    actorId: text("actor_id"),
    type: text("type").notNull(),
    data: jsonb("data").$type<Record<string, unknown>>().notNull(),
    createdAt: createdAt(),
  },
  () => [...projectPolicies("audit_events")],
).enableRLS();

export const seals = pgTable(
  "seals",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    /** A person. Never blank. */
    sealedBy: text("sealed_by").notNull(),
    sealedAt: ts("sealed_at").notNull(),
    scriptVersionId: text("script_version_id").notNull(),
    assetVersionId: text("asset_version_id").notNull(),
    /** Coverage as it was at sign-off. */
    coverage: jsonb("coverage").$type<CoverageSummary>().notNull(),
    note: text("note"),
    status: text("status").$type<"active" | "broken">().notNull(),
    brokenAt: ts("broken_at"),
    brokenReason: text("broken_reason"),
  },
  (t) => [
    check("seal_status", sql`${t.status} in ('active','broken')`),
    check("seal_signer_present", sql`length(trim(${t.sealedBy})) > 0`),
    // One active seal per project; older seals stay as history.
    uniqueIndex("seals_one_active_per_project")
      .on(t.projectId)
      .where(sql`${t.status} = 'active'`),
    ...projectPolicies("seals"),
  ],
).enableRLS();
