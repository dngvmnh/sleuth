import {
  type AssetVersion,
  type ChecklistItem,
  type EvidenceCandidate,
  type Finding,
  type GoldenFixture,
  type ProcessingJob,
  type Project,
  type ReshootTask,
  type ReviewDecision,
  type ScriptVersion,
} from "@sleuth/contracts";
import {
  applyReviewDecision,
  buildPoltergeistFindings,
  diffScriptVersions,
  invalidateForNewAssetVersion,
  invalidateForScriptChange,
  segmentScript,
} from "@sleuth/domain";
import type { Actor, ProjectDetail, ProjectStore, ReportData } from "../store";
import { StoreError } from "../store";
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
}

export interface FixtureStoreOptions {
  now?: () => Date;
}

/** Re-key a fixture under a new project: every known id gets the prefix. Segment ids stay (scoped by version). */
function cloneWithPrefix(fx: GoldenFixture, projectId: string): GoldenFixture {
  const prefix = `${projectId}:`;
  const ids = new Set<string>([
    fx.project.id,
    fx.assetVersion.id,
    fx.script.id,
    ...fx.checklist.map((c) => c.id),
    ...fx.transcript.map((t) => t.id),
    ...fx.frames.map((f) => f.id),
    ...fx.expectedEvidence.map((e) => e.id),
    ...fx.expectedFindings.map((f) => f.id),
  ]);
  const walk = (v: unknown): unknown => {
    if (typeof v === "string")
      return ids.has(v) ? (v === fx.project.id ? projectId : prefix + v) : v;
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === "object") {
      return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x)]));
    }
    return v;
  };
  return walk(fx) as GoldenFixture;
}

/** In-memory store backed by the golden fixture. No database, no keys. Resets when the process restarts. */
export function createFixtureStore(options: FixtureStoreOptions = {}): ProjectStore {
  const now = options.now ?? (() => new Date());
  const iso = () => now().toISOString();
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
    });
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

  return {
    async listProjects(actor) {
      return [...data.values()].filter((d) => canRead(d, actor)).map((d) => d.project);
    },

    async getProjectDetail(actor, projectId) {
      return detail(readable(actor, projectId));
    },

    async createProject(actor, input) {
      if (actor.userId === null)
        throw new StoreError("unauthorized", 401, "Sign in to create a project.");
      const id = nextId("proj");
      if (input.copyFromDemo) {
        seed(cloneWithPrefix(golden, id), actor.userId, false, input.name);
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
          },
          assets: [],
          scripts: [],
          checklist: [],
          evidence: [],
          findings: [],
          decisions: [],
          reshoots: [],
          jobs: [],
        });
      }
      return (data.get(id) as ProjectData).project;
    },

    async createUploadUrl(actor, projectId, input) {
      const d = writable(actor, projectId);
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
      d.evidence = invalidateForNewAssetVersion(d.evidence, assetVersion.id);
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
      const known = new Set(d.findings.map((f) => f.id));
      d.findings = [...d.findings, ...poltergeists.filter((f) => !known.has(f.id))];
      d.scripts.push(scriptVersion);
      d.project = { ...d.project, currentScriptVersionId: id };
      return { scriptVersion, diff, staleEvidenceIds };
    },

    async setChecklist(actor, projectId, labels) {
      const d = writable(actor, projectId);
      d.checklist = labels.map((label, position) => ({
        id: nextId("ck"),
        projectId,
        label,
        position,
      }));
      return d.checklist;
    },

    async startAnalysis(actor, projectId, input) {
      const d = writable(actor, projectId);
      const asset = currentAsset(d);
      const script = currentScript(d);
      if (!asset || !script) {
        throw new StoreError("missing_inputs", 409, "Add a video and a script before analysis.");
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
      const result = applyReviewDecision(current, decision);
      if (!result.ok) {
        throw new StoreError("review_refused", 409, `Decision refused: ${result.reason}.`, {
          reason: result.reason,
        });
      }
      d.evidence[index] = result.evidence;
      d.decisions.push(decision);
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
      return reshoot;
    },

    async getReportData(actor, projectId): Promise<ReportData> {
      const d = readable(actor, projectId);
      return { ...detail(d), evidence: d.evidence, findings: d.findings, reshoots: d.reshoots };
    },
  };
}
