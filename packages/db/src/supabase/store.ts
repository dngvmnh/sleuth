import { randomUUID } from "node:crypto";
import type {
  AssetVersion,
  CoverageSummary,
  EvidenceCandidate,
  ProcessingJob,
  ReshootTask,
  ReviewDecision,
  Seal,
} from "@sleuth/contracts";
import {
  applyReviewDecision,
  buildPoltergeistFindings,
  canSeal,
  checkLimits,
  computeCoverage,
  diffScriptVersions,
  invalidateForNewAssetVersion,
  invalidateForScriptChange,
  nextUtcDayMs,
  planReanalysis,
  sealBlockers,
  segmentScript,
  startOfUtcDayMs,
} from "@sleuth/domain";
import { and, asc, desc, eq, gte, inArray, or, sql } from "drizzle-orm";
import type { PgDatabase } from "drizzle-orm/pg-core";
import type { PostgresJsQueryResultHKT } from "drizzle-orm/postgres-js";
import { cloneWithPrefix } from "../clone";
import type { Db } from "../client";
import { loadGoldenFixture } from "../fixture/load";
import type * as schema from "../schema";
import * as t from "../schema";
import { fixtureToRows } from "../seed-rows";
import {
  StoreError,
  type Actor,
  type AnalysisWriter,
  type ProjectDetail,
  type ProjectStore,
  type PurgeResult,
  type ReportData,
  type RetentionStore,
  retentionCutoff,
} from "../store";
import {
  assetOf,
  auditOf,
  checklistOf,
  decisionOf,
  evidenceOf,
  jobOf,
  projectOf,
  reshootOf,
  scriptOf,
  sealOf,
} from "./mappers";
import { evidenceOfProject, findingsOfProject, mergeAnalysisResult, upsertFindings } from "./rows";
import { UPLOAD_WINDOW_MS, type StorageClient } from "./storage";

/** A database or an open transaction: both run the same queries. */
export type Q = PgDatabase<PostgresJsQueryResultHKT, typeof schema>;

export interface SupabaseStoreOptions {
  db: Db;
  /** Signs upload URLs. Without it the store hands back a placeholder URL (nothing is uploaded). */
  storage?: StorageClient;
  now?: () => Date;
  /** Analysis requests one user may make per UTC day. Default 5 (DAILY_ANALYSIS_LIMIT_PER_USER). */
  dailyAnalysisLimit?: number;
  /** Longest video in ms. Default 180000. */
  maxVideoMs?: number;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EXTENSIONS: Record<string, string> = {
  "video/mp4": "mp4",
  "video/quicktime": "mov",
  "video/webm": "webm",
  "video/x-matroska": "mkv",
};

let idCounter = 0;
/**
 * Ids sort in creation order (time, then a counter) so lists of events read in the order they
 * happened. The random tail keeps them unique across servers.
 */
function newId(prefix: string): string {
  idCounter = (idCounter + 1) % 1_679_616;
  const time = Date.now().toString(36).padStart(9, "0");
  const seq = idCounter.toString(36).padStart(4, "0");
  return `${prefix}-${time}${seq}-${randomUUID().slice(0, 8)}`;
}

/** Storage file extension from the MIME type. The original file name is never stored. */
function extensionFor(mimeType: string): string {
  return EXTENSIONS[mimeType] ?? "bin";
}

/**
 * Postgres Drizzle implementation of `ProjectStore`. The server connects as a role that bypasses
 * row-level security, so this class enforces the access rules itself (the policies in the schema
 * are the second wall, proven in `rls.test.ts`). A project the caller cannot read is "not found",
 * never "forbidden", so existence does not leak.
 */
/** The API store plus the retention job, which only the worker calls. */
export type SupabaseStore = ProjectStore & RetentionStore & AnalysisWriter;

export function createSupabaseStore(options: SupabaseStoreOptions): SupabaseStore {
  const { db, storage } = options;
  const now = options.now ?? (() => new Date());
  const iso = () => now().toISOString();
  const limitConfig = {
    maxVideoMs: options.maxVideoMs ?? 180_000,
    dailyAnalysisLimit: options.dailyAnalysisLimit ?? 5,
  };

  /** The caller's user id if it is a real auth id (a UUID). Anything else cannot own a project. */
  const uid = (actor: Actor): string | null =>
    actor.userId !== null && UUID.test(actor.userId) ? actor.userId.toLowerCase() : null;

  async function readableProject(q: Q, actor: Actor, projectId: string, lock = false) {
    const base = q.select().from(t.projects).where(eq(t.projects.id, projectId)).limit(1);
    const [row] = await (lock ? base.for("update") : base);
    const me = uid(actor);
    if (!row || !(row.isDemo || (me !== null && row.ownerId === me))) {
      throw new StoreError("not_found", 404, "Project not found.");
    }
    return row;
  }

  /** The project, locked for this transaction, if the caller may change it. */
  async function writableProject(q: Q, actor: Actor, projectId: string) {
    const row = await readableProject(q, actor, projectId, true);
    if (row.isDemo) {
      throw new StoreError(
        "demo_read_only",
        403,
        "The demo project is read-only. Create your own project.",
      );
    }
    if (uid(actor) === null || row.ownerId !== uid(actor)) {
      throw new StoreError("forbidden", 403, "You do not own this project.");
    }
    return row;
  }

  async function detailOf(q: Q, row: typeof t.projects.$inferSelect): Promise<ProjectDetail> {
    const [asset] = row.currentAssetVersionId
      ? await q
          .select()
          .from(t.assetVersions)
          .where(eq(t.assetVersions.id, row.currentAssetVersionId))
      : [];
    const [script] = row.currentScriptVersionId
      ? await q
          .select()
          .from(t.scriptVersions)
          .where(eq(t.scriptVersions.id, row.currentScriptVersionId))
      : [];
    const segments = script
      ? await q
          .select()
          .from(t.scriptSegments)
          .where(eq(t.scriptSegments.scriptVersionId, script.id))
          .orderBy(asc(t.scriptSegments.index))
      : [];
    const checklist = await q
      .select()
      .from(t.checklistItems)
      .where(eq(t.checklistItems.projectId, row.id))
      .orderBy(asc(t.checklistItems.position));
    return {
      project: projectOf(row),
      assetVersion: asset ? assetOf(asset) : null,
      scriptVersion: script ? scriptOf(script, segments) : null,
      checklist: checklist.map(checklistOf),
    };
  }

  const reshootsOfProject = async (q: Q, projectId: string): Promise<ReshootTask[]> =>
    (
      await q
        .select()
        .from(t.reshootTasks)
        .where(eq(t.reshootTasks.projectId, projectId))
        .orderBy(asc(t.reshootTasks.createdAt), asc(t.reshootTasks.id))
    ).map(reshootOf);

  const decisionsOfProject = async (q: Q, projectId: string): Promise<ReviewDecision[]> =>
    (
      await q
        .select()
        .from(t.reviewDecisions)
        .where(eq(t.reviewDecisions.projectId, projectId))
        .orderBy(asc(t.reviewDecisions.createdAt), asc(t.reviewDecisions.id))
    ).map(decisionOf);

  const jobsOfProject = async (q: Q, projectId: string): Promise<ProcessingJob[]> =>
    (
      await q
        .select()
        .from(t.processingJobs)
        .where(eq(t.processingJobs.projectId, projectId))
        .orderBy(asc(t.processingJobs.createdAt), asc(t.processingJobs.id))
    ).map(jobOf);

  /** The newest seal, active or broken. */
  async function latestSeal(q: Q, projectId: string): Promise<Seal | null> {
    const [row] = await q
      .select()
      .from(t.seals)
      .where(eq(t.seals.projectId, projectId))
      .orderBy(desc(t.seals.sealedAt), sql`(${t.seals.status} = 'active') desc`)
      .limit(1);
    return row ? sealOf(row) : null;
  }

  /**
   * Append an audit event. `data` may hold ids and counts only: never script text, file names,
   * checklist labels, transcripts or notes (ingestion requirement 6.1).
   */
  async function record(
    q: Q,
    projectId: string,
    actor: Actor,
    type: string,
    data: Record<string, string | number | boolean | null>,
  ) {
    await q.insert(t.auditEvents).values({
      id: newId("ae"),
      projectId,
      actorId: actor.userId,
      type,
      data,
      createdAt: iso(),
    });
    await touch(q, projectId);
  }

  /** Every change to a project or anything in it moves its "last change" time. */
  async function touch(q: Q, projectId: string) {
    await q.update(t.projects).set({ updatedAt: iso() }).where(eq(t.projects.id, projectId));
  }

  /** Mark evidence stale and open its Poltergeist findings. Returns the ids that just went stale. */
  async function applyStaleness(
    q: Q,
    projectId: string,
    before: EvidenceCandidate[],
    after: EvidenceCandidate[],
    reason: "script_changed" | "video_replaced",
  ): Promise<string[]> {
    const newlyStale = after.filter(
      (e, i) => e.status === "stale" && before[i]?.status !== "stale",
    );
    if (newlyStale.length === 0) return [];
    await q
      .update(t.evidenceCandidates)
      .set({ status: "stale" })
      .where(
        and(
          eq(t.evidenceCandidates.projectId, projectId),
          inArray(
            t.evidenceCandidates.id,
            newlyStale.map((e) => e.id),
          ),
        ),
      );
    // A finding with the same id replaces the old one: evidence that goes stale twice reopens.
    await upsertFindings(q, buildPoltergeistFindings(newlyStale, newId("run"), reason));
    return newlyStale.map((e) => e.id);
  }

  /** Break the active seal, if any. Used by the revision and upload paths. */
  async function breakActiveSeal(q: Q, projectId: string, reason: string): Promise<Seal | null> {
    const [row] = await q
      .update(t.seals)
      .set({ status: "broken", brokenAt: iso(), brokenReason: reason })
      .where(and(eq(t.seals.projectId, projectId), eq(t.seals.status, "active")))
      .returning();
    if (!row) return null;
    await record(q, projectId, { userId: null }, "seal_broken", { sealId: row.id });
    return sealOf(row);
  }

  async function coverageOf(q: Q, project: typeof t.projects.$inferSelect, detail: ProjectDetail) {
    const [evidence, decisions, reshoots] = await Promise.all([
      evidenceOfProject(q, project.id),
      decisionsOfProject(q, project.id),
      reshootsOfProject(q, project.id),
    ]);
    const coverage: CoverageSummary = computeCoverage(
      detail.checklist,
      detail.scriptVersion,
      evidence,
      decisions,
      reshoots,
    );
    return { coverage, evidence, decisions, reshoots };
  }

  async function sealInput(
    q: Q,
    projectId: string,
    coverage: CoverageSummary,
    evidence: EvidenceCandidate[],
  ) {
    const jobs = await jobsOfProject(q, projectId);
    return {
      coverage,
      evidence,
      jobs,
      hasAnalysis: evidence.length > 0 || jobs.some((j) => j.status === "succeeded"),
    };
  }

  /**
   * Ingestion 2.1: the video must have landed within five minutes of its upload URL being made.
   * Without storage configured nothing is uploaded, so there is nothing to check.
   */
  async function checkUploadWindow(asset: AssetVersion) {
    if (!storage) return;
    const landed = await storage.uploadedAt(asset.storagePath);
    if (landed === null) {
      throw new StoreError("upload_missing", 409, "The video has not been uploaded yet.");
    }
    const late = Date.parse(landed) - (Date.parse(asset.createdAt) + UPLOAD_WINDOW_MS);
    if (late > 0) {
      throw new StoreError(
        "upload_late",
        409,
        "The video arrived after its five-minute upload link ran out. Upload it again.",
        { uploadWindowMs: UPLOAD_WINDOW_MS },
      );
    }
  }

  /** Accepted analysis requests by this user today (UTC), across all their projects. */
  async function analysesToday(q: Q, userId: string): Promise<number> {
    const start = new Date(startOfUtcDayMs(now().getTime())).toISOString();
    const [row] = await q
      .select({ n: sql<number>`count(*)::int` })
      .from(t.auditEvents)
      .where(
        and(
          eq(t.auditEvents.type, "analysis_requested"),
          eq(t.auditEvents.actorId, userId),
          gte(t.auditEvents.createdAt, start),
        ),
      );
    return row?.n ?? 0;
  }

  return {
    async listProjects(actor) {
      const me = uid(actor);
      const rows = await db
        .select()
        .from(t.projects)
        .where(
          me === null
            ? eq(t.projects.isDemo, true)
            : or(eq(t.projects.isDemo, true), eq(t.projects.ownerId, me)),
        )
        .orderBy(
          desc(t.projects.isDemo),
          desc(t.projects.updatedAt),
          desc(t.projects.createdAt),
          desc(t.projects.id),
        );
      // The demo first, then the most recently changed (review-workspace 1.2).
      return rows.map(projectOf);
    },

    async getProjectDetail(actor, projectId) {
      return detailOf(db, await readableProject(db, actor, projectId));
    },

    async createProject(actor, input) {
      const me = uid(actor);
      if (me === null) throw new StoreError("unauthorized", 401, "Sign in to create a project.");
      return db.transaction(async (tx) => {
        const id = newId("prj");
        const stamp = iso();
        if (input.copyFromDemo) {
          const rows = fixtureToRows(cloneWithPrefix(loadGoldenFixture(), id));
          const base = rows.projects[0] as (typeof rows.projects)[number];
          await tx.insert(t.projects).values({
            ...base,
            id,
            name: input.name,
            ownerId: me,
            isDemo: false,
            createdAt: stamp,
            updatedAt: stamp,
          });
          await tx.insert(t.assetVersions).values(rows.assetVersions);
          await tx.insert(t.scriptVersions).values(rows.scriptVersions);
          await tx.insert(t.scriptSegments).values(rows.scriptSegments);
          if (rows.checklistItems.length)
            await tx.insert(t.checklistItems).values(rows.checklistItems);
          if (rows.transcriptSegments.length)
            await tx.insert(t.transcriptSegments).values(rows.transcriptSegments);
          if (rows.frameObservations.length)
            await tx.insert(t.frameObservations).values(rows.frameObservations);
          if (rows.evidenceCandidates.length)
            await tx.insert(t.evidenceCandidates).values(rows.evidenceCandidates);
          if (rows.findings.length) await tx.insert(t.findings).values(rows.findings);
        } else {
          await tx.insert(t.projects).values({
            id,
            name: input.name,
            ownerId: me,
            isDemo: false,
            createdAt: stamp,
            updatedAt: stamp,
          });
        }
        await record(tx, id, actor, "project_created", {
          copiedFromDemo: input.copyFromDemo === true,
        });
        const [row] = await tx.select().from(t.projects).where(eq(t.projects.id, id));
        return projectOf(row as typeof t.projects.$inferSelect);
      });
    },

    async createUploadUrl(actor, projectId, input) {
      return db.transaction(async (tx) => {
        await writableProject(tx, actor, projectId);
        const limit = checkLimits({ durationMs: input.durationMs, config: limitConfig });
        if (!limit.ok) {
          throw new StoreError("invalid_request", 400, "The video length is not allowed.", {
            reason: limit.code,
            maxVideoMs: limitConfig.maxVideoMs,
          });
        }
        const [max] = await tx
          .select({ v: sql<number>`coalesce(max(${t.assetVersions.version}), 0)::int` })
          .from(t.assetVersions)
          .where(eq(t.assetVersions.projectId, projectId));
        const version = (max?.v ?? 0) + 1;
        // The path holds ids and a random name only. The uploaded file's own name never reaches
        // storage, logs or the database.
        const storagePath = `${projectId}/${version}/${randomUUID()}.${extensionFor(input.mimeType)}`;
        const signed = storage
          ? await storage.createSignedUploadUrl(storagePath)
          : {
              url: `fixture://no-upload/${storagePath}`,
              expiresAt: new Date(now().getTime() + 5 * 60_000).toISOString(),
            };
        const [inserted] = await tx
          .insert(t.assetVersions)
          .values({
            id: newId("av"),
            projectId,
            version,
            storagePath,
            mimeType: input.mimeType,
            durationMs: input.durationMs,
            createdAt: iso(),
          })
          .returning();
        const assetVersion: AssetVersion = assetOf(inserted as typeof t.assetVersions.$inferSelect);
        await tx
          .update(t.projects)
          .set({ currentAssetVersionId: assetVersion.id })
          .where(eq(t.projects.id, projectId));
        // Evidence on older video versions goes stale (see domain.invalidateForNewAssetVersion).
        const before = await evidenceOfProject(tx, projectId);
        const staleIds = await applyStaleness(
          tx,
          projectId,
          before,
          invalidateForNewAssetVersion(before, assetVersion.id),
          "video_replaced",
        );
        await record(tx, projectId, actor, "asset_version_created", {
          assetVersionId: assetVersion.id,
          version,
          durationMs: assetVersion.durationMs,
        });
        if (version > 1) {
          await record(tx, projectId, actor, "asset_replaced", { staleEvidence: staleIds.length });
          // A new video always needs a new analysis, so any sign-off on the old one no longer holds.
          await breakActiveSeal(
            tx,
            projectId,
            "Evidence changed after sign-off: a new video was uploaded.",
          );
        }
        // The storage URL itself may live longer; the upload window is what counts (2.1).
        const windowEnds = Date.parse(assetVersion.createdAt) + UPLOAD_WINDOW_MS;
        const expiresAt = new Date(
          Math.min(windowEnds, Date.parse(signed.expiresAt)),
        ).toISOString();
        return { assetVersion, uploadUrl: signed.url, expiresAt };
      });
    },

    async createScript(actor, projectId, text) {
      return db.transaction(async (tx) => {
        const project = await writableProject(tx, actor, projectId);
        const previous = (await detailOf(tx, project)).scriptVersion;
        // Every id this project has ever used stays reserved, even if its sentence was removed.
        const used = await tx
          .selectDistinct({ id: t.scriptSegments.id })
          .from(t.scriptSegments)
          .where(eq(t.scriptSegments.projectId, projectId));
        const [max] = await tx
          .select({ v: sql<number>`coalesce(max(${t.scriptVersions.version}), 0)::int` })
          .from(t.scriptVersions)
          .where(eq(t.scriptVersions.projectId, projectId));
        const version = (max?.v ?? 0) + 1;
        const id = newId("sv");
        const segments = segmentScript(text, {
          scriptVersionId: id,
          previous: previous?.segments ?? [],
          retiredIds: used.map((r) => r.id),
        });
        const createdAt = iso();
        await tx.insert(t.scriptVersions).values({ id, projectId, version, text, createdAt });
        if (segments.length > 0) {
          await tx.insert(t.scriptSegments).values(segments.map((s) => ({ ...s, projectId })));
        }
        await tx
          .update(t.projects)
          .set({ currentScriptVersionId: id })
          .where(eq(t.projects.id, projectId));

        const diff = diffScriptVersions(previous?.segments ?? [], segments);
        const before = await evidenceOfProject(tx, projectId);
        const after = invalidateForScriptChange(before, segments);
        const staleEvidenceIds = await applyStaleness(
          tx,
          projectId,
          before,
          after,
          "script_changed",
        );
        await record(tx, projectId, actor, "script_version_created", {
          scriptVersionId: id,
          version,
          segments: segments.length,
        });
        if (previous) {
          await record(tx, projectId, actor, "script_revised", {
            modified: diff.modified.length,
            added: diff.added.length,
            removed: diff.removed.length,
            staleEvidence: staleEvidenceIds.length,
          });
        }
        if (staleEvidenceIds.length > 0) {
          await breakActiveSeal(
            tx,
            projectId,
            "Evidence changed after sign-off: the script was edited.",
          );
        }
        return {
          scriptVersion: { id, projectId, version, text, segments, createdAt },
          diff,
          staleEvidenceIds,
          reanalysisPlan: planReanalysis(diff, after),
        };
      });
    },

    async setChecklist(actor, projectId, labels) {
      return db.transaction(async (tx) => {
        await writableProject(tx, actor, projectId);
        await tx.delete(t.checklistItems).where(eq(t.checklistItems.projectId, projectId));
        const rows = labels.map((label, position) => ({
          id: newId("ck"),
          projectId,
          label,
          position,
        }));
        if (rows.length > 0) await tx.insert(t.checklistItems).values(rows);
        await record(tx, projectId, actor, "checklist_replaced", { items: rows.length });
        return rows.map(checklistOf);
      });
    },

    async startAnalysis(actor, projectId, input) {
      return db.transaction(async (tx) => {
        const project = await writableProject(tx, actor, projectId);
        const { assetVersion: asset, scriptVersion: script } = await detailOf(tx, project);
        if (!asset || !script) {
          throw new StoreError("missing_inputs", 409, "Add a video and a script before analysis.");
        }
        if (input.segmentIds !== undefined) {
          const known = new Set(script.segments.map((s) => s.id));
          const unknownSegmentIds = [...new Set(input.segmentIds)].filter((s) => !known.has(s));
          if (input.segmentIds.length === 0 || unknownSegmentIds.length > 0) {
            throw new StoreError(
              "invalid_request",
              400,
              "segmentIds must name at least one line of the current script.",
              { unknownSegmentIds },
            );
          }
        }
        await checkUploadWindow(asset);
        // "Same request" = same video version, script version and set of segments (4.3).
        const segmentsKey =
          input.segmentIds === undefined ? "full" : [...new Set(input.segmentIds)].sort().join(",");
        const requestKey = `${asset.id}|${script.id}|${segmentsKey}`;

        const activeJob = async () => {
          const [row] = await tx
            .select()
            .from(t.processingJobs)
            .where(
              and(
                eq(t.processingJobs.projectId, projectId),
                eq(t.processingJobs.requestKey, requestKey),
                inArray(t.processingJobs.status, ["queued", "running"]),
              ),
            )
            .limit(1);
          return row ? jobOf(row) : null;
        };
        // Same request while a job for it is queued or running: hand back that job, no new quota.
        const existing = await activeJob();
        if (existing) return existing;

        // One request at a time per user, so two tabs cannot both slip under the daily limit.
        const userId = uid(actor) as string; // writableProject guarantees a signed-in owner
        await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${userId}))`);
        const limit = checkLimits({
          analysesToday: await analysesToday(tx, userId),
          config: limitConfig,
        });
        if (!limit.ok) {
          throw new StoreError(
            "limit_exceeded",
            429,
            "Daily analysis limit reached. Try again after the reset time.",
            {
              limit: limitConfig.dailyAnalysisLimit,
              resetsAt: new Date(nextUtcDayMs(now().getTime())).toISOString(),
            },
          );
        }
        const stamp = iso();
        const [created] = await tx
          .insert(t.processingJobs)
          .values({
            id: newId("job"),
            projectId,
            kind: input.segmentIds ? "reanalysis" : "analysis",
            status: "queued",
            requestKey,
            payload: {
              assetVersionId: asset.id,
              scriptVersionId: script.id,
              ...(input.segmentIds ? { segmentIds: input.segmentIds } : {}),
            },
            createdAt: stamp,
            updatedAt: stamp,
          })
          .onConflictDoNothing()
          .returning();
        if (!created) {
          // The partial unique index refused a second active job for this request.
          const winner = await activeJob();
          if (winner) return winner;
          throw new StoreError("conflict", 409, "Could not queue the analysis. Try again.");
        }
        const job = jobOf(created);
        await record(tx, projectId, actor, "analysis_requested", {
          jobId: job.id,
          kind: job.kind,
          segments: input.segmentIds ? new Set(input.segmentIds).size : null,
        });
        return job;
      });
    },

    async getJob(actor, projectId, jobId) {
      await readableProject(db, actor, projectId);
      const [row] = await db
        .select()
        .from(t.processingJobs)
        .where(and(eq(t.processingJobs.id, jobId), eq(t.processingJobs.projectId, projectId)));
      if (!row) throw new StoreError("not_found", 404, "Job not found.");
      return jobOf(row);
    },

    async listEvidence(actor, projectId) {
      await readableProject(db, actor, projectId);
      return evidenceOfProject(db, projectId);
    },

    async listFindings(actor, projectId) {
      await readableProject(db, actor, projectId);
      return findingsOfProject(db, projectId);
    },

    async listAuditEvents(actor, projectId) {
      const project = await readableProject(db, actor, projectId);
      const me = uid(actor);
      // Audit trails are for the owner only. The demo has none to show.
      if (project.isDemo || me === null || project.ownerId !== me) {
        throw new StoreError("forbidden", 403, "Only the project owner can read the audit trail.");
      }
      const rows = await db
        .select()
        .from(t.auditEvents)
        .where(eq(t.auditEvents.projectId, projectId))
        .orderBy(asc(t.auditEvents.createdAt), asc(t.auditEvents.id));
      return rows.map(auditOf);
    },

    async reviewEvidence(actor, evidenceId, input) {
      const [found] = await db
        .select({ projectId: t.evidenceCandidates.projectId })
        .from(t.evidenceCandidates)
        .where(eq(t.evidenceCandidates.id, evidenceId));
      const notFound = new StoreError("not_found", 404, "Evidence not found.");
      if (!found) throw notFound;
      return db.transaction(async (tx) => {
        try {
          await readableProject(tx, actor, found.projectId);
        } catch (e) {
          if (e instanceof StoreError && e.status === 404) throw notFound;
          throw e;
        }
        const project = await writableProject(tx, actor, found.projectId);
        const [row] = await tx
          .select()
          .from(t.evidenceCandidates)
          .where(eq(t.evidenceCandidates.id, evidenceId))
          .for("update");
        if (!row) throw notFound;
        const current = evidenceOf(row);
        const { scriptVersion, assetVersion } = await detailOf(tx, project);
        const decision: ReviewDecision = {
          id: newId("rd"),
          evidenceId,
          decision: input.decision,
          reviewerId: actor.userId ?? "",
          note: input.note ?? null,
          createdAt: iso(),
        };
        // Tell the rules what is current, so evidence dismissed while stale can never be
        // confirmed later on an outdated line or video.
        const result = applyReviewDecision(current, decision, {
          segmentHash: scriptVersion?.segments.find((s) => s.id === current.scriptSegmentId)?.hash,
          assetVersionId: assetVersion?.id,
        });
        if (!result.ok) {
          throw new StoreError("review_refused", 409, `Decision refused: ${result.reason}.`, {
            reason: result.reason,
          });
        }
        await tx
          .update(t.evidenceCandidates)
          .set({ status: result.evidence.status })
          .where(eq(t.evidenceCandidates.id, evidenceId));
        await tx.insert(t.reviewDecisions).values({ ...decision, projectId: found.projectId });
        await touch(tx, found.projectId);
        await tx
          .update(t.findings)
          .set({ status: "resolved" })
          .where(eq(t.findings.evidenceId, evidenceId));
        return { evidence: result.evidence, decision };
      });
    },

    async createReshoot(actor, projectId, input) {
      return db.transaction(async (tx) => {
        await writableProject(tx, actor, projectId);
        const [row] = await tx
          .insert(t.reshootTasks)
          .values({
            id: newId("rs"),
            projectId,
            checklistItemId: input.checklistItemId ?? null,
            scriptSegmentId: input.scriptSegmentId ?? null,
            findingId: input.findingId ?? null,
            note: input.note,
            status: "open",
            createdAt: iso(),
          })
          .returning();
        await touch(tx, projectId);
        return reshootOf(row as typeof t.reshootTasks.$inferSelect);
      });
    },

    async listReshoots(actor, projectId) {
      await readableProject(db, actor, projectId);
      return reshootsOfProject(db, projectId);
    },

    async updateReshoot(actor, reshootId, status) {
      const [found] = await db
        .select({ projectId: t.reshootTasks.projectId })
        .from(t.reshootTasks)
        .where(eq(t.reshootTasks.id, reshootId));
      const notFound = new StoreError("not_found", 404, "Reshoot not found.");
      if (!found) throw notFound;
      return db.transaction(async (tx) => {
        try {
          await readableProject(tx, actor, found.projectId);
        } catch (e) {
          if (e instanceof StoreError && e.status === 404) throw notFound;
          throw e;
        }
        await writableProject(tx, actor, found.projectId);
        const [row] = await tx
          .update(t.reshootTasks)
          .set({ status })
          .where(eq(t.reshootTasks.id, reshootId))
          .returning();
        if (!row) throw notFound;
        await touch(tx, found.projectId);
        return reshootOf(row);
      });
    },

    async getCoverage(actor, projectId) {
      const project = await readableProject(db, actor, projectId);
      const detail = await detailOf(db, project);
      const { coverage, evidence } = await coverageOf(db, project, detail);
      return {
        coverage,
        seal: await latestSeal(db, projectId),
        blockers: sealBlockers(await sealInput(db, projectId, coverage, evidence)),
      };
    },

    async sealProject(actor, projectId, note) {
      return db.transaction(async (tx) => {
        const project = await writableProject(tx, actor, projectId);
        const me = uid(actor);
        // A person must sign. A blank id is not a person (3.4).
        if (me === null)
          throw new StoreError("unauthorized", 401, "Sign in to apply the Final Seal.");
        const detail = await detailOf(tx, project);
        const { coverage, evidence } = await coverageOf(tx, project, detail);
        const decision = canSeal(await sealInput(tx, projectId, coverage, evidence));
        if (!decision.ok) {
          throw new StoreError("seal_blocked", 409, "The project cannot be sealed yet.", {
            blockers: decision.blockers,
          });
        }
        const script = detail.scriptVersion;
        const asset = detail.assetVersion;
        if (!script || !asset) {
          throw new StoreError("seal_blocked", 409, "The project cannot be sealed yet.", {
            blockers: ["no_analysis"],
          });
        }
        // Only one seal is active. An older active seal is replaced and kept in the history.
        await tx
          .update(t.seals)
          .set({ status: "broken", brokenAt: iso(), brokenReason: "Replaced by a newer seal." })
          .where(and(eq(t.seals.projectId, projectId), eq(t.seals.status, "active")));
        const [row] = await tx
          .insert(t.seals)
          .values({
            id: newId("seal"),
            projectId,
            sealedBy: me,
            sealedAt: iso(),
            scriptVersionId: script.id,
            assetVersionId: asset.id,
            coverage,
            note: note ?? null,
            status: "active",
          })
          .returning();
        const seal = sealOf(row as typeof t.seals.$inferSelect);
        await record(tx, projectId, actor, "project_sealed", {
          sealId: seal.id,
          proven: coverage.totals.proven,
          openReshoots: coverage.openReshootIds.length,
        });
        return seal;
      });
    },

    async applyAnalysisResult(actor, projectId, jobId, produced) {
      return db.transaction(async (tx) => {
        await writableProject(tx, actor, projectId);
        const [jobRow] = await tx
          .select()
          .from(t.processingJobs)
          .where(and(eq(t.processingJobs.id, jobId), eq(t.processingJobs.projectId, projectId)))
          .for("update");
        if (!jobRow) throw new StoreError("not_found", 404, "Job not found.");
        const job = jobOf(jobRow);
        const replacedEvidenceIds = await mergeAnalysisResult(tx, projectId, job, produced);
        const [done] = await tx
          .update(t.processingJobs)
          .set({
            status: "succeeded",
            attempts: Math.max(job.attempts, 1),
            error: null,
            lockedBy: null,
            updatedAt: iso(),
          })
          .where(eq(t.processingJobs.id, jobId))
          .returning();
        await touch(tx, projectId);
        return { job: jobOf(done as typeof t.processingJobs.$inferSelect), replacedEvidenceIds };
      });
    },

    async purgeExpiredAnonymousProjects(at, days): Promise<PurgeResult> {
      const cutoff = retentionCutoff(at, days).toISOString();
      // Anonymous = a Supabase Auth user made by signInAnonymously(). A project whose owner is
      // not in auth.users at all is not treated as anonymous: we only delete what we can prove.
      const expired = await db
        .select({ id: t.projects.id })
        .from(t.projects)
        .where(
          and(
            eq(t.projects.isDemo, false),
            sql`${t.projects.createdAt} < ${cutoff}`,
            sql`exists (select 1 from auth.users u where u.id = ${t.projects.ownerId} and u.is_anonymous)`,
          ),
        );
      const projectIds = expired.map((r) => r.id);
      if (projectIds.length === 0) return { projectIds, files: 0 };
      // Files first. If storage fails, the rows stay and the next run tries again; rows are
      // never deleted while their files might remain.
      const assets = await db
        .select({ path: t.assetVersions.storagePath })
        .from(t.assetVersions)
        .where(inArray(t.assetVersions.projectId, projectIds));
      const paths = assets.map((a) => a.path);
      if (paths.length > 0) {
        if (!storage) {
          throw new StoreError(
            "not_configured",
            501,
            "Storage is not configured, so stored files cannot be removed.",
          );
        }
        for (let i = 0; i < paths.length; i += 100) await storage.remove(paths.slice(i, i + 100));
      }
      await db.delete(t.projects).where(inArray(t.projects.id, projectIds));
      return { projectIds, files: paths.length };
    },

    async getReportData(actor, projectId): Promise<ReportData> {
      const project = await readableProject(db, actor, projectId);
      const detail = await detailOf(db, project);
      const { coverage, evidence, decisions, reshoots } = await coverageOf(db, project, detail);
      return {
        ...detail,
        evidence,
        findings: await findingsOfProject(db, projectId),
        reshoots,
        decisions,
        seal: await latestSeal(db, projectId),
        coverage,
      };
    },
  };
}
