import type { EvidenceCandidate, Finding, Project } from "@sleuth/contracts";
import { createApiClient } from "@/lib/api-client";
import type { ProjectDetail } from "./use-project";

/** Small hand-made data for component and hook tests. The real demo data is covered by e2e. */

/**
 * A stand-in segment hash: 64 hex chars, different for each segment id. `deriveSegmentStates`
 * treats evidence whose `segmentHash` differs from its segment's hash as stale, so valid
 * evidence must carry `hashOf(its segment id)`. A test that wants stale-by-hash passes another value.
 */
export function hashOf(segmentId: string): string {
  const hex = [...segmentId].map((c) => c.charCodeAt(0).toString(16).padStart(2, "0")).join("");
  return hex.padEnd(64, "0").slice(0, 64);
}

export const project: Project = {
  id: "p1",
  name: "Test project",
  ownerId: null,
  isDemo: true,
  currentScriptVersionId: "sv1",
  currentAssetVersionId: "av1",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

export const detail: ProjectDetail = {
  project,
  assetVersion: {
    id: "av1",
    projectId: "p1",
    version: 1,
    storagePath: "placeholder/none.mp4",
    mimeType: "video/mp4",
    durationMs: 20_000,
    createdAt: "2026-01-01T00:00:00.000Z",
  },
  scriptVersion: {
    id: "sv1",
    projectId: "p1",
    version: 1,
    text: "Hello there. Click Export.",
    segments: [
      { id: "s2", scriptVersionId: "sv1", index: 1, text: "Click Export.", hash: hashOf("s2") },
      { id: "s1", scriptVersionId: "sv1", index: 0, text: "Hello there.", hash: hashOf("s1") },
    ],
    createdAt: "2026-01-01T00:00:00.000Z",
  },
  checklist: [],
};

export function evidence(
  id: string,
  status: EvidenceCandidate["status"] = "candidate",
  overrides: Partial<EvidenceCandidate> = {},
): EvidenceCandidate {
  const scriptSegmentId = overrides.scriptSegmentId ?? "s1";
  return {
    id,
    projectId: "p1",
    checklistItemId: null,
    scriptSegmentId,
    scriptVersionId: "sv1",
    // Matches the segment, so the evidence is valid unless a test overrides it.
    segmentHash: hashOf(scriptSegmentId),
    assetVersionId: "av1",
    startMs: 1000,
    endMs: 4000,
    transcriptSegmentIds: [],
    frameObservationIds: [],
    explanation: "A candidate match.",
    confidence: "medium",
    status,
    source: "ai",
    analysisRunId: "run1",
    ...overrides,
  };
}

export function finding(
  id: string,
  type: Finding["type"],
  status: Finding["status"] = "open",
  overrides: Partial<Finding> = {},
): Finding {
  return {
    id,
    projectId: "p1",
    type,
    plainLabel: "label",
    checklistItemId: null,
    scriptSegmentId: null,
    evidenceId: null,
    found: "found",
    notFound: "not found",
    limits: "limits",
    status,
    analysisRunId: "run1",
    ...overrides,
  };
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

export interface Routes {
  project?: () => Response | Promise<Response>;
  evidence?: () => Response | Promise<Response>;
  findings?: () => Response | Promise<Response>;
  review?: (init?: RequestInit) => Response | Promise<Response>;
}

/** A client whose fetch is answered by `routes`. Unlisted routes answer 500. */
export function clientFor(routes: Routes) {
  const calls: { url: string; method: string }[] = [];
  const fetchImpl = async (url: unknown, init?: RequestInit): Promise<Response> => {
    const u = String(url);
    const method = init?.method ?? "GET";
    calls.push({ url: u, method });
    if (u.includes("/review")) return (routes.review ?? (() => json({}, 500)))(init);
    if (u.endsWith("/evidence")) return (routes.evidence ?? (() => json({}, 500)))();
    if (u.endsWith("/findings")) return (routes.findings ?? (() => json({}, 500)))();
    return (routes.project ?? (() => json({}, 500)))();
  };
  return { client: createApiClient({ fetchImpl: fetchImpl as unknown as typeof fetch }), calls };
}

export function okRoutes(overrides: Routes = {}): Routes {
  return {
    project: () => json(detail),
    evidence: () => json({ evidence: [evidence("e1"), evidence("e2")] }),
    findings: () =>
      json({ findings: [finding("f1", "ghost"), finding("f2", "cursed_frame", "resolved")] }),
    ...overrides,
  };
}

export const notFoundBody = { error: { code: "not_found", message: "No such project." } };
