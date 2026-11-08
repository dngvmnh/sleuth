import { z } from "zod";
import {
  CreateProjectResponseSchema,
  ErrorResponseSchema,
  GetProjectResponseSchema,
  ListEvidenceResponseSchema,
  ListFindingsResponseSchema,
  ListProjectsResponseSchema,
  ReviewResponseSchema,
  type ReviewRequest,
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
  ) {
    super(message);
  }
}

export interface ApiClientOptions {
  baseUrl?: string;
  user?: string;
  fetchImpl?: typeof fetch;
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
      );
    }
    return schema.parse(json);
  }

  return {
    listProjects: () => call(ListProjectsResponseSchema, "GET", "/projects"),
    createProject: (name: string, copyFromDemo = false) =>
      call(CreateProjectResponseSchema, "POST", "/projects", { name, copyFromDemo }),
    getProject: (id: string) =>
      call(GetProjectResponseSchema, "GET", `/projects/${encodeURIComponent(id)}`),
    listEvidence: (id: string) =>
      call(ListEvidenceResponseSchema, "GET", `/projects/${encodeURIComponent(id)}/evidence`),
    listFindings: (id: string) =>
      call(ListFindingsResponseSchema, "GET", `/projects/${encodeURIComponent(id)}/findings`),
    reviewEvidence: (evidenceId: string, review: ReviewRequest) =>
      call(
        ReviewResponseSchema,
        "PATCH",
        `/evidence/${encodeURIComponent(evidenceId)}/review`,
        review,
      ),
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;
