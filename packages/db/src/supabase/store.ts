import type { CoverageSummary } from "@sleuth/contracts";
import { computeCoverage } from "@sleuth/domain";
import { and, asc, eq, or } from "drizzle-orm";
import type { PgDatabase } from "drizzle-orm/pg-core";
import type { PostgresJsQueryResultHKT } from "drizzle-orm/postgres-js";
import type { Db } from "../client";
import type * as schema from "../schema";
import * as t from "../schema";
import {
  StoreError,
  type Actor,
  type ProjectDetail,
  type ProjectStore,
  type ReportData,
} from "../store";
import {
  assetOf,
  auditOf,
  checklistOf,
  decisionOf,
  evidenceOf,
  findingOf,
  jobOf,
  projectOf,
  reshootOf,
  scriptOf,
} from "./mappers";

/** A database or an open transaction: both run the same queries. */
export type Q = PgDatabase<PostgresJsQueryResultHKT, typeof schema>;

export interface SupabaseStoreOptions {
  db: Db;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Postgres Drizzle implementation of `ProjectStore`. The server connects as a role that bypasses
 * row-level security, so this class enforces the access rules itself (the policies in the schema
 * are the second wall, proven in `rls.test.ts`). A project the caller cannot read is "not found",
 * never "forbidden", so existence does not leak.
 */
export function createSupabaseStore(options: SupabaseStoreOptions): ProjectStore {
  const { db } = options;

  /** The caller's user id if it is a real auth id (a UUID). Anything else cannot own a project. */
  const uid = (actor: Actor): string | null =>
    actor.userId !== null && UUID.test(actor.userId) ? actor.userId.toLowerCase() : null;

  async function readableProject(q: Q, actor: Actor, projectId: string) {
    const [row] = await q.select().from(t.projects).where(eq(t.projects.id, projectId)).limit(1);
    const me = uid(actor);
    if (!row || !(row.isDemo || (me !== null && row.ownerId === me))) {
      throw new StoreError("not_found", 404, "Project not found.");
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

  const evidenceOfProject = async (q: Q, projectId: string) =>
    (
      await q
        .select()
        .from(t.evidenceCandidates)
        .where(eq(t.evidenceCandidates.projectId, projectId))
        .orderBy(asc(t.evidenceCandidates.id))
    ).map(evidenceOf);

  const notYet = (what: string): never => {
    throw new StoreError(
      "not_implemented",
      501,
      `${what} is not implemented in the Supabase store yet.`,
    );
  };

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
        .orderBy(asc(t.projects.createdAt), asc(t.projects.id));
      // The demo first, then the caller's own projects in the order they were made.
      return rows.map(projectOf).sort((a, b) => Number(b.isDemo) - Number(a.isDemo));
    },

    async getProjectDetail(actor, projectId) {
      return detailOf(db, await readableProject(db, actor, projectId));
    },

    async listEvidence(actor, projectId) {
      await readableProject(db, actor, projectId);
      return evidenceOfProject(db, projectId);
    },

    async listFindings(actor, projectId) {
      await readableProject(db, actor, projectId);
      const rows = await db
        .select()
        .from(t.findings)
        .where(eq(t.findings.projectId, projectId))
        .orderBy(asc(t.findings.id));
      return rows.map(findingOf);
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

    async getReportData(actor, projectId): Promise<ReportData> {
      const project = await readableProject(db, actor, projectId);
      const detail = await detailOf(db, project);
      const evidence = await evidenceOfProject(db, projectId);
      const findings = (
        await db
          .select()
          .from(t.findings)
          .where(eq(t.findings.projectId, projectId))
          .orderBy(asc(t.findings.id))
      ).map(findingOf);
      const reshoots = (
        await db
          .select()
          .from(t.reshootTasks)
          .where(eq(t.reshootTasks.projectId, projectId))
          .orderBy(asc(t.reshootTasks.createdAt), asc(t.reshootTasks.id))
      ).map(reshootOf);
      const decisions = (
        await db
          .select()
          .from(t.reviewDecisions)
          .where(eq(t.reviewDecisions.projectId, projectId))
          .orderBy(asc(t.reviewDecisions.createdAt), asc(t.reviewDecisions.id))
      ).map(decisionOf);
      const coverage: CoverageSummary = computeCoverage(
        detail.checklist,
        detail.scriptVersion,
        evidence,
        decisions,
        reshoots,
      );
      return { ...detail, evidence, findings, reshoots, decisions, seal: null, coverage };
    },

    // Write side: ingestion task 6.
    createProject: () => notYet("createProject"),
    createUploadUrl: () => notYet("createUploadUrl"),
    createScript: () => notYet("createScript"),
    setChecklist: () => notYet("setChecklist"),
    startAnalysis: () => notYet("startAnalysis"),
    reviewEvidence: () => notYet("reviewEvidence"),
    createReshoot: () => notYet("createReshoot"),
    listReshoots: () => notYet("listReshoots"),
    updateReshoot: () => notYet("updateReshoot"),
    getCoverage: () => notYet("getCoverage"),
    sealProject: () => notYet("sealProject"),
  };
}
