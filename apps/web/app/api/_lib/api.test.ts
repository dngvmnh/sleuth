import { describe, expect, it } from "vitest";
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

  it("serves the report as CSV and as HTML", async () => {
    const csv = await reportCsv(new Request("http://localhost/x"), ctx({ id: "proofpay-demo" }));
    expect(csv.headers.get("content-type")).toContain("text/csv");
    expect(await csv.text()).toContain("Phantom Dialogue,Script line not spoken");
    const html = await reportHtml(new Request("http://localhost/x"), ctx({ id: "proofpay-demo" }));
    expect(html.headers.get("content-type")).toContain("text/html");
    expect(await html.text()).toContain("has not been signed off");
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
