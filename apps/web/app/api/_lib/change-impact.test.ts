import { describe, expect, it } from "vitest";
import {
  CreateScriptResponseSchema,
  GetJobResponseSchema,
  ListEvidenceResponseSchema,
  ListFindingsResponseSchema,
  StartAnalysisResponseSchema,
  GetProjectResponseSchema,
} from "@sleuth/contracts";
import { loadGoldenFixture, type FixtureStore } from "@sleuth/db/fixture";
import { analyse } from "@sleuth/evidence-engine";
import { POST as startAnalysis } from "../v1/projects/[id]/analysis/route";
import { GET as getJob } from "../v1/projects/[id]/jobs/[jobId]/route";
import { GET as listEvidence } from "../v1/projects/[id]/evidence/route";
import { GET as listFindings } from "../v1/projects/[id]/findings/route";
import { GET as getProject } from "../v1/projects/[id]/route";
import { POST as createProject } from "../v1/projects/route";
import { POST as createScript } from "../v1/projects/[id]/scripts/route";
import { getStore } from "./data-source";

/**
 * Change impact through the API: copy the demo, edit one sentence, see exactly one stale candidate
 * and one Poltergeist, ask for re-analysis of that line only, finish the job (the test plays the
 * worker with the real matching engine), and see the Poltergeist resolved.
 */

const USER = "change-impact-user";
const ctx = (params: Record<string, string> = {}) => ({ params: Promise.resolve(params) });
const as = (method: string, body?: unknown) =>
  new Request("http://localhost/x", {
    method,
    headers: { "content-type": "application/json", "x-fixture-user": USER },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
const get = () => as("GET");

describe("change impact through the API", () => {
  it("edit one sentence -> one stale candidate and one Poltergeist -> re-analyse that line -> resolved", async () => {
    // 1. An editable copy of the demo.
    const created = await createProject(
      as("POST", { name: "Change impact", copyFromDemo: true }),
      ctx(),
    );
    const id = ((await created.json()) as { project: { id: string } }).project.id;
    const project = GetProjectResponseSchema.parse(
      await (await getProject(get(), ctx({ id }))).json(),
    );
    const script = project.scriptVersion?.text ?? "";

    const evidence0 = ListEvidenceResponseSchema.parse(
      await (await listEvidence(get(), ctx({ id }))).json(),
    ).evidence;
    expect(evidence0.filter((e) => e.status === "stale")).toHaveLength(0);
    const findings0 = ListFindingsResponseSchema.parse(
      await (await listFindings(get(), ctx({ id }))).json(),
    ).findings;
    expect(findings0.filter((f) => f.type === "poltergeist")).toHaveLength(0);

    // 2. Edit exactly one sentence (a word change, not punctuation).
    const edited = await createScript(
      as("POST", { text: script.replace("New Invoice", "Add Invoice") }),
      ctx({ id }),
    );
    expect(edited.status).toBe(201);
    const revision = CreateScriptResponseSchema.parse(await edited.json());
    expect(revision.diff.modified).toEqual(["seg-2"]);
    expect(revision.reanalysisPlan).toEqual(["seg-2"]);

    const evidence1 = ListEvidenceResponseSchema.parse(
      await (await listEvidence(get(), ctx({ id }))).json(),
    ).evidence;
    const stale = evidence1.filter((e) => e.status === "stale");
    expect(stale.map((e) => e.scriptSegmentId)).toEqual(["seg-2"]);
    expect(evidence1.filter((e) => e.status !== "stale")).toHaveLength(evidence0.length - 1);
    const findings1 = ListFindingsResponseSchema.parse(
      await (await listFindings(get(), ctx({ id }))).json(),
    ).findings;
    const poltergeists = findings1.filter((f) => f.type === "poltergeist");
    expect(poltergeists).toHaveLength(1);
    expect(poltergeists[0]).toMatchObject({
      status: "open",
      evidenceId: stale[0]?.id,
      plainLabel: "Evidence out of date",
    });

    // 3. Ask for re-analysis of only the changed line.
    const started = await startAnalysis(
      as("POST", { segmentIds: revision.reanalysisPlan }),
      ctx({ id }),
    );
    expect(started.status).toBe(202);
    const job = StartAnalysisResponseSchema.parse(await started.json()).job;
    expect(job).toMatchObject({ kind: "reanalysis", status: "queued" });
    expect(job.payload.segmentIds).toEqual(["seg-2"]);

    // 4. The worker finishes: run the real matching engine on that line, then apply the result.
    const fx = loadGoldenFixture();
    const now = GetProjectResponseSchema.parse(await (await getProject(get(), ctx({ id }))).json());
    const produced = analyse({
      projectId: id,
      assetVersionId: now.assetVersion?.id ?? "",
      durationMs: now.assetVersion?.durationMs ?? 0,
      analysisRunId: `run-${job.id}`,
      segments: (now.scriptVersion?.segments ?? []).filter((s) => s.id === "seg-2"),
      checklist: now.checklist,
      transcript: fx.transcript,
      observations: fx.frames,
    });
    expect(produced.evidence.map((e) => e.scriptSegmentId)).toEqual(["seg-2"]);
    expect(produced.evidence.every((e) => e.status === "candidate" && e.source === "ai")).toBe(
      true,
    );
    await (getStore() as FixtureStore).applyAnalysisResult({ userId: USER }, id, job.id, produced);

    // 5. Resolved: the job is done, nothing is stale, the Poltergeist is resolved, other lines untouched.
    const done = GetJobResponseSchema.parse(
      await (await getJob(get(), ctx({ id, jobId: job.id }))).json(),
    ).job;
    expect(done.status).toBe("succeeded");
    const evidence2 = ListEvidenceResponseSchema.parse(
      await (await listEvidence(get(), ctx({ id }))).json(),
    ).evidence;
    expect(evidence2.filter((e) => e.status === "stale")).toHaveLength(0);
    expect(evidence2.find((e) => e.scriptSegmentId === "seg-2")?.status).toBe("candidate");
    for (const e of evidence0.filter((x) => x.scriptSegmentId !== "seg-2")) {
      expect(evidence2.find((x) => x.id === e.id)).toEqual(e);
    }
    const findings2 = ListFindingsResponseSchema.parse(
      await (await listFindings(get(), ctx({ id }))).json(),
    ).findings;
    expect(findings2.filter((f) => f.type === "poltergeist").map((f) => f.status)).toEqual([
      "resolved",
    ]);
  });

  it("a punctuation-only edit stales nothing and plans no re-analysis", async () => {
    const created = await createProject(
      as("POST", { name: "Cosmetic", copyFromDemo: true }),
      ctx(),
    );
    const id = ((await created.json()) as { project: { id: string } }).project.id;
    const project = GetProjectResponseSchema.parse(
      await (await getProject(get(), ctx({ id }))).json(),
    );
    const out = await createScript(
      as("POST", {
        text: (project.scriptVersion?.text ?? "").replace(
          "Thanks for watching.",
          "thanks for watching!!",
        ),
      }),
      ctx({ id }),
    );
    const revision = CreateScriptResponseSchema.parse(await out.json());
    expect(revision.staleEvidenceIds).toEqual([]);
    expect(revision.reanalysisPlan).toEqual([]);
    const findings = ListFindingsResponseSchema.parse(
      await (await listFindings(get(), ctx({ id }))).json(),
    ).findings;
    expect(findings.filter((f) => f.type === "poltergeist")).toHaveLength(0);
  });

  it("refuses to re-analyse a line that is not in the script", async () => {
    const created = await createProject(as("POST", { name: "Bad ids", copyFromDemo: true }), ctx());
    const id = ((await created.json()) as { project: { id: string } }).project.id;
    const res = await startAnalysis(as("POST", { segmentIds: ["seg-404"] }), ctx({ id }));
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe("invalid_request");
  });
});
