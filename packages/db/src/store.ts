import type {
  AssetVersion,
  AuditEvent,
  ChecklistItem,
  CreateReshootRequest,
  CreateScriptResponse,
  CoverageSummary,
  EvidenceCandidate,
  Finding,
  GetCoverageResponse,
  ProcessingJob,
  Project,
  ReshootTask,
  ReviewDecision,
  ReviewRequest,
  ScriptVersion,
  Seal,
  StartAnalysisRequest,
  UploadUrlRequest,
} from "@sleuth/contracts";

/** Who is calling. `userId` is null only for a visitor who has not signed in. */
export interface Actor {
  userId: string | null;
}

export class StoreError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: 400 | 401 | 403 | 404 | 409 | 429 | 501,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "StoreError";
  }
}

export interface ProjectDetail {
  project: Project;
  assetVersion: AssetVersion | null;
  scriptVersion: ScriptVersion | null;
  checklist: ChecklistItem[];
}

export interface ReportData extends ProjectDetail {
  evidence: EvidenceCandidate[];
  findings: Finding[];
  reshoots: ReshootTask[];
  /** Every review decision, oldest first. Who confirmed what, and when. */
  decisions: ReviewDecision[];
  /** The latest seal, active or broken. */
  seal: Seal | null;
  coverage: CoverageSummary;
}

/**
 * What the API routes need from storage. The fixture store implements it in memory;
 * a Supabase store will implement it against Postgres (ingestion spec).
 * Every method checks access: readable = demo or own project; writable = own, non-demo project.
 * A project the caller cannot read is reported as not found.
 */
export interface ProjectStore {
  listProjects(actor: Actor): Promise<Project[]>;
  getProjectDetail(actor: Actor, projectId: string): Promise<ProjectDetail>;
  createProject(actor: Actor, input: { name: string; copyFromDemo?: boolean }): Promise<Project>;
  createUploadUrl(
    actor: Actor,
    projectId: string,
    input: UploadUrlRequest,
  ): Promise<{ assetVersion: AssetVersion; uploadUrl: string; expiresAt: string }>;
  createScript(actor: Actor, projectId: string, text: string): Promise<CreateScriptResponse>;
  setChecklist(actor: Actor, projectId: string, labels: string[]): Promise<ChecklistItem[]>;
  startAnalysis(
    actor: Actor,
    projectId: string,
    input: StartAnalysisRequest,
  ): Promise<ProcessingJob>;
  getJob(actor: Actor, projectId: string, jobId: string): Promise<ProcessingJob>;
  listEvidence(actor: Actor, projectId: string): Promise<EvidenceCandidate[]>;
  listFindings(actor: Actor, projectId: string): Promise<Finding[]>;
  /** Owner only. Events hold ids and counts, never content (ingestion requirement 6.1). */
  listAuditEvents(actor: Actor, projectId: string): Promise<AuditEvent[]>;
  reviewEvidence(
    actor: Actor,
    evidenceId: string,
    input: ReviewRequest,
  ): Promise<{ evidence: EvidenceCandidate; decision: ReviewDecision }>;
  createReshoot(actor: Actor, projectId: string, input: CreateReshootRequest): Promise<ReshootTask>;
  listReshoots(actor: Actor, projectId: string): Promise<ReshootTask[]>;
  /** Owner only. Marking a reshoot done does not make its item proven. */
  updateReshoot(actor: Actor, reshootId: string, status: "open" | "done"): Promise<ReshootTask>;
  getCoverage(actor: Actor, projectId: string): Promise<GetCoverageResponse>;
  /**
   * The Final Seal. Signed-in owner of a non-demo project only. Refuses with 409 `seal_blocked`
   * (details.blockers) while the sealing rules are not met.
   */
  sealProject(actor: Actor, projectId: string, note?: string): Promise<Seal>;
  getReportData(actor: Actor, projectId: string): Promise<ReportData>;
}
