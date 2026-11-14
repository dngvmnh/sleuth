import { z } from "zod";
import {
  CreateProjectResponseSchema,
  CreateReshootRequestSchema,
  CreateReshootResponseSchema,
  CreateScriptRequestSchema,
  CreateScriptResponseSchema,
  ErrorResponseSchema,
  GetCoverageResponseSchema,
  GetJobResponseSchema,
  GetProjectResponseSchema,
  ListEvidenceResponseSchema,
  ListFindingsResponseSchema,
  ListProjectsResponseSchema,
  PlaybackUrlResponseSchema,
  ListReshootsResponseSchema,
  ReviewResponseSchema,
  SealBlockerSchema,
  SealProjectRequestSchema,
  SealProjectResponseSchema,
  SetChecklistRequestSchema,
  SetChecklistResponseSchema,
  StartAnalysisRequestSchema,
  StartAnalysisResponseSchema,
  UpdateReshootRequestSchema,
  UpdateReshootResponseSchema,
  UploadUrlRequestSchema,
  UploadUrlResponseSchema,
  type CreateReshootRequest,
  type ReviewRequest,
  type SealBlocker,
  type SealProjectRequest,
  type StartAnalysisRequest,
  type UpdateReshootRequest,
} from "@sleuth/contracts";

/**
 * Typed client for /api/v1. Every response is parsed with the contract schema.
 * In fixture mode the server answers from the golden fixture, so this works with no setup.
 * Pass `user` to act as a fixture user, or "anonymous" to see the signed-out view.
 */
export class ApiClientError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    /** `error.details` from the server, unchecked. Read it through a schema (see `sealBlockersOf`). */
    public readonly details: unknown = undefined,
  ) {
    super(message);
    this.name = "ApiClientError";
  }
}

const SealBlockedDetailsSchema = z.object({ blockers: z.array(SealBlockerSchema).min(1) });

/**
 * The blockers from a `409 seal_blocked` error, checked against the contract.
 * Returns null for any other error, or when the details do not match the schema.
 */
export function sealBlockersOf(error: unknown): SealBlocker[] | null {
  if (!(error instanceof ApiClientError) || error.status !== 409 || error.code !== "seal_blocked") {
    return null;
  }
  const parsed = SealBlockedDetailsSchema.safeParse(error.details);
  return parsed.success ? parsed.data.blockers : null;
}

export interface ApiClientOptions {
  baseUrl?: string;
  /** Fixture mode only: sent as `x-fixture-user`. Never set it in Supabase mode, where the API ignores it. */
  user?: string;
  fetchImpl?: typeof fetch;
  /**
   * Awaited before every request. In Supabase mode it lets an existing guest session refresh
   * its cookie first (it never signs anyone in). Same-origin requests then carry that cookie.
   */
  beforeRequest?: () => Promise<void>;
}

export function createApiClient(options: ApiClientOptions = {}) {
  const base = `${options.baseUrl ?? ""}/api/v1`;
  const doFetch = options.fetchImpl ?? fetch;

  async function call<S extends z.ZodType>(
    schema: S,
    method: string,
    path: string,
    body?: unknown,
  ): Promise<z.infer<S>> {
    if (options.beforeRequest) await options.beforeRequest();
    const res = await doFetch(`${base}${path}`, {
      method,
      headers: {
        ...(body === undefined ? {} : { "content-type": "application/json" }),
        ...(options.user ? { "x-fixture-user": options.user } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const json: unknown = await res.json();
    if (!res.ok) {
      const parsed = ErrorResponseSchema.safeParse(json);
      throw new ApiClientError(
        res.status,
        parsed.success ? parsed.data.error.code : "unknown_error",
        parsed.success ? parsed.data.error.message : "Request failed.",
        parsed.success ? parsed.data.error.details : undefined,
      );
    }
    return schema.parse(json);
  }

  return {
    // ---- projects ----

    listProjects: () => call(ListProjectsResponseSchema, "GET", "/projects"),

    createProject: (name: string, copyFromDemo = false) =>
      call(CreateProjectResponseSchema, "POST", "/projects", { name, copyFromDemo }),

    getProject: (id: string) =>
      call(GetProjectResponseSchema, "GET", `/projects/${encodeURIComponent(id)}`),

    // ---- assets ----

    /**
     * Create a new asset version and obtain a short-lived signed upload URL.
     * Validates the request against UploadUrlRequestSchema before sending.
     */
    createUploadUrl: (
      projectId: string,
      params: z.infer<typeof UploadUrlRequestSchema>,
    ) =>
      call(
        UploadUrlResponseSchema,
        "POST",
        `/projects/${encodeURIComponent(projectId)}/assets/upload-url`,
        UploadUrlRequestSchema.parse(params),
      ),

    /**
     * A short-lived signed URL to play one asset version, or `{ url: null, expiresAt: null }` when
     * nothing plays (the demo, fixture mode, a file that never reached storage). Never store the URL:
     * ask again after `expiresAt`.
     */
    getPlaybackUrl: (projectId: string, assetVersionId: string) =>
      call(
        PlaybackUrlResponseSchema,
        "GET",
        `/projects/${encodeURIComponent(projectId)}/assets/${encodeURIComponent(assetVersionId)}/playback-url`,
      ),

    // ---- scripts ----

    /**
     * Save a new script version. Returns the diff and which evidence IDs went stale.
     */
    createScript: (
      projectId: string,
      params: z.infer<typeof CreateScriptRequestSchema>,
    ) =>
      call(
        CreateScriptResponseSchema,
        "POST",
        `/projects/${encodeURIComponent(projectId)}/scripts`,
        CreateScriptRequestSchema.parse(params),
      ),

    // ---- checklist ----

    /**
     * Replace the checklist for a project. Sends the full ordered list.
     */
    setChecklist: (
      projectId: string,
      params: z.infer<typeof SetChecklistRequestSchema>,
    ) =>
      call(
        SetChecklistResponseSchema,
        "POST",
        `/projects/${encodeURIComponent(projectId)}/checklist`,
        SetChecklistRequestSchema.parse(params),
      ),

    // ---- analysis ----

    /**
     * Queue an analysis job. Omit segmentIds to run a full analysis.
     */
    startAnalysis: (projectId: string, params: StartAnalysisRequest = {}) =>
      call(
        StartAnalysisResponseSchema,
        "POST",
        `/projects/${encodeURIComponent(projectId)}/analysis`,
        StartAnalysisRequestSchema.parse(params),
      ),

    /**
     * Poll a specific processing job by its ID.
     */
    getJob: (projectId: string, jobId: string) =>
      call(
        GetJobResponseSchema,
        "GET",
        `/projects/${encodeURIComponent(projectId)}/jobs/${encodeURIComponent(jobId)}`,
      ),

    // ---- evidence ----

    listEvidence: (id: string) =>
      call(ListEvidenceResponseSchema, "GET", `/projects/${encodeURIComponent(id)}/evidence`),

    listFindings: (id: string) =>
      call(ListFindingsResponseSchema, "GET", `/projects/${encodeURIComponent(id)}/findings`),

    /**
     * Record a human review decision (Exorcism) on one evidence candidate.
     * AI output is a candidate; only this call can move evidence to confirmed.
     */
    reviewEvidence: (evidenceId: string, review: ReviewRequest) =>
      call(
        ReviewResponseSchema,
        "PATCH",
        `/evidence/${encodeURIComponent(evidenceId)}/review`,
        review,
      ),

    // ---- reshoots ----

    /**
     * Create a reshoot task linked to a finding, segment or checklist item.
     */
    createReshoot: (projectId: string, params: CreateReshootRequest) =>
      call(
        CreateReshootResponseSchema,
        "POST",
        `/projects/${encodeURIComponent(projectId)}/reshoots`,
        CreateReshootRequestSchema.parse(params),
      ),

    /** All reshoot tasks of a project, open and done. */
    listReshoots: (projectId: string) =>
      call(ListReshootsResponseSchema, "GET", `/projects/${encodeURIComponent(projectId)}/reshoots`),

    /** Mark a reshoot task done, or open it again. */
    updateReshoot: (reshootId: string, params: UpdateReshootRequest) =>
      call(
        UpdateReshootResponseSchema,
        "PATCH",
        `/reshoots/${encodeURIComponent(reshootId)}`,
        UpdateReshootRequestSchema.parse(params),
      ),

    // ---- final seal ----

    /** Coverage summary, the latest seal (or null) and the current seal blockers. */
    getCoverage: (projectId: string) =>
      call(GetCoverageResponseSchema, "GET", `/projects/${encodeURIComponent(projectId)}/coverage`),

    /**
     * Apply the Final Seal. A human sign-off: only call it from a person's explicit action.
     * A refusal throws `ApiClientError` 409 `seal_blocked`; read its blockers with `sealBlockersOf`.
     */
    sealProject: (projectId: string, params: SealProjectRequest = {}) =>
      call(
        SealProjectResponseSchema,
        "POST",
        `/projects/${encodeURIComponent(projectId)}/seal`,
        SealProjectRequestSchema.parse(params),
      ),
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;
