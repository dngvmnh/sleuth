import {
  MAX_VIDEO_BYTES,
  type AssetVersion,
  type AuditEvent,
  type ChecklistItem,
  type EvidenceCandidate,
  type Finding,
  type GoldenFixture,
  type ProcessingJob,
  type Project,
  type ReshootTask,
  type ReviewDecision,
  type ScriptVersion,
  type Seal,
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
  mergeEvidence,
  mergeFindings,
  nextUtcDayMs,
  planReanalysis,
  resolvePoltergeists,
  sealBlockers,
  segmentScript,
  startOfUtcDayMs,
} from "@sleuth/domain";
import type {
  Actor,
  AnalysisWriter,
  ProjectDetail,
  ProjectStore,
  PurgeResult,
  ReportData,
  RetentionStore,
} from "../store";
import { retentionCutoff, StoreError } from "../store";
import { cloneWithPrefix } from "../clone";
import { loadGoldenFixture } from "./load";

interface ProjectData {
  project: Project;
  assets: AssetVersion[];
  scripts: ScriptVersion[];
  checklist: ChecklistItem[];
  evidence: EvidenceCandidate[];
  findings: Finding[];
  decisions: ReviewDecision[];
  reshoots: ReshootTask[];
  jobs: ProcessingJob[];
  audit: AuditEvent[];
  /** Oldest first. At most one is `active`. */
  seals: Seal[];
}

export type { AnalysisResult } from "../store";

/**
 * The fixture store plus two helpers that stand in for work other parts of the system do:
 * `applyAnalysisResult` plays the worker finishing a job; `breakSeal` is the internal step the
 * revision and upload paths call. Neither is part of the shared `ProjectStore` contract.
 */
export interface FixtureStore extends ProjectStore, RetentionStore, AnalysisWriter {
  /** Mark the project's active seal broken. Returns the broken seal, or null if there was none. */
  breakSeal(projectId: string, reason: string): Seal | null;
}

export interface FixtureStoreOptions {
  now?: () => Date;
  /** Analysis requests one user may make per UTC day. Default 5 (DAILY_ANALYSIS_LIMIT_PER_USER). */
  dailyAnalysisLimit?: number;
  /** Longest video in ms. Default 180000. */
  maxVideoMs?: number;
  /**
   * Which users signed in anonymously. Fixture mode has no auth server, so by default an id that
   * starts with `anon-` counts as anonymous.
   */
  isAnonymousUser?: (userId: string) => boolean;
}

/**
 * Add findings; a finding with an id that already exists replaces the old one. Used for
 * Poltergeists: evidence that goes stale a second time reopens its (resolved) finding.
 */
function upsertFindings(existing: readonly Finding[], incoming: readonly Finding[]): Finding[] {
  const byId = new Map(existing.map((f) => [f.id, f]));
  for (const f of incoming) byId.set(f.id, f);
  return [...byId.values()];
}

/** The demo first, then the most recently changed (review-workspace 1.2). Ties: newest made first. */
export function sortProjects(projects: Project[]): Project[] {
  return [...projects].sort(
    (a, b) =>
      Number(b.isDemo) - Number(a.isDemo) ||
      Date.parse(b.updatedAt) - Date.parse(a.updatedAt) ||
      Date.parse(b.createdAt) - Date.parse(a.createdAt) ||
      b.id.localeCompare(a.id),
  );
}

/** In-memory store backed by the golden fixture. No database, no keys. Resets when the process restarts. */
export function createFixtureStore(options: FixtureStoreOptions = {}): FixtureStore {
  const now = options.now ?? (() => new Date());
  const iso = () => now().toISOString();
  const limitConfig = {
    maxVideoMs: options.maxVideoMs ?? 180_000,
    maxVideoBytes: MAX_VIDEO_BYTES,
    dailyAnalysisLimit: options.dailyAnalysisLimit ?? 5,
  };
  const data = new Map<string, ProjectData>();
  let counter = 0;
  const nextId = (p: string) => `${p}-${++counter}`;

  function seed(fx: GoldenFixture, ownerId: string | null, isDemo: boolean, name?: string) {
    data.set(fx.project.id, {
      project: { ...fx.project, ownerId, isDemo, name: name ?? fx.project.name },
      assets: [fx.assetVersion],
      scripts: [fx.script],
      checklist: [...fx.checklist],
      evidence: [...fx.expectedEvidence],
      findings: [...fx.expectedFindings],
      decisions: [],
      reshoots: [],
      jobs: [],
      audit: [],
      seals: [],
    });
  }

  /**
   * Append an audit event. `data` may hold ids and counts only: never script text, file names,
   * checklist labels, transcripts or notes (ingestion requirement 6.1).
   */
  function record(
    d: ProjectData,
    actor: Actor,
    type: string,
    eventData: Record<string, string | number | boolean | null>,
  ) {
    d.audit.push({
      id: nextId("ae"),
      projectId: d.project.id,
      actorId: actor.userId,
      type,
      data: eventData,
      createdAt: iso(),
    });
    touch(d);
  }

  /** Every change to a project or anything in it moves its "last change" time. */
  function touch(d: ProjectData) {
    d.project = { ...d.project, updatedAt: iso() };
  }

  /** Accepted analysis requests by this user today (UTC), across all their projects. */
  function analysesToday(userId: string): number {
    const start = startOfUtcDayMs(now().getTime());
    let count = 0;
    for (const d of data.values()) {
      for (const e of d.audit) {
        if (
          e.type === "analysis_requested" &&
          e.actorId === userId &&
          Date.parse(e.createdAt) >= start
        ) {
          count += 1;
        }
      }
    }
    return count;
  }
  const golden = loadGoldenFixture();
  seed(golden, null, true);

  const canRead = (d: ProjectData, a: Actor) =>
    d.project.isDemo || (a.userId !== null && d.project.ownerId === a.userId);

  function readable(actor: Actor, projectId: string): ProjectData {
    const d = data.get(projectId);
    if (!d || !canRead(d, actor)) throw new StoreError("not_found", 404, "Project not found.");
    return d;
  }
  function writable(actor: Actor, projectId: string): ProjectData {
    const d = readable(actor, projectId);
    if (d.project.isDemo) {
      throw new StoreError(
        "demo_read_only",
        403,
        "The demo project is read-only. Create your own project.",
      );
    }
    if (actor.userId === null || d.project.ownerId !== actor.userId) {
      throw new StoreError("forbidden", 403, "You do not own this project.");
    }
    return d;
  }
  const currentScript = (d: ProjectData) =>
    d.scripts.find((s) => s.id === d.project.currentScriptVersionId) ?? null;
  const currentAsset = (d: ProjectData) =>
    d.assets.find((a) => a.id === d.project.currentAssetVersionId) ?? null;
  const detail = (d: ProjectData): ProjectDetail => ({
    project: d.project,
    assetVersion: currentAsset(d),
    scriptVersion: currentScript(d),
    checklist: d.checklist,
  });

  /** Break the active seal, if any. Used by the revision and upload paths. */
  function breakSealOf(d: ProjectData, reason: string): Seal | null {
    const i = d.seals.findIndex((s) => s.status === "active");
    if (i < 0) return null;
    const broken: Seal = {
      ...(d.seals[i] as Seal),
      status: "broken",
      brokenAt: iso(),
      brokenReason: reason,
    };
    d.seals[i] = broken;
    record(d, { userId: null }, "seal_broken", { sealId: broken.id });
    return broken;
  }
  const coverageOf = (d: ProjectData) =>
    computeCoverage(d.checklist, currentScript(d), d.evidence, d.decisions, d.reshoots);
  const hasAnalysis = (d: ProjectData) =>
    d.evidence.length > 0 || d.jobs.some((j) => j.status === "succeeded");
  const blockersOf = (d: ProjectData) =>
    sealBlockers({
      coverage: coverageOf(d),
      evidence: d.evidence,
      jobs: d.jobs,
      hasAnalysis: hasAnalysis(d),
    });
  const latestSeal = (d: ProjectData) => d.seals[d.seals.length - 1] ?? null;

  return {
    async listProjects(actor) {
      return sortProjects(
        [...data.values()].filter((d) => canRead(d, actor)).map((d) => d.project),
      );
    },

    async getProjectDetail(actor, projectId) {
      return detail(readable(actor, projectId));
    },

    async getPlaybackUrl(actor, projectId, assetVersionId) {
      const d = readable(actor, projectId);
      if (!d.assets.some((a) => a.id === assetVersionId)) {
        throw new StoreError("not_found", 404, "Video version not found.");
      }
      // Fixture mode has no storage, so there is never a playable file.
      return { url: null, expiresAt: null };
    },

    async createProject(actor, input) {
      if (actor.userId === null)
        throw new StoreError("unauthorized", 401, "Sign in to create a project.");
      const id = nextId("proj");
      if (input.copyFromDemo) {
        seed(cloneWithPrefix(golden, id), actor.userId, false, input.name);
        // The copy is a new project: it was made now, not when the demo was.
        const copy = data.get(id) as ProjectData;
        copy.project = { ...copy.project, createdAt: iso(), updatedAt: iso() };
      } else {
        data.set(id, {
          project: {
            id,
            name: input.name,
            ownerId: actor.userId,
            isDemo: false,
            currentScriptVersionId: null,
            currentAssetVersionId: null,
            createdAt: iso(),
            updatedAt: iso(),
          },
          assets: [],
          scripts: [],
          checklist: [],
          evidence: [],
          findings: [],
          decisions: [],
          reshoots: [],
          jobs: [],
          audit: [],
          seals: [],
        });
      }
      const created = data.get(id) as ProjectData;
      record(created, actor, "project_created", { copiedFromDemo: input.copyFromDemo === true });
      return created.project;
    },

    async createUploadUrl(actor, projectId, input) {
      const d = writable(actor, projectId);
      const limit = checkLimits({
        durationMs: input.durationMs,
        sizeBytes: input.sizeBytes,
        config: limitConfig,
      });
      if (!limit.ok) {
        throw new StoreError("invalid_request", 400, "The video length or size is not allowed.", {
          reason: limit.code,
          maxVideoMs: limitConfig.maxVideoMs,
          maxVideoBytes: limitConfig.maxVideoBytes,
        });
      }
      const version = d.assets.reduce((m, a) => Math.max(m, a.version), 0) + 1;
      const assetVersion: AssetVersion = {
        id: nextId("av"),
        projectId,
        version,
        storagePath: `${projectId}/${version}/${input.fileName}`,
        mimeType: input.mimeType,
        durationMs: input.durationMs,
        createdAt: iso(),
      };
      d.assets.push(assetVersion);
      d.project = { ...d.project, currentAssetVersionId: assetVersion.id };
      // Evidence on older video versions goes stale (see domain.invalidateForNewAssetVersion).
      const before = d.evidence;
      d.evidence = invalidateForNewAssetVersion(before, assetVersion.id);
      const staleEvidenceIds = d.evidence
        .filter((e, i) => e.status === "stale" && before[i]?.status !== "stale")
        .map((e) => e.id);
      d.findings = upsertFindings(
        d.findings,
        buildPoltergeistFindings(
          d.evidence.filter((e) => staleEvidenceIds.includes(e.id)),
          nextId("run"),
          "video_replaced",
        ),
      );
      record(d, actor, "asset_version_created", {
        assetVersionId: assetVersion.id,
        version,
        durationMs: assetVersion.durationMs,
      });
      if (version > 1) {
        record(d, actor, "asset_replaced", { staleEvidence: staleEvidenceIds.length });
        // A new video always needs a new analysis, so any sign-off on the old one no longer holds.
        breakSealOf(d, "Evidence changed after sign-off: a new video was uploaded.");
      }
      return {
        assetVersion,
        // Fixture mode has no storage: nothing is uploaded.
        uploadUrl: `fixture://no-upload/${assetVersion.storagePath}`,
        expiresAt: new Date(now().getTime() + 5 * 60_000).toISOString(),
      };
    },

    async createScript(actor, projectId, text) {
      const d = writable(actor, projectId);
      const previous = currentScript(d);
      const version = d.scripts.reduce((m, s) => Math.max(m, s.version), 0) + 1;
      const id = nextId("sv");
      const segments = segmentScript(text, {
        scriptVersionId: id,
        previous: previous?.segments ?? [],
        retiredIds: d.scripts.flatMap((s) => s.segments.map((x) => x.id)),
      });
      const scriptVersion: ScriptVersion = {
        id,
        projectId,
        version,
        text,
        segments,
        createdAt: iso(),
      };
      const diff = diffScriptVersions(previous?.segments ?? [], segments);
      const before = d.evidence;
      d.evidence = invalidateForScriptChange(before, segments);
      const staleEvidenceIds = d.evidence
        .filter((e, i) => e.status === "stale" && before[i]?.status !== "stale")
        .map((e) => e.id);
      const poltergeists = buildPoltergeistFindings(
        d.evidence.filter((e) => staleEvidenceIds.includes(e.id)),
        nextId("run"),
      );
      d.findings = upsertFindings(d.findings, poltergeists);
      d.scripts.push(scriptVersion);
      d.project = { ...d.project, currentScriptVersionId: id };
      record(d, actor, "script_version_created", {
        scriptVersionId: id,
        version,
        segments: segments.length,
      });
      if (previous) {
        record(d, actor, "script_revised", {
          modified: diff.modified.length,
          added: diff.added.length,
          removed: diff.removed.length,
          staleEvidence: staleEvidenceIds.length,
        });
      }
      if (staleEvidenceIds.length > 0) {
        breakSealOf(d, "Evidence changed after sign-off: the script was edited.");
      }
      return {
        scriptVersion,
        diff,
        staleEvidenceIds,
        reanalysisPlan: planReanalysis(diff, d.evidence),
      };
    },

    async setChecklist(actor, projectId, labels) {
      const d = writable(actor, projectId);
      d.checklist = labels.map((label, position) => ({
        id: nextId("ck"),
        projectId,
        label,
        position,
      }));
      record(d, actor, "checklist_replaced", { items: d.checklist.length });
      return d.checklist;
    },

    async startAnalysis(actor, projectId, input) {
      const d = writable(actor, projectId);
      const asset = currentAsset(d);
      const script = currentScript(d);
      if (!asset || !script) {
        throw new StoreError("missing_inputs", 409, "Add a video and a script before analysis.");
      }
      if (input.segmentIds !== undefined) {
        const known = new Set(script.segments.map((s) => s.id));
        const unknownSegmentIds = [...new Set(input.segmentIds)].filter((id) => !known.has(id));
        if (input.segmentIds.length === 0 || unknownSegmentIds.length > 0) {
          throw new StoreError(
            "invalid_request",
            400,
            "segmentIds must name at least one line of the current script.",
            { unknownSegmentIds },
          );
        }
      }
      // Same request while a job for it is queued or running: hand back that job, make no new one.
      // "Same" = same video version, script version and set of segments (4.3).
      const wanted = [...new Set(input.segmentIds ?? [])].sort().join("|");
      const active = d.jobs.find(
        (j) =>
          (j.status === "queued" || j.status === "running") &&
          j.payload.assetVersionId === asset.id &&
          j.payload.scriptVersionId === script.id &&
          [...new Set(j.payload.segmentIds ?? [])].sort().join("|") === wanted &&
          (j.payload.segmentIds !== undefined) === (input.segmentIds !== undefined),
      );
      if (active) return active;

      const userId = actor.userId as string; // writable() guarantees a signed-in owner
      const limit = checkLimits({
        analysesToday: analysesToday(userId),
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
      const job: ProcessingJob = {
        id: nextId("job"),
        projectId,
        kind: input.segmentIds ? "reanalysis" : "analysis",
        status: "queued",
        attempts: 0,
        maxAttempts: 3,
        lockedBy: null,
        heartbeatAt: null,
        error: null,
        payload: {
          assetVersionId: asset.id,
          scriptVersionId: script.id,
          ...(input.segmentIds ? { segmentIds: input.segmentIds } : {}),
        },
        createdAt: stamp,
        updatedAt: stamp,
      };
      d.jobs.push(job);
      record(d, actor, "analysis_requested", {
        jobId: job.id,
        kind: job.kind,
        segments: input.segmentIds ? new Set(input.segmentIds).size : null,
      });
      return job;
    },

    async getJob(actor, projectId, jobId) {
      const d = readable(actor, projectId);
      const job = d.jobs.find((j) => j.id === jobId);
      if (!job) throw new StoreError("not_found", 404, "Job not found.");
      return job;
    },

    async listEvidence(actor, projectId) {
      return readable(actor, projectId).evidence;
    },

    async listFindings(actor, projectId) {
      return readable(actor, projectId).findings;
    },

    async listAuditEvents(actor, projectId) {
      // Audit trails are for the owner only. The demo has none to show.
      const d = readable(actor, projectId);
      if (d.project.isDemo || actor.userId === null || d.project.ownerId !== actor.userId) {
        throw new StoreError("forbidden", 403, "Only the project owner can read the audit trail.");
      }
      return d.audit;
    },

    async reviewEvidence(actor, evidenceId, input) {
      const d = [...data.values()].find((x) => x.evidence.some((e) => e.id === evidenceId));
      if (!d || !canRead(d, actor)) throw new StoreError("not_found", 404, "Evidence not found.");
      writable(actor, d.project.id);
      const index = d.evidence.findIndex((e) => e.id === evidenceId);
      const current = d.evidence[index] as EvidenceCandidate;
      const decision: ReviewDecision = {
        id: nextId("rd"),
        evidenceId,
        decision: input.decision,
        reviewerId: actor.userId ?? "",
        note: input.note ?? null,
        createdAt: iso(),
      };
      // Tell the rules what is current, so evidence that was dismissed while stale (rejected) can
      // never be confirmed later on an outdated line or video.
      const result = applyReviewDecision(current, decision, {
        segmentHash: currentScript(d)?.segments.find((s) => s.id === current.scriptSegmentId)?.hash,
        assetVersionId: currentAsset(d)?.id,
      });
      if (!result.ok) {
        throw new StoreError("review_refused", 409, `Decision refused: ${result.reason}.`, {
          reason: result.reason,
        });
      }
      d.evidence[index] = result.evidence;
      d.decisions.push(decision);
      touch(d);
      d.findings = d.findings.map((f) =>
        f.evidenceId === evidenceId ? { ...f, status: "resolved" as const } : f,
      );
      return { evidence: result.evidence, decision };
    },

    async createReshoot(actor, projectId, input) {
      const d = writable(actor, projectId);
      const reshoot: ReshootTask = {
        id: nextId("rs"),
        projectId,
        checklistItemId: input.checklistItemId ?? null,
        scriptSegmentId: input.scriptSegmentId ?? null,
        findingId: input.findingId ?? null,
        note: input.note,
        status: "open",
        createdAt: iso(),
      };
      d.reshoots.push(reshoot);
      touch(d);
      return reshoot;
    },

    async listReshoots(actor, projectId) {
      return readable(actor, projectId).reshoots;
    },

    async updateReshoot(actor, reshootId, status) {
      const d = [...data.values()].find((x) => x.reshoots.some((r) => r.id === reshootId));
      if (!d || !canRead(d, actor)) throw new StoreError("not_found", 404, "Reshoot not found.");
      writable(actor, d.project.id);
      const i = d.reshoots.findIndex((r) => r.id === reshootId);
      const updated: ReshootTask = { ...(d.reshoots[i] as ReshootTask), status };
      d.reshoots[i] = updated;
      touch(d);
      return updated;
    },

    async getCoverage(actor, projectId) {
      const d = readable(actor, projectId);
      return { coverage: coverageOf(d), seal: latestSeal(d), blockers: blockersOf(d) };
    },

    async sealProject(actor, projectId, note) {
      const d = writable(actor, projectId);
      // A person must sign. A blank id is not a person (3.4).
      if (actor.userId === null || actor.userId.trim() === "") {
        throw new StoreError("unauthorized", 401, "Sign in to apply the Final Seal.");
      }
      const coverage = coverageOf(d);
      const decision = canSeal({
        coverage,
        evidence: d.evidence,
        jobs: d.jobs,
        hasAnalysis: hasAnalysis(d),
      });
      if (!decision.ok) {
        throw new StoreError("seal_blocked", 409, "The project cannot be sealed yet.", {
          blockers: decision.blockers,
        });
      }
      const script = currentScript(d) as ScriptVersion; // no blockers means there is an analysis
      const asset = currentAsset(d) as AssetVersion;
      // Only one seal is active. An older active seal is replaced and kept in the history.
      const replaced = d.seals.findIndex((s) => s.status === "active");
      if (replaced >= 0) {
        d.seals[replaced] = {
          ...(d.seals[replaced] as Seal),
          status: "broken",
          brokenAt: iso(),
          brokenReason: "Replaced by a newer seal.",
        };
      }
      const seal: Seal = {
        id: nextId("seal"),
        projectId,
        sealedBy: actor.userId,
        sealedAt: iso(),
        scriptVersionId: script.id,
        assetVersionId: asset.id,
        coverage,
        note: note ?? null,
        status: "active",
        brokenAt: null,
        brokenReason: null,
      };
      d.seals.push(seal);
      record(d, actor, "project_sealed", {
        sealId: seal.id,
        proven: coverage.totals.proven,
        openReshoots: coverage.openReshootIds.length,
      });
      return seal;
    },

    breakSeal(projectId, reason) {
      const d = data.get(projectId);
      return d ? breakSealOf(d, reason) : null;
    },

    async applyAnalysisResult(actor, projectId, jobId, produced) {
      const d = writable(actor, projectId);
      const i = d.jobs.findIndex((j) => j.id === jobId);
      if (i < 0) throw new StoreError("not_found", 404, "Job not found.");
      const job = d.jobs[i] as ProcessingJob;
      const planned = job.payload.segmentIds ? new Set(job.payload.segmentIds) : null;

      // A targeted run may only write about its own lines. Checklist-level findings (Ghosts)
      // need the whole script, so only a full run may replace them.
      const evidence = produced.evidence.filter((e) => !planned || planned.has(e.scriptSegmentId));
      const findings = produced.findings.filter((f) =>
        planned ? f.scriptSegmentId !== null && planned.has(f.scriptSegmentId) : true,
      );

      // Stale candidates whose line now has a fresh candidate are replaced for Poltergeist purposes.
      const freshSegments = new Set(evidence.map((e) => e.scriptSegmentId));
      const replacedEvidenceIds = d.evidence
        .filter((e) => e.status === "stale" && freshSegments.has(e.scriptSegmentId))
        .map((e) => e.id);

      d.evidence = mergeEvidence(d.evidence, evidence);
      d.findings = resolvePoltergeists(mergeFindings(d.findings, findings), replacedEvidenceIds);
      const done: ProcessingJob = {
        ...job,
        status: "succeeded",
        attempts: Math.max(job.attempts, 1),
        error: null,
        lockedBy: null,
        updatedAt: iso(),
      };
      d.jobs[i] = done;
      touch(d);
      return { job: done, replacedEvidenceIds };
    },

    async purgeExpiredAnonymousProjects(at, days): Promise<PurgeResult> {
      const cutoff = retentionCutoff(at, days).getTime();
      const isAnonymous = options.isAnonymousUser ?? ((id: string) => id.startsWith("anon-"));
      const projectIds: string[] = [];
      let files = 0;
      for (const [id, d] of data) {
        const owner = d.project.ownerId;
        if (d.project.isDemo || owner === null || !isAnonymous(owner)) continue;
        if (Date.parse(d.project.createdAt) >= cutoff) continue;
        // Fixture mode stores no files; count the asset paths that storage would have held.
        files += d.assets.length;
        data.delete(id);
        projectIds.push(id);
      }
      return { projectIds, files };
    },

    async getReportData(actor, projectId): Promise<ReportData> {
      const d = readable(actor, projectId);
      return {
        ...detail(d),
        evidence: d.evidence,
        findings: d.findings,
        reshoots: d.reshoots,
        decisions: d.decisions,
        seal: latestSeal(d),
        coverage: coverageOf(d),
      };
    },
  };
}
