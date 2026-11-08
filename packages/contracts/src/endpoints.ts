import { z } from "zod";
import {
  AssetVersionSchema,
  ChecklistItemSchema,
  EvidenceCandidateSchema,
  FindingSchema,
  IdSchema,
  IsoDateSchema,
  MsSchema,
  ProcessingJobSchema,
  ProjectSchema,
  ReshootTaskSchema,
  ReviewDecisionKindSchema,
  ReviewDecisionSchema,
  ScriptVersionSchema,
} from "./entities";

export const MAX_VIDEO_SECONDS = 180;
export const MAX_VIDEO_MS = MAX_VIDEO_SECONDS * 1000;

// ---- request and response bodies ----

export const CreateProjectRequestSchema = z.object({
  name: z.string().trim().min(1).max(120),
  /** Fixture mode helper: start from an editable copy of the demo data. */
  copyFromDemo: z.boolean().optional(),
});
export const CreateProjectResponseSchema = z.object({ project: ProjectSchema });

export const ListProjectsResponseSchema = z.object({ projects: z.array(ProjectSchema) });

export const GetProjectResponseSchema = z.object({
  project: ProjectSchema,
  assetVersion: AssetVersionSchema.nullable(),
  scriptVersion: ScriptVersionSchema.nullable(),
  checklist: z.array(ChecklistItemSchema),
});

export const UploadUrlRequestSchema = z.object({
  fileName: z.string().trim().min(1).max(200),
  mimeType: z.string().regex(/^video\//),
  durationMs: MsSchema.max(MAX_VIDEO_MS),
});
export const UploadUrlResponseSchema = z.object({
  assetVersion: AssetVersionSchema,
  uploadUrl: z.string().min(1),
  expiresAt: IsoDateSchema,
});

export const CreateScriptRequestSchema = z.object({ text: z.string().trim().min(1).max(20000) });
export const CreateScriptResponseSchema = z.object({
  scriptVersion: ScriptVersionSchema,
  diff: z.object({
    added: z.array(IdSchema),
    modified: z.array(IdSchema),
    removed: z.array(IdSchema),
    unchanged: z.array(IdSchema),
  }),
  staleEvidenceIds: z.array(IdSchema),
});

export const SetChecklistRequestSchema = z.object({
  items: z
    .array(z.object({ label: z.string().trim().min(1).max(300) }))
    .min(1)
    .max(50),
});
export const SetChecklistResponseSchema = z.object({ items: z.array(ChecklistItemSchema) });

export const StartAnalysisRequestSchema = z.object({
  /** Re-analyse only these segments. Omit for a full run. */
  segmentIds: z.array(IdSchema).optional(),
});
export const StartAnalysisResponseSchema = z.object({ job: ProcessingJobSchema });

export const GetJobResponseSchema = z.object({ job: ProcessingJobSchema });

export const ListEvidenceResponseSchema = z.object({ evidence: z.array(EvidenceCandidateSchema) });
export const ListFindingsResponseSchema = z.object({ findings: z.array(FindingSchema) });

export const ReviewRequestSchema = z.object({
  decision: ReviewDecisionKindSchema,
  note: z.string().max(1000).optional(),
});
export const ReviewResponseSchema = z.object({
  evidence: EvidenceCandidateSchema,
  decision: ReviewDecisionSchema,
});

export const CreateReshootRequestSchema = z.object({
  note: z.string().trim().min(1).max(1000),
  checklistItemId: IdSchema.optional(),
  scriptSegmentId: IdSchema.optional(),
  findingId: IdSchema.optional(),
});
export const CreateReshootResponseSchema = z.object({ reshoot: ReshootTaskSchema });

// ---- endpoint registry (drives OpenAPI and the API client) ----

export type HttpMethod = "GET" | "POST" | "PATCH";

export interface EndpointSpec {
  id: string;
  method: HttpMethod;
  /** OpenAPI-style path, relative to /api/v1. */
  path: string;
  summary: string;
  request?: z.ZodType;
  response?: z.ZodType;
  /** For non-JSON responses. */
  contentType?: "text/csv" | "text/html";
  successStatus: 200 | 201 | 202;
}

export const ENDPOINTS = [
  {
    id: "createProject",
    method: "POST",
    path: "/projects",
    summary: "Create a project",
    request: CreateProjectRequestSchema,
    response: CreateProjectResponseSchema,
    successStatus: 201,
  },
  {
    id: "listProjects",
    method: "GET",
    path: "/projects",
    summary: "List projects the caller can see, including the public demo",
    response: ListProjectsResponseSchema,
    successStatus: 200,
  },
  {
    id: "getProject",
    method: "GET",
    path: "/projects/{id}",
    summary: "Get a project with its current video, script and checklist",
    response: GetProjectResponseSchema,
    successStatus: 200,
  },
  {
    id: "createUploadUrl",
    method: "POST",
    path: "/projects/{id}/assets/upload-url",
    summary: "Create a new asset version and a short-lived signed upload URL",
    request: UploadUrlRequestSchema,
    response: UploadUrlResponseSchema,
    successStatus: 201,
  },
  {
    id: "createScript",
    method: "POST",
    path: "/projects/{id}/scripts",
    summary: "Save a new script version; returns the diff and which evidence went stale",
    request: CreateScriptRequestSchema,
    response: CreateScriptResponseSchema,
    successStatus: 201,
  },
  {
    id: "setChecklist",
    method: "POST",
    path: "/projects/{id}/checklist",
    summary: "Replace the checklist",
    request: SetChecklistRequestSchema,
    response: SetChecklistResponseSchema,
    successStatus: 201,
  },
  {
    id: "startAnalysis",
    method: "POST",
    path: "/projects/{id}/analysis",
    summary: "Queue an analysis job",
    request: StartAnalysisRequestSchema,
    response: StartAnalysisResponseSchema,
    successStatus: 202,
  },
  {
    id: "getJob",
    method: "GET",
    path: "/projects/{id}/jobs/{jobId}",
    summary: "Get a processing job",
    response: GetJobResponseSchema,
    successStatus: 200,
  },
  {
    id: "listEvidence",
    method: "GET",
    path: "/projects/{id}/evidence",
    summary: "List evidence candidates",
    response: ListEvidenceResponseSchema,
    successStatus: 200,
  },
  {
    id: "listFindings",
    method: "GET",
    path: "/projects/{id}/findings",
    summary: "List findings",
    response: ListFindingsResponseSchema,
    successStatus: 200,
  },
  {
    id: "reviewEvidence",
    method: "PATCH",
    path: "/evidence/{id}/review",
    summary: "Record a human review decision (Exorcism) on one evidence candidate",
    request: ReviewRequestSchema,
    response: ReviewResponseSchema,
    successStatus: 200,
  },
  {
    id: "createReshoot",
    method: "POST",
    path: "/projects/{id}/reshoots",
    summary: "Create a reshoot task",
    request: CreateReshootRequestSchema,
    response: CreateReshootResponseSchema,
    successStatus: 201,
  },
  {
    id: "reportCsv",
    method: "GET",
    path: "/projects/{id}/report.csv",
    summary: "Download the report as CSV",
    contentType: "text/csv",
    successStatus: 200,
  },
  {
    id: "reportHtml",
    method: "GET",
    path: "/projects/{id}/report.html",
    summary: "Printable HTML report",
    contentType: "text/html",
    successStatus: 200,
  },
] as const satisfies readonly EndpointSpec[];

export type EndpointId = (typeof ENDPOINTS)[number]["id"];

// ---- inferred types ----

export type CreateProjectRequest = z.infer<typeof CreateProjectRequestSchema>;
export type UploadUrlRequest = z.infer<typeof UploadUrlRequestSchema>;
export type CreateScriptResponse = z.infer<typeof CreateScriptResponseSchema>;
export type StartAnalysisRequest = z.infer<typeof StartAnalysisRequestSchema>;
export type ReviewRequest = z.infer<typeof ReviewRequestSchema>;
export type CreateReshootRequest = z.infer<typeof CreateReshootRequestSchema>;
