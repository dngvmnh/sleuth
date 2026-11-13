import type {
  AssetVersion,
  ChecklistItem,
  EvidenceCandidate,
  FrameObservation,
  ProcessingJob,
  ScriptVersion,
  TranscriptSegment,
} from "@sleuth/contracts";
import { and, asc, eq, sql } from "drizzle-orm";
import type { Db } from "../client";
import * as t from "../schema";
import type { AnalysisResult } from "../store";
import { assetOf, checklistOf, jobOf, scriptOf } from "./mappers";
import { evidenceOfProject, mergeAnalysisResult } from "./rows";
import type { StorageClient } from "./storage";
import type { Q } from "./store";

/**
 * The worker's side of Supabase mode (evidence-analysis 12). See `docs/worker-supabase-contract.md`.
 *
 * The worker's own queue (`apps/worker/src/pg-queue.ts`) owns the job status: claim, heartbeat,
 * complete, fail. This store owns the data: it loads a claimed job's inputs and writes its result.
 * Both calls check the lease (status `running`, `locked_by` = this worker), so a worker that lost
 * its job to another worker can never write over the other one's work.
 */

export type WorkerErrorCode =
  | "job_not_found"
  | "lease_lost"
  | "superseded"
  | "demo_read_only"
  | "upload_missing"
  | "not_configured";

/** A refusal the worker turns into `queue.fail(jobId, workerId, "<step>: <code>")`. No content. */
export class WorkerStoreError extends Error {
  constructor(public readonly code: WorkerErrorCode) {
    super(code);
    this.name = "WorkerStoreError";
  }
}

/**
 * Who owns the job's project. The worker decides from this whether frames may go to a third
 * party (decision D-4: never a visitor's video). `realAccount` is true only when Supabase Auth
 * holds the owner and says the account is not anonymous; an unknown owner is not trusted.
 */
export interface JobOwner {
  userId: string | null;
  realAccount: boolean;
}

export interface JobInputs {
  job: ProcessingJob;
  projectId: string;
  owner: JobOwner;
  /** The video the job was queued for. Fetch it with `createVideoDownloadUrl`. */
  asset: AssetVersion;
  /** The script version the job was queued for, segments in order. */
  script: ScriptVersion;
  checklist: ChecklistItem[];
  /** Everything stored for the project now. The Ghost check needs it on a targeted run. */
  existingEvidence: EvidenceCandidate[];
  /** Lines to analyse. Null means a full run (all lines, plus checklist-level Ghost findings). */
  segmentIds: string[] | null;
}

/** What the pipeline produced. Transcript and frames are stored so the UI can show proof. */
export interface WorkerResult extends AnalysisResult {
  transcript?: TranscriptSegment[];
  frames?: FrameObservation[];
}

export interface WorkerStore {
  loadJobInputs(jobId: string, workerId: string): Promise<JobInputs>;
  /** Short-lived read URL for the job's video. */
  createVideoDownloadUrl(inputs: JobInputs): Promise<string>;
  /**
   * Store transcript, frames, evidence and findings in one transaction. Idempotent: writing the
   * same result twice changes nothing. Does not change the job status: call `queue.complete` next.
   */
  writeJobResult(
    jobId: string,
    workerId: string,
    result: WorkerResult,
  ): Promise<{ replacedEvidenceIds: string[] }>;
}

export interface WorkerStoreOptions {
  db: Db;
  /** Needed for the upload check and the download URL. */
  storage?: StorageClient;
  now?: () => Date;
}

export function createWorkerStore(options: WorkerStoreOptions): WorkerStore {
  const { db, storage } = options;
  const now = options.now ?? (() => new Date());

  /** The job, locked, if this worker holds it and it still matches the project's current versions. */
  /** Owner of a project; a real account only if Auth knows it and it is not anonymous. */
  async function ownerOf(q: Q, ownerId: string | null): Promise<JobOwner> {
    if (ownerId === null) return { userId: null, realAccount: false };
    const rows = await q.execute(
      sql`select is_anonymous from auth.users where id = ${ownerId}::uuid limit 1`,
    );
    const row = (rows as unknown as { is_anonymous?: boolean | null }[])[0];
    return { userId: ownerId, realAccount: row !== undefined && row.is_anonymous === false };
  }

  async function leasedJob(q: Q, jobId: string, workerId: string) {
    const [row] = await q
      .select()
      .from(t.processingJobs)
      .where(eq(t.processingJobs.id, jobId))
      .for("update");
    if (!row) throw new WorkerStoreError("job_not_found");
    if (row.status !== "running" || row.lockedBy !== workerId) {
      throw new WorkerStoreError("lease_lost");
    }
    const [project] = await q.select().from(t.projects).where(eq(t.projects.id, row.projectId));
    if (!project) throw new WorkerStoreError("job_not_found");
    // The public demo is read-only, even for the worker.
    if (project.isDemo) throw new WorkerStoreError("demo_read_only");
    // A newer video or script exists: this result would be stale the moment it was written.
    if (
      project.currentAssetVersionId !== row.payload.assetVersionId ||
      project.currentScriptVersionId !== row.payload.scriptVersionId
    ) {
      throw new WorkerStoreError("superseded");
    }
    return { job: jobOf(row), project };
  }

  return {
    async loadJobInputs(jobId, workerId) {
      return db.transaction(async (tx) => {
        const { job, project } = await leasedJob(tx, jobId, workerId);
        const owner = await ownerOf(tx, project.ownerId);
        const [asset] = await tx
          .select()
          .from(t.assetVersions)
          .where(eq(t.assetVersions.id, job.payload.assetVersionId));
        const [script] = await tx
          .select()
          .from(t.scriptVersions)
          .where(eq(t.scriptVersions.id, job.payload.scriptVersionId));
        if (!asset || !script) throw new WorkerStoreError("superseded");
        const segments = await tx
          .select()
          .from(t.scriptSegments)
          .where(eq(t.scriptSegments.scriptVersionId, script.id))
          .orderBy(asc(t.scriptSegments.index));
        const checklist = await tx
          .select()
          .from(t.checklistItems)
          .where(eq(t.checklistItems.projectId, job.projectId))
          .orderBy(asc(t.checklistItems.position));
        if (storage && (await storage.uploadedAt(asset.storagePath)) === null) {
          throw new WorkerStoreError("upload_missing");
        }
        return {
          job,
          projectId: job.projectId,
          owner,
          asset: assetOf(asset),
          script: scriptOf(script, segments),
          checklist: checklist.map(checklistOf),
          existingEvidence: await evidenceOfProject(tx, job.projectId),
          segmentIds: job.payload.segmentIds ?? null,
        };
      });
    },

    async createVideoDownloadUrl(inputs) {
      if (!storage) throw new WorkerStoreError("not_configured");
      return (await storage.createSignedDownloadUrl(inputs.asset.storagePath)).url;
    },

    async writeJobResult(jobId, workerId, result) {
      return db.transaction(async (tx) => {
        const { job, project } = await leasedJob(tx, jobId, workerId);
        const owned = { projectId: project.id, assetVersionId: job.payload.assetVersionId };
        const transcript = (result.transcript ?? []).map((s) => ({ ...s, ...owned }));
        const frames = (result.frames ?? []).map((f) => ({ ...f, ...owned }));
        if (transcript.length > 0) {
          await tx.insert(t.transcriptSegments).values(transcript).onConflictDoNothing();
        }
        if (frames.length > 0) {
          await tx.insert(t.frameObservations).values(frames).onConflictDoNothing();
        }
        const replacedEvidenceIds = await mergeAnalysisResult(tx, project.id, job, result);
        await tx
          .update(t.projects)
          .set({ updatedAt: now().toISOString() })
          .where(and(eq(t.projects.id, project.id), eq(t.projects.isDemo, false)));
        return { replacedEvidenceIds };
      });
    },
  };
}
