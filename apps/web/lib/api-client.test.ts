/**
 * Unit tests for the typed API client.
 * Uses a fake fetch implementation — no server required.
 * Covers request construction, response parsing and error handling
 * for every method, including the six added in task 2.
 */
import { describe, expect, it, vi } from "vitest";
import type {
  AssetVersion,
  ChecklistItem,
  CoverageSummary,
  EvidenceCandidate,
  Finding,
  ProcessingJob,
  Project,
  ReshootTask,
  ReviewDecision,
  ScriptVersion,
  Seal,
} from "@sleuth/contracts";
import { ApiClientError, createApiClient, sealBlockersOf } from "./api-client";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function ok(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function err(status: number, code: string, message = "Something went wrong"): Response {
  return new Response(JSON.stringify({ error: { code, message } }), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const NOW = new Date().toISOString();
const HASH = "a".repeat(64); // 64 hex chars

// Minimal valid fixtures built to match every required field in entities.ts

const PROJECT: Project = {
  id: "proofpay-demo",
  name: "ProofPay Demo",
  ownerId: null,
  isDemo: true,
  currentScriptVersionId: "sv-1",
  currentAssetVersionId: "av-1",
  createdAt: NOW,
  updatedAt: NOW,
};

const ASSET_VERSION: AssetVersion = {
  id: "av-1",
  projectId: "proj-1",
  version: 1,
  storagePath: "path/to/demo.mp4",
  mimeType: "video/mp4",
  durationMs: 60000,
  createdAt: NOW,
};

const SCRIPT_VERSION: ScriptVersion = {
  id: "sv-1",
  projectId: "proj-1",
  version: 1,
  text: "Hello world.",
  segments: [],
  createdAt: NOW,
};

const JOB: ProcessingJob = {
  id: "job-1",
  projectId: "proj-1",
  kind: "analysis",
  status: "queued",
  attempts: 0,
  maxAttempts: 3,
  lockedBy: null,
  heartbeatAt: null,
  error: null,
  payload: { assetVersionId: "av-1", scriptVersionId: "sv-1" },
  createdAt: NOW,
  updatedAt: NOW,
};

const EVIDENCE: EvidenceCandidate = {
  id: "ev-1",
  projectId: "proj-1",
  checklistItemId: null,
  scriptSegmentId: "seg-1",
  scriptVersionId: "sv-1",
  segmentHash: HASH,
  assetVersionId: "av-1",
  startMs: 1000,
  endMs: 5000,
  transcriptSegmentIds: ["ts-1"],
  frameObservationIds: ["fo-1"],
  explanation: "Payment button visible in frame.",
  confidence: "medium",
  status: "candidate",
  source: "ai",
  analysisRunId: "run-1",
};

const FINDING: Finding = {
  id: "fi-1",
  projectId: "proj-1",
  type: "cursed_frame",
  plainLabel: "Needs human check",
  checklistItemId: null,
  scriptSegmentId: "seg-1",
  evidenceId: "ev-1",
  found: "Payment button is visible.",
  notFound: "Confirmation screen not seen.",
  limits: "Visual check only; payment flow not verified.",
  status: "open",
  analysisRunId: "run-1",
};

const CHECKLIST_ITEM: ChecklistItem = {
  id: "ci-1",
  projectId: "proj-1",
  label: "Payment button visible",
  position: 0,
};

const REVIEW_DECISION: ReviewDecision = {
  id: "rd-1",
  evidenceId: "ev-1",
  decision: "confirm",
  reviewerId: "user-1",
  note: null,
  createdAt: NOW,
};

const RESHOOT: ReshootTask = {
  id: "rs-1",
  projectId: "proj-1",
  checklistItemId: null,
  scriptSegmentId: "seg-1",
  findingId: "fi-1",
  note: "Re-record the payment step.",
  status: "open",
  createdAt: NOW,
};

// ---------------------------------------------------------------------------
// Pre-existing methods
// ---------------------------------------------------------------------------

describe("listProjects", () => {
  it("sends GET /api/v1/projects and parses the response", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(ok({ projects: [PROJECT] }));
    const client = createApiClient({ fetchImpl });
    const result = await client.listProjects();
    expect(fetchImpl).toHaveBeenCalledWith(
      "/api/v1/projects",
      expect.objectContaining({ method: "GET" }),
    );
    expect(result.projects[0]?.id).toBe("proofpay-demo");
  });
});

describe("createProject", () => {
  it("sends POST /api/v1/projects with name and copyFromDemo", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(ok({ project: PROJECT }, 201));
    const client = createApiClient({ fetchImpl });
    await client.createProject("My Project", true);
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/v1/projects");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toMatchObject({
      name: "My Project",
      copyFromDemo: true,
    });
  });

  it("defaults copyFromDemo to false", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(ok({ project: PROJECT }, 201));
    const client = createApiClient({ fetchImpl });
    await client.createProject("Bare");
    const [, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toMatchObject({ copyFromDemo: false });
  });
});

describe("getProject", () => {
  it("sends GET /api/v1/projects/{id}", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(
        ok({ project: PROJECT, assetVersion: null, scriptVersion: null, checklist: [] }),
      );
    const client = createApiClient({ fetchImpl });
    const result = await client.getProject("proofpay-demo");
    expect(fetchImpl.mock.calls[0]?.[0]).toBe("/api/v1/projects/proofpay-demo");
    expect(result.project.id).toBe("proofpay-demo");
  });

  it("percent-encodes the project id", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(
        ok({ project: PROJECT, assetVersion: null, scriptVersion: null, checklist: [] }),
      );
    const client = createApiClient({ fetchImpl });
    await client.getProject("a b/c");
    expect(fetchImpl.mock.calls[0]?.[0]).toBe("/api/v1/projects/a%20b%2Fc");
  });
});

describe("listEvidence", () => {
  it("sends GET /api/v1/projects/{id}/evidence", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(ok({ evidence: [EVIDENCE] }));
    const client = createApiClient({ fetchImpl });
    const result = await client.listEvidence("proj-1");
    expect(fetchImpl.mock.calls[0]?.[0]).toBe("/api/v1/projects/proj-1/evidence");
    expect(result.evidence[0]?.id).toBe("ev-1");
  });
});

describe("listFindings", () => {
  it("sends GET /api/v1/projects/{id}/findings", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(ok({ findings: [FINDING] }));
    const client = createApiClient({ fetchImpl });
    const result = await client.listFindings("proj-1");
    expect(fetchImpl.mock.calls[0]?.[0]).toBe("/api/v1/projects/proj-1/findings");
    expect(result.findings[0]?.id).toBe("fi-1");
  });
});

describe("reviewEvidence", () => {
  it("sends PATCH /api/v1/evidence/{id}/review with the decision", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(ok({ evidence: EVIDENCE, decision: REVIEW_DECISION }));
    const client = createApiClient({ fetchImpl });
    const result = await client.reviewEvidence("ev-1", { decision: "confirm" });
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/v1/evidence/ev-1/review");
    expect(init.method).toBe("PATCH");
    expect(JSON.parse(init.body as string)).toMatchObject({ decision: "confirm" });
    expect(result.evidence.id).toBe("ev-1");
    expect(result.decision.decision).toBe("confirm");
  });
});

// ---------------------------------------------------------------------------
// Task 2: new methods
// ---------------------------------------------------------------------------

describe("createUploadUrl", () => {
  it("sends POST /api/v1/projects/{id}/assets/upload-url", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      ok(
        {
          assetVersion: ASSET_VERSION,
          uploadUrl: "https://storage.example.com/upload",
          expiresAt: new Date(Date.now() + 300_000).toISOString(),
        },
        201,
      ),
    );
    const client = createApiClient({ fetchImpl });
    const result = await client.createUploadUrl("proj-1", {
      fileName: "demo.mp4",
      mimeType: "video/mp4",
      sizeBytes: 1000,
      durationMs: 60000,
    });
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/v1/projects/proj-1/assets/upload-url");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toMatchObject({ fileName: "demo.mp4" });
    expect(result.assetVersion.id).toBe("av-1");
    expect(result.uploadUrl).toBeTruthy();
  });

  it("rejects a mimeType that is not video/* before sending", async () => {
    const fetchImpl = vi.fn();
    const client = createApiClient({ fetchImpl });
    let threw = false;
    try {
      await client.createUploadUrl("proj-1", {
        fileName: "file.pdf",
        mimeType: "application/pdf" as "video/mp4",
        sizeBytes: 1000,
        durationMs: 30000,
      });
    } catch {
      threw = true;
    }
    expect(threw).toBe(true);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("rejects durationMs above the 180-second limit before sending", async () => {
    const fetchImpl = vi.fn();
    const client = createApiClient({ fetchImpl });
    let threw = false;
    try {
      await client.createUploadUrl("proj-1", {
        fileName: "long.mp4",
        mimeType: "video/mp4",
        sizeBytes: 1000,
        durationMs: 181_000,
      });
    } catch {
      threw = true;
    }
    expect(threw).toBe(true);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe("createScript", () => {
  it("sends POST /api/v1/projects/{id}/scripts with the text", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      ok(
        {
          scriptVersion: SCRIPT_VERSION,
          diff: { added: [], modified: [], removed: [], unchanged: ["seg-1"] },
          staleEvidenceIds: [],
        },
        201,
      ),
    );
    const client = createApiClient({ fetchImpl });
    const result = await client.createScript("proj-1", { text: "Hello world." });
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/v1/projects/proj-1/scripts");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toMatchObject({ text: "Hello world." });
    expect(result.scriptVersion.id).toBe("sv-1");
    expect(result.diff.unchanged).toContain("seg-1");
  });

  it("rejects an empty text before sending", async () => {
    const fetchImpl = vi.fn();
    const client = createApiClient({ fetchImpl });
    let threw = false;
    try {
      await client.createScript("proj-1", { text: "" });
    } catch {
      threw = true;
    }
    expect(threw).toBe(true);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe("setChecklist", () => {
  it("sends POST /api/v1/projects/{id}/checklist with items", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(ok({ items: [CHECKLIST_ITEM] }, 201));
    const client = createApiClient({ fetchImpl });
    const result = await client.setChecklist("proj-1", {
      items: [{ label: "Payment button visible" }],
    });
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/v1/projects/proj-1/checklist");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toMatchObject({
      items: [{ label: "Payment button visible" }],
    });
    expect(result.items[0]?.id).toBe("ci-1");
  });

  it("rejects an empty items array before sending", async () => {
    const fetchImpl = vi.fn();
    const client = createApiClient({ fetchImpl });
    let threw = false;
    try {
      await client.setChecklist("proj-1", { items: [] });
    } catch {
      threw = true;
    }
    expect(threw).toBe(true);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe("startAnalysis", () => {
  it("sends POST /api/v1/projects/{id}/analysis", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(ok({ job: JOB }, 202));
    const client = createApiClient({ fetchImpl });
    const result = await client.startAnalysis("proj-1");
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/v1/projects/proj-1/analysis");
    expect(init.method).toBe("POST");
    expect(result.job.id).toBe("job-1");
    expect(result.job.kind).toBe("analysis");
  });

  it("passes segmentIds when provided", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(ok({ job: JOB }, 202));
    const client = createApiClient({ fetchImpl });
    await client.startAnalysis("proj-1", { segmentIds: ["seg-1", "seg-2"] });
    const [, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toMatchObject({ segmentIds: ["seg-1", "seg-2"] });
  });
});

describe("getJob", () => {
  it("sends GET /api/v1/projects/{id}/jobs/{jobId}", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(ok({ job: JOB }));
    const client = createApiClient({ fetchImpl });
    const result = await client.getJob("proj-1", "job-1");
    expect(fetchImpl.mock.calls[0]?.[0]).toBe("/api/v1/projects/proj-1/jobs/job-1");
    expect((fetchImpl.mock.calls[0] as [string, RequestInit])[1].method).toBe("GET");
    expect(result.job.id).toBe("job-1");
  });

  it("percent-encodes both ids", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(ok({ job: JOB }));
    const client = createApiClient({ fetchImpl });
    await client.getJob("proj 1", "job/1");
    expect(fetchImpl.mock.calls[0]?.[0]).toBe("/api/v1/projects/proj%201/jobs/job%2F1");
  });
});

describe("createReshoot", () => {
  it("sends POST /api/v1/projects/{id}/reshoots", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(ok({ reshoot: RESHOOT }, 201));
    const client = createApiClient({ fetchImpl });
    const result = await client.createReshoot("proj-1", {
      note: "Re-record the payment step.",
      findingId: "fi-1",
    });
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/v1/projects/proj-1/reshoots");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toMatchObject({ note: "Re-record the payment step." });
    expect(result.reshoot.id).toBe("rs-1");
  });

  it("rejects an empty note before sending", async () => {
    const fetchImpl = vi.fn();
    const client = createApiClient({ fetchImpl });
    let threw = false;
    try {
      await client.createReshoot("proj-1", { note: "" });
    } catch {
      threw = true;
    }
    expect(threw).toBe(true);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Error handling (applies to all methods via the shared call helper)
// ---------------------------------------------------------------------------

describe("error handling", () => {
  it("throws ApiClientError with code and message on a 4xx response", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(err(403, "demo_read_only", "Demo is read-only."));
    const client = createApiClient({ fetchImpl });
    const caught = await client.listProjects().catch((e: unknown) => e);
    expect(caught).toBeInstanceOf(ApiClientError);
    const e = caught as ApiClientError;
    expect(e.status).toBe(403);
    expect(e.code).toBe("demo_read_only");
    expect(e.message).toBe("Demo is read-only.");
  });

  it("uses unknown_error when the error body is not the contract shape", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ surprise: true }), { status: 500 }));
    const client = createApiClient({ fetchImpl });
    const caught = await client.listProjects().catch((e: unknown) => e);
    expect(caught).toBeInstanceOf(ApiClientError);
    expect((caught as ApiClientError).code).toBe("unknown_error");
  });

  it("forwards the x-fixture-user header when user is set", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(ok({ projects: [] }));
    const client = createApiClient({ fetchImpl, user: "alice" });
    await client.listProjects();
    const headers = (fetchImpl.mock.calls[0] as [string, RequestInit])[1].headers as Record<
      string,
      string
    >;
    expect(headers["x-fixture-user"]).toBe("alice");
  });

  it("does not send the fixture-user header when user is not set", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(ok({ projects: [] }));
    const client = createApiClient({ fetchImpl });
    await client.listProjects();
    const headers = (fetchImpl.mock.calls[0] as [string, RequestInit])[1].headers as Record<
      string,
      string
    >;
    expect(headers["x-fixture-user"]).toBeUndefined();
  });

  it("respects a custom baseUrl", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(ok({ projects: [] }));
    const client = createApiClient({ fetchImpl, baseUrl: "https://app.example.com" });
    await client.listProjects();
    expect(fetchImpl.mock.calls[0]?.[0]).toBe("https://app.example.com/api/v1/projects");
  });
});

// ---------------------------------------------------------------------------
// Final Seal task 6: reshoots, coverage and seal
// ---------------------------------------------------------------------------

const COVERAGE: CoverageSummary = {
  items: [
    { checklistItemId: "ci-1", state: "proven", evidenceIds: ["ev-1"] },
    { checklistItemId: "ci-2", state: "needs_review", evidenceIds: ["ev-2"] },
  ],
  totals: { proven: 1, needs_review: 1, outside_proof: 0, reshoot: 0, uncovered: 0 },
  provenPercent: 50,
  outsideProof: [],
  openReshootIds: ["rs-1"],
};

const SEAL: Seal = {
  id: "seal-1",
  projectId: "proj-1",
  sealedBy: "user-1",
  sealedAt: NOW,
  scriptVersionId: "sv-1",
  assetVersionId: "av-1",
  coverage: COVERAGE,
  note: "Checked by hand.",
  status: "active",
  brokenAt: null,
  brokenReason: null,
};

function errWithDetails(status: number, code: string, message: string, details: unknown): Response {
  return new Response(JSON.stringify({ error: { code, message, details } }), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("listReshoots", () => {
  it("sends GET /api/v1/projects/{id}/reshoots and parses the list", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(ok({ reshoots: [RESHOOT] }));
    const client = createApiClient({ fetchImpl });
    const result = await client.listReshoots("proj 1");
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/v1/projects/proj%201/reshoots");
    expect(init.method).toBe("GET");
    expect(result.reshoots.map((r) => r.id)).toEqual(["rs-1"]);
  });

  it("rejects a reshoot that does not match the contract", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(ok({ reshoots: [{ ...RESHOOT, status: "maybe" }] }));
    const client = createApiClient({ fetchImpl });
    const caught = await client.listReshoots("proj-1").catch((e: unknown) => e);
    expect(caught).not.toBeInstanceOf(ApiClientError);
    expect(caught).toBeInstanceOf(Error);
  });
});

describe("updateReshoot", () => {
  it("sends PATCH /api/v1/reshoots/{id} with the new status", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(ok({ reshoot: { ...RESHOOT, status: "done" } }));
    const client = createApiClient({ fetchImpl });
    const result = await client.updateReshoot("rs-1", { status: "done" });
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/v1/reshoots/rs-1");
    expect(init.method).toBe("PATCH");
    expect(JSON.parse(init.body as string)).toEqual({ status: "done" });
    expect(result.reshoot.status).toBe("done");
  });

  it("rejects a status outside the contract before sending", async () => {
    const fetchImpl = vi.fn();
    const client = createApiClient({ fetchImpl });
    let threw = false;
    try {
      await client.updateReshoot("rs-1", { status: "closed" as "done" });
    } catch {
      threw = true;
    }
    expect(threw).toBe(true);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe("getCoverage", () => {
  it("sends GET /api/v1/projects/{id}/coverage and parses coverage, seal and blockers", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(
        ok({ coverage: COVERAGE, seal: null, blockers: ["undecided_candidates"] }),
      );
    const client = createApiClient({ fetchImpl });
    const result = await client.getCoverage("proj-1");
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/v1/projects/proj-1/coverage");
    expect(init.method).toBe("GET");
    expect(result.coverage.provenPercent).toBe(50);
    expect(result.seal).toBeNull();
    expect(result.blockers).toEqual(["undecided_candidates"]);
  });

  it("parses an existing seal", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(ok({ coverage: COVERAGE, seal: SEAL, blockers: [] }));
    const client = createApiClient({ fetchImpl });
    const result = await client.getCoverage("proj-1");
    expect(result.seal?.status).toBe("active");
    expect(result.blockers).toEqual([]);
  });

  it("rejects an unknown blocker value", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(ok({ coverage: COVERAGE, seal: null, blockers: ["made_up"] }));
    const client = createApiClient({ fetchImpl });
    const caught = await client.getCoverage("proj-1").catch((e: unknown) => e);
    expect(caught).toBeInstanceOf(Error);
    expect(caught).not.toBeInstanceOf(ApiClientError);
  });
});

describe("sealProject", () => {
  it("sends POST /api/v1/projects/{id}/seal with the note and parses the seal", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(ok({ seal: SEAL }, 201));
    const client = createApiClient({ fetchImpl });
    const result = await client.sealProject("proj-1", { note: "  Checked by hand.  " });
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/v1/projects/proj-1/seal");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({ note: "Checked by hand." });
    expect(result.seal.id).toBe("seal-1");
  });

  it("sends an empty body when no note is given", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(ok({ seal: SEAL }, 201));
    const client = createApiClient({ fetchImpl });
    await client.sealProject("proj-1");
    const [, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual({});
  });

  it("throws seal_blocked with the blockers kept in details, and sealBlockersOf reads them", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      errWithDetails(409, "seal_blocked", "The project cannot be sealed yet.", {
        blockers: ["undecided_candidates", "uncovered_items"],
      }),
    );
    const client = createApiClient({ fetchImpl });
    const caught = await client.sealProject("proj-1").catch((e: unknown) => e);
    expect(caught).toBeInstanceOf(ApiClientError);
    const e = caught as ApiClientError;
    expect(e.status).toBe(409);
    expect(e.code).toBe("seal_blocked");
    expect(e.message).toBe("The project cannot be sealed yet.");
    expect(e.details).toEqual({ blockers: ["undecided_candidates", "uncovered_items"] });
    expect(sealBlockersOf(e)).toEqual(["undecided_candidates", "uncovered_items"]);
  });

  it("gives no blockers when seal_blocked details do not match the contract", async () => {
    for (const details of [undefined, {}, { blockers: [] }, { blockers: ["made_up"] }, "nope"]) {
      const fetchImpl = vi
        .fn()
        .mockResolvedValue(
          errWithDetails(409, "seal_blocked", "The project cannot be sealed yet.", details),
        );
      const client = createApiClient({ fetchImpl });
      const caught = await client.sealProject("proj-1").catch((e: unknown) => e);
      expect(caught).toBeInstanceOf(ApiClientError);
      expect(sealBlockersOf(caught)).toBeNull();
    }
  });

  it("gives no blockers for other errors, even with a blockers field", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(
        errWithDetails(403, "demo_read_only", "Demo is read-only.", { blockers: ["no_analysis"] }),
      );
    const client = createApiClient({ fetchImpl });
    const caught = await client.sealProject("proj-1").catch((e: unknown) => e);
    expect(sealBlockersOf(caught)).toBeNull();
    expect(sealBlockersOf(new Error("plain"))).toBeNull();
  });
});

describe("ApiClientError details", () => {
  it("is undefined when the server sends none, and status, code and message are unchanged", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(err(404, "not_found", "No such project."));
    const client = createApiClient({ fetchImpl });
    const caught = (await client.getProject("x").catch((e: unknown) => e)) as ApiClientError;
    expect(caught.status).toBe(404);
    expect(caught.code).toBe("not_found");
    expect(caught.message).toBe("No such project.");
    expect(caught.details).toBeUndefined();
    expect(caught.name).toBe("ApiClientError");
  });
});
