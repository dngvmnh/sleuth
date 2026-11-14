import type { AnalysisResult } from "../store";
import type { EvidenceCandidate, Finding, ProcessingJob } from "@sleuth/contracts";
import { mergeEvidence, mergeFindings, resolvePoltergeists } from "@sleuth/domain";
import { asc, eq, sql } from "drizzle-orm";
import * as t from "../schema";
import { evidenceOf, findingOf } from "./mappers";
import type { Q } from "./store";

/** Row helpers shared by the API store and the worker store. Each runs on a database or a transaction. */
export const evidenceOfProject = async (q: Q, projectId: string): Promise<EvidenceCandidate[]> =>
  (
    await q
      .select()
      .from(t.evidenceCandidates)
      .where(eq(t.evidenceCandidates.projectId, projectId))
      .orderBy(asc(t.evidenceCandidates.id))
  ).map(evidenceOf);

export const findingsOfProject = async (q: Q, projectId: string): Promise<Finding[]> =>
  (
    await q
      .select()
      .from(t.findings)
      .where(eq(t.findings.projectId, projectId))
      .orderBy(asc(t.findings.id))
  ).map(findingOf);

/**
 * The stored id of a finding the engine produced for `projectId`. The engine keys findings by
 * script segment (`fd-cursed-frame-seg-1`), and segment ids restart at `seg-1` in every project,
 * while `findings.id` is unique across all projects. Without a project part, one project's
 * analysis overwrote another project's finding with the same id, the public demo's included.
 * The form `<projectId>:<id>` is the one `cloneWithPrefix` gives a copy of the demo, so a
 * re-analysis of a copy updates its copied findings instead of adding a second set.
 */
export function findingIdIn(projectId: string, id: string): string {
  return id.startsWith(`${projectId}:`) ? id : `${projectId}:${id}`;
}

/**
 * Insert findings; a finding with an id that already exists in the same project is replaced.
 * A row of another project with the same id is never touched: then the insert fails loudly
 * instead of moving data between projects.
 */
export async function upsertFindings(q: Q, findings: Finding[]) {
  if (findings.length === 0) return;
  const written = await q
    .insert(t.findings)
    .values(findings)
    .onConflictDoUpdate({
      target: t.findings.id,
      setWhere: sql`${t.findings.projectId} = excluded.project_id`,
      set: {
        type: sql`excluded.type`,
        plainLabel: sql`excluded.plain_label`,
        checklistItemId: sql`excluded.checklist_item_id`,
        scriptSegmentId: sql`excluded.script_segment_id`,
        evidenceId: sql`excluded.evidence_id`,
        found: sql`excluded.found`,
        notFound: sql`excluded.not_found`,
        limits: sql`excluded.limits`,
        status: sql`excluded.status`,
        analysisRunId: sql`excluded.analysis_run_id`,
      },
    })
    .returning({ id: t.findings.id });
  assertAllWritten("findings", findings.length, written.length);
}

/** A conflict with another project's row writes nothing; say so instead of losing data quietly. */
function assertAllWritten(table: string, expected: number, written: number): void {
  if (written !== expected) {
    throw new Error(`${table}: ${expected - written} row id(s) belong to another project`);
  }
}

/**
 * Insert evidence; a candidate with an id that already exists in the same project is replaced.
 * Evidence ids include the video version id, so they are unique already; the project check is a
 * second wall.
 */
export async function upsertEvidence(q: Q, evidence: EvidenceCandidate[]) {
  if (evidence.length === 0) return;
  const written = await q
    .insert(t.evidenceCandidates)
    .values(evidence)
    .onConflictDoUpdate({
      target: t.evidenceCandidates.id,
      setWhere: sql`${t.evidenceCandidates.projectId} = excluded.project_id`,
      set: {
        checklistItemId: sql`excluded.checklist_item_id`,
        scriptSegmentId: sql`excluded.script_segment_id`,
        scriptVersionId: sql`excluded.script_version_id`,
        segmentHash: sql`excluded.segment_hash`,
        assetVersionId: sql`excluded.asset_version_id`,
        startMs: sql`excluded.start_ms`,
        endMs: sql`excluded.end_ms`,
        transcriptSegmentIds: sql`excluded.transcript_segment_ids`,
        frameObservationIds: sql`excluded.frame_observation_ids`,
        explanation: sql`excluded.explanation`,
        confidence: sql`excluded.confidence`,
        status: sql`excluded.status`,
        source: sql`excluded.source`,
        analysisRunId: sql`excluded.analysis_run_id`,
      },
    })
    .returning({ id: t.evidenceCandidates.id });
  assertAllWritten("evidence", evidence.length, written.length);
}

/**
 * Merge one analysis result into a project, inside the caller's transaction. A targeted job
 * (`segmentIds`) only writes about its own lines; checklist-level findings (Ghosts) come only from
 * full runs. Human decisions on an unchanged hash are kept (`mergeEvidence`), resolved findings stay
 * resolved (`mergeFindings`), and the Poltergeists of stale evidence that a fresh candidate replaces
 * are resolved. Only changed rows are written, so a repeat of the same result is a no-op.
 * Does not change the job's status. Returns the ids of the stale candidates that were replaced.
 */
export async function mergeAnalysisResult(
  q: Q,
  projectId: string,
  job: Pick<ProcessingJob, "payload">,
  produced: AnalysisResult,
): Promise<string[]> {
  const planned = job.payload.segmentIds ? new Set(job.payload.segmentIds) : null;
  // Rows must belong to this project, whatever the producer claims.
  const evidence = produced.evidence
    .filter((e) => !planned || planned.has(e.scriptSegmentId))
    .map((e) => ({ ...e, projectId }));
  const findings = produced.findings
    .filter((f) => (planned ? f.scriptSegmentId !== null && planned.has(f.scriptSegmentId) : true))
    .map((f) => ({ ...f, id: findingIdIn(projectId, f.id), projectId }));

  const existing = await evidenceOfProject(q, projectId);
  const freshSegments = new Set(evidence.map((e) => e.scriptSegmentId));
  const replacedEvidenceIds = existing
    .filter((e) => e.status === "stale" && freshSegments.has(e.scriptSegmentId))
    .map((e) => e.id);

  const before = new Map(existing.map((e) => [e.id, JSON.stringify(e)]));
  await upsertEvidence(
    q,
    mergeEvidence(existing, evidence).filter((e) => before.get(e.id) !== JSON.stringify(e)),
  );
  const oldFindings = await findingsOfProject(q, projectId);
  const beforeF = new Map(oldFindings.map((f) => [f.id, JSON.stringify(f)]));
  await upsertFindings(
    q,
    resolvePoltergeists(mergeFindings(oldFindings, findings), replacedEvidenceIds).filter(
      (f) => beforeF.get(f.id) !== JSON.stringify(f),
    ),
  );
  return replacedEvidenceIds;
}
