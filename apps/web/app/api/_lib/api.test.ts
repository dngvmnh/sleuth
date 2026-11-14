import { describe, expect, it, vi } from "vitest";
import {
  ErrorResponseSchema,
  ListEvidenceResponseSchema,
  ListProjectsResponseSchema,
} from "@sleuth/contracts";
import { GET as listProjects, POST as createProject } from "../v1/projects/route";
import { GET as listEvidence } from "../v1/projects/[id]/evidence/route";
import { GET as reportCsv } from "../v1/projects/[id]/report.csv/route";
import { GET as reportHtml } from "../v1/projects/[id]/report.html/route";
import { PATCH as review } from "../v1/evidence/[id]/review/route";
import { POST as createScript } from "../v1/projects/[id]/scripts/route";
import { POST as createUploadUrl } from "../v1/projects/[id]/assets/upload-url/route";
import { POST as startAnalysis } from "../v1/projects/[id]/analysis/route";
import { GET as playbackUrl } from "../v1/projects/[id]/assets/[assetVersionId]/playback-url/route";
import { buildCsv, buildHtml, htmlEscape } from "./report";
import { createFixtureStore } from "@sleuth/db/fixture";

const ctx = (params: Record<string, string> = {}) => ({ params: Promise.resolve(params) });
const json = (method: string, body: unknown, user?: string) =>
  new Request("http://localhost/x", {
    method,
    body: JSON.stringify(body),
    headers: { "content-type": "application/json", ...(user ? { "x-fixture-user": user } : {}) },
  });

describe("API routes in fixture mode", () => {
  it("lists the public demo project for a signed-out visitor", async () => {
    const res = await listProjects(
      new Request("http://localhost/x", { headers: { "x-fixture-user": "anonymous" } }),
      ctx(),
    );
    expect(res.status).toBe(200);
    const body = ListProjectsResponseSchema.parse(await res.json());
    expect(body.projects.map((p) => p.id)).toContain("proofpay-demo");
  });

  it("gives no playback URL to a non-owner, and url null to the owner in fixture mode", async () => {
    const owner = "playback-owner";
    const created = await createProject(json("POST", { name: "Playback" }, owner), ctx());
    const id = ((await created.json()) as { project: { id: string } }).project.id;
    const upload = await createUploadUrl(
      json(
        "POST",
        { fileName: "a.mp4", mimeType: "video/mp4", sizeBytes: 1000, durationMs: 5000 },
        owner,
      ),
      ctx({ id }),
    );
    const assetVersionId = ((await upload.json()) as { assetVersion: { id: string } }).assetVersion
      .id;
    const get = (user: string) =>
      playbackUrl(
        new Request("http://localhost/x", { headers: { "x-fixture-user": user } }),
        ctx({ id, assetVersionId }),
      );

    for (const who of ["someone-else", "anonymous"]) {
      const res = await get(who);
      expect(res.status).toBe(404);
      const text = await res.text();
      expect(text).not.toContain('url":"');
      expect(ErrorResponseSchema.parse(JSON.parse(text)).error.code).toBe("not_found");
    }
    const mine = await get(owner);
    expect(mine.status).toBe(200);
    expect(await mine.json()).toEqual({ url: null, expiresAt: null });
  });

  it("answers url null for the demo video", async () => {
    const res = await playbackUrl(
      new Request("http://localhost/x", { headers: { "x-fixture-user": "anonymous" } }),
      // The demo's video version id in fixtures/golden/proofpay-demo/asset-version.json.
      ctx({ id: "proofpay-demo", assetVersionId: "av-1" }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ url: null, expiresAt: null });
  });

  it("returns the expected evidence for the demo", async () => {
    const res = await listEvidence(new Request("http://localhost/x"), ctx({ id: "proofpay-demo" }));
    expect(ListEvidenceResponseSchema.parse(await res.json()).evidence).toHaveLength(4);
  });

  it("answers an unknown project with the standard error shape", async () => {
    const res = await listEvidence(new Request("http://localhost/x"), ctx({ id: "nope" }));
    expect(res.status).toBe(404);
    expect(ErrorResponseSchema.parse(await res.json()).error.code).toBe("not_found");
  });

  it("rejects an invalid body with details", async () => {
    const res = await createProject(json("POST", { name: "" }), ctx());
    expect(res.status).toBe(400);
    const body = ErrorResponseSchema.parse(await res.json());
    expect(body.error.code).toBe("invalid_request");
    expect(body.error.details).toBeDefined();
  });

  it("rejects malformed JSON", async () => {
    const res = await createProject(
      new Request("http://localhost/x", { method: "POST", body: "{nope" }),
      ctx(),
    );
    expect(res.status).toBe(400);
    expect(ErrorResponseSchema.parse(await res.json()).error.code).toBe("invalid_json");
  });

  it("refuses writes to the demo project", async () => {
    const res = await createScript(
      json("POST", { text: "Hello there." }),
      ctx({ id: "proofpay-demo" }),
    );
    expect(res.status).toBe(403);
    expect(ErrorResponseSchema.parse(await res.json()).error.code).toBe("demo_read_only");
  });

  it("lets a signed-in user create a project, edit the script and review evidence", async () => {
    const created = await createProject(
      json("POST", { name: "Mine", copyFromDemo: true }, "route-test-user"),
      ctx(),
    );
    expect(created.status).toBe(201);
    const id = ((await created.json()) as { project: { id: string } }).project.id;
    const evidence = ListEvidenceResponseSchema.parse(
      await (
        await listEvidence(
          new Request("http://localhost/x", { headers: { "x-fixture-user": "route-test-user" } }),
          ctx({ id }),
        )
      ).json(),
    ).evidence;
    const first = evidence[0];
    const reviewed = await review(
      json("PATCH", { decision: "confirm" }, "route-test-user"),
      ctx({ id: first?.id ?? "" }),
    );
    expect(reviewed.status).toBe(200);
    expect(((await reviewed.json()) as { evidence: { status: string } }).evidence.status).toBe(
      "confirmed",
    );
  });

  it.each([
    ["a file over 50 MB", { mimeType: "video/mp4", sizeBytes: 52_428_801 }],
    ["a size of zero", { mimeType: "video/mp4", sizeBytes: 0 }],
    ["a text file", { mimeType: "text/plain", sizeBytes: 1000 }],
    ["an unlisted video type", { mimeType: "video/x-flv", sizeBytes: 1000 }],
    ["a request with no size", { mimeType: "video/mp4" }],
  ])("refuses an upload request for %s with 400", async (_name, extra) => {
    const who = "upload-limit-user";
    const created = await createProject(json("POST", { name: "Upload limits" }, who), ctx());
    const id = ((await created.json()) as { project: { id: string } }).project.id;
    const res = await createUploadUrl(
      json("POST", { fileName: "a.mp4", durationMs: 5000, ...extra }, who),
      ctx({ id }),
    );
    expect(res.status).toBe(400);
  });

  it.each(["video/mp4", "video/quicktime", "video/webm", "video/x-matroska"])(
    "accepts %s at exactly 50 MB",
    async (mimeType) => {
      const who = "upload-limit-ok-user";
      const created = await createProject(json("POST", { name: "Upload ok" }, who), ctx());
      const id = ((await created.json()) as { project: { id: string } }).project.id;
      const res = await createUploadUrl(
        json("POST", { fileName: "a.bin", mimeType, sizeBytes: 52_428_800, durationMs: 5000 }, who),
        ctx({ id }),
      );
      expect(res.status).toBe(201);
    },
  );

  it("queues analysis in fixture mode without calling GitHub to start a worker", async () => {
    const spy = vi.spyOn(globalThis, "fetch");
    try {
      const who = "dispatch-fixture-user";
      const created = await createProject(json("POST", { name: "Dispatch" }, who), ctx());
      const id = ((await created.json()) as { project: { id: string } }).project.id;
      await createUploadUrl(
        json(
          "POST",
          { fileName: "a.mp4", mimeType: "video/mp4", sizeBytes: 1000, durationMs: 5000 },
          who,
        ),
        ctx({ id }),
      );
      await createScript(json("POST", { text: "One line here." }, who), ctx({ id }));
      const res = await startAnalysis(json("POST", {}, who), ctx({ id }));
      expect(res.status).toBe(202);
      expect(spy).not.toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });

  it("answers 429 with the standard error shape and a reset time after the daily limit", async () => {
    const who = "limit-test-user";
    const created = await createProject(json("POST", { name: "Limits" }, who), ctx());
    const id = ((await created.json()) as { project: { id: string } }).project.id;
    const upload = await createUploadUrl(
      json(
        "POST",
        { fileName: "a.mp4", mimeType: "video/mp4", sizeBytes: 1000, durationMs: 5000 },
        who,
      ),
      ctx({ id }),
    );
    expect(upload.status).toBe(201);
    const script = Array.from({ length: 8 }, (_, i) => `Line number ${i + 1} here.`).join("\n");
    expect((await createScript(json("POST", { text: script }, who), ctx({ id }))).status).toBe(201);

    // The default limit is 5 per user per day. Each request names a different segment.
    for (let i = 1; i <= 5; i++) {
      const ok = await startAnalysis(json("POST", { segmentIds: [`seg-${i}`] }, who), ctx({ id }));
      expect(ok.status).toBe(202);
    }
    const refused = await startAnalysis(json("POST", { segmentIds: ["seg-6"] }, who), ctx({ id }));
    expect(refused.status).toBe(429);
    const body = ErrorResponseSchema.parse(await refused.json());
    expect(body.error.code).toBe("limit_exceeded");
    expect(JSON.stringify(body.error.details)).toContain("resetsAt");
  });

  it("serves the report as CSV and as HTML", async () => {
    const csv = await reportCsv(new Request("http://localhost/x"), ctx({ id: "proofpay-demo" }));
    expect(csv.headers.get("content-type")).toContain("text/csv");
    expect(await csv.text()).toContain("Phantom Dialogue,Script line not spoken");
    const html = await reportHtml(new Request("http://localhost/x"), ctx({ id: "proofpay-demo" }));
    expect(html.headers.get("content-type")).toContain("text/html");
    expect(await html.text()).toContain("Draft: not signed off");
  });
});

describe("report rendering", () => {
  it("escapes HTML", () => {
    expect(htmlEscape(`<script>alert("x")</script>&'`)).toBe(
      "&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;&amp;&#39;",
    );
  });

  it("neutralises spreadsheet formulas in CSV cells", async () => {
    const store = createFixtureStore();
    const data = await store.getReportData({ userId: null }, "proofpay-demo");
    const tricky = {
      ...data,
      findings: data.findings.map((f) => ({ ...f, found: "=HYPERLINK(1)" })),
    };
    expect(buildCsv(tricky)).toContain("'=HYPERLINK(1)");
    expect(buildHtml({ ...data, project: { ...data.project, name: "<b>x</b>" } })).not.toContain(
      "<b>x</b>",
    );
  });
});
