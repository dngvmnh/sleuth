import { z } from "zod";
import {
  ENDPOINTS,
  type EndpointId,
  type EndpointSpec,
  type ErrorResponse,
} from "@sleuth/contracts";
import { StoreError, type Actor, type ProjectStore } from "@sleuth/db/fixture";
import { getStore, resolveActor } from "./data-source";

export class ApiError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: 400 | 401 | 403 | 404 | 409 | 500 | 501,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
  }
}

type Spec<K extends EndpointId> = Extract<(typeof ENDPOINTS)[number], { id: K }>;
type BodyOf<K extends EndpointId> =
  Spec<K> extends { request: infer S extends z.ZodType } ? z.infer<S> : undefined;
type OutOf<K extends EndpointId> =
  Spec<K> extends { response: infer S extends z.ZodType }
    ? z.input<S>
    : Spec<K> extends { contentType: string }
      ? string
      : never;

export interface Ctx<K extends EndpointId> {
  req: Request;
  params: Record<string, string>;
  actor: Actor;
  store: ProjectStore;
  body: BodyOf<K>;
}

function errorBody(code: string, message: string, details?: unknown): ErrorResponse {
  return { error: { code, message, ...(details === undefined ? {} : { details }) } };
}

export function errorResponse(
  status: number,
  code: string,
  message: string,
  details?: unknown,
): Response {
  return Response.json(errorBody(code, message, details), { status });
}

function toErrorResponse(err: unknown): Response {
  if (err instanceof ApiError || err instanceof StoreError) {
    return errorResponse(err.status, err.code, err.message, err.details);
  }
  // Never echo internals. Log the error name only, never request content.
  console.error("api_error", err instanceof Error ? err.name : "unknown");
  return errorResponse(500, "internal_error", "Something went wrong on our side.");
}

async function readJson(req: Request): Promise<unknown> {
  const text = await req.text();
  if (text.trim() === "") return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new ApiError("invalid_json", 400, "Request body is not valid JSON.");
  }
}

/**
 * Wraps a route: resolves the caller, validates the request body and the response with the
 * contract schema for `id`, and turns every failure into `{ error: { code, message, details? } }`.
 */
export function endpoint<K extends EndpointId>(id: K, run: (ctx: Ctx<K>) => Promise<OutOf<K>>) {
  const spec: EndpointSpec = ENDPOINTS.find((e) => e.id === id) as EndpointSpec;
  return async (
    req: Request,
    routeCtx: { params: Promise<Record<string, string>> },
  ): Promise<Response> => {
    try {
      const params = await routeCtx.params;
      const actor = resolveActor(req);
      const store = getStore();
      let body: unknown;
      if (spec.request) {
        const parsed = spec.request.safeParse(await readJson(req));
        if (!parsed.success) {
          throw new ApiError(
            "invalid_request",
            400,
            "The request body is not valid.",
            z.flattenError(parsed.error),
          );
        }
        body = parsed.data;
      }
      const result = await run({ req, params, actor, store, body: body as BodyOf<K> });
      if (spec.contentType) {
        const headers: Record<string, string> = {
          "content-type": `${spec.contentType}; charset=utf-8`,
        };
        if (spec.contentType === "text/csv") {
          headers["content-disposition"] = 'attachment; filename="sleuth-report.csv"';
        }
        return new Response(result as string, { status: 200, headers });
      }
      return Response.json(spec.response?.parse(result), { status: spec.successStatus });
    } catch (err) {
      return toErrorResponse(err);
    }
  };
}
