import { describe, expect, it } from "vitest";
import { createFixtureStore } from "./store";
import { StoreError } from "../store";
import { runStoreContract } from "../store-contract";

runStoreContract("fixture store", () => createFixtureStore());

const anon = { userId: null };
const alice = { userId: "user-alice" };
const bob = { userId: "user-bob" };
const fixedNow = () => new Date("2026-11-08T00:00:00.000Z");

async function aliceCopy() {
  const store = createFixtureStore({ now: fixedNow });
  const project = await store.createProject(alice, { name: "Mine", copyFromDemo: true });
  return { store, projectId: project.id };
}

async function rejects(p: Promise<unknown>): Promise<StoreError> {
  try {
    await p;
  } catch (e) {
    if (e instanceof StoreError) return e;
    throw e;
  }
  throw new Error("expected the call to be refused");
}

describe("fixture store access rules", () => {
  it("lets a visitor read the demo project without signing in", async () => {
    const store = createFixtureStore();
    const list = await store.listProjects(anon);
    expect(list.map((p) => p.isDemo)).toEqual([true]);
    expect((await store.listEvidence(anon, "proofpay-demo")).length).toBe(4);
  });

  it("refuses every write to the demo project", async () => {
    const store = createFixtureStore();
    const err = await rejects(store.createScript(alice, "proofpay-demo", "New text."));
    expect(err.code).toBe("demo_read_only");
  });

  it("hides one user's project from another", async () => {
    const { store, projectId } = await aliceCopy();
    expect((await rejects(store.getProjectDetail(bob, projectId))).status).toBe(404);
    expect((await store.listProjects(bob)).map((p) => p.id)).toEqual(["proofpay-demo"]);
  });

  it("requires sign-in to create a project", async () => {
    const store = createFixtureStore();
    expect((await rejects(store.createProject(anon, { name: "x" }))).status).toBe(401);
  });
});

describe("fixture store review (Exorcism)", () => {
  it("confirms evidence only through a named reviewer and resolves its finding", async () => {
    const { store, projectId } = await aliceCopy();
    const evidence = await store.listEvidence(alice, projectId);
    const target = evidence.find((e) => e.confidence === "medium" && e.status === "candidate");
    expect(target).toBeDefined();
    const out = await store.reviewEvidence(alice, target?.id ?? "", { decision: "confirm" });
    expect(out.evidence.status).toBe("confirmed");
    expect(out.decision.reviewerId).toBe("user-alice");
    const findings = await store.listFindings(alice, projectId);
    expect(
      findings.filter((f) => f.evidenceId === target?.id).every((f) => f.status === "resolved"),
    ).toBe(true);
  });

  it("does not let a stranger review someone else's evidence", async () => {
    const { store, projectId } = await aliceCopy();
    const [first] = await store.listEvidence(alice, projectId);
    const err = await rejects(store.reviewEvidence(bob, first?.id ?? "", { decision: "confirm" }));
    expect(err.status).toBe(404);
  });
});

describe("fixture store change impact", () => {
  it("marks only the edited line's evidence stale and adds a Poltergeist finding", async () => {
    const { store, projectId } = await aliceCopy();
    const detail = await store.getProjectDetail(alice, projectId);
    const edited = (detail.scriptVersion?.text ?? "").replace("New Invoice", "Add Invoice");
    const out = await store.createScript(alice, projectId, edited);
    expect(out.diff.modified).toEqual(["seg-2"]);
    expect(out.staleEvidenceIds).toHaveLength(1);
    const evidence = await store.listEvidence(alice, projectId);
    expect(evidence.filter((e) => e.status === "stale")).toHaveLength(1);
    const findings = await store.listFindings(alice, projectId);
    expect(findings.filter((f) => f.type === "poltergeist")).toHaveLength(1);
  });

  it("keeps all evidence valid on a punctuation-only edit", async () => {
    const { store, projectId } = await aliceCopy();
    const detail = await store.getProjectDetail(alice, projectId);
    const edited = (detail.scriptVersion?.text ?? "").replace(
      "Thanks for watching.",
      "thanks for watching!!",
    );
    const out = await store.createScript(alice, projectId, edited);
    expect(out.staleEvidenceIds).toEqual([]);
  });

  it("marks every candidate stale when a new video version is added", async () => {
    const { store, projectId } = await aliceCopy();
    await store.createUploadUrl(alice, projectId, {
      fileName: "take2.mp4",
      mimeType: "video/mp4",
      durationMs: 50000,
    });
    const evidence = await store.listEvidence(alice, projectId);
    expect(evidence.every((e) => e.status === "stale")).toBe(true);
  });

  it("queues an analysis job for the current script and video", async () => {
    const { store, projectId } = await aliceCopy();
    const job = await store.startAnalysis(alice, projectId, {});
    expect(job.status).toBe("queued");
    expect((await store.getJob(alice, projectId, job.id)).id).toBe(job.id);
  });

  it("refuses analysis on a project with no inputs", async () => {
    const store = createFixtureStore();
    const p = await store.createProject(alice, { name: "Empty" });
    expect((await rejects(store.startAnalysis(alice, p.id, {}))).code).toBe("missing_inputs");
  });
});

describe("fixture store daily analysis limit (ingestion 5.2)", () => {
  /** A project with a video and an 8-line script, so there are many distinct segment sets to request. */
  async function setup(opts: { dailyAnalysisLimit?: number } = {}) {
    let nowMs = Date.parse("2026-11-08T10:00:00.000Z");
    const store = createFixtureStore({ now: () => new Date(nowMs), ...opts });
    const p = await store.createProject(alice, { name: "Limits" });
    await store.createUploadUrl(alice, p.id, {
      fileName: "a.mp4",
      mimeType: "video/mp4",
      durationMs: 30_000,
    });
    await store.createScript(
      alice,
      p.id,
      Array.from({ length: 8 }, (_, i) => `Step number ${i + 1} here.`).join("\n"),
    );
    return { store, p, setNow: (iso: string) => (nowMs = Date.parse(iso)) };
  }
  const request = (s: Awaited<ReturnType<typeof setup>>, i: number, user = alice) =>
    s.store.startAnalysis(user, s.p.id, { segmentIds: [`seg-${i}`] });

  it("answers 429 limit_exceeded on the request after the daily limit, with the reset time", async () => {
    const s = await setup({ dailyAnalysisLimit: 5 });
    for (let i = 1; i <= 5; i++) await request(s, i);
    const err = await rejects(request(s, 6));
    expect(err.status).toBe(429);
    expect(err.code).toBe("limit_exceeded");
    expect(err.details).toMatchObject({ limit: 5, resetsAt: "2026-11-09T00:00:00.000Z" });
  });

  it("uses 5 per day when no limit is set", async () => {
    const s = await setup();
    for (let i = 1; i <= 5; i++) await request(s, i);
    expect((await rejects(request(s, 6))).status).toBe(429);
  });

  it("accepts requests again after UTC midnight", async () => {
    const s = await setup({ dailyAnalysisLimit: 2 });
    await request(s, 1);
    await request(s, 2);
    expect((await rejects(request(s, 3))).status).toBe(429);
    s.setNow("2026-11-08T23:59:59.000Z");
    expect((await rejects(request(s, 3))).status).toBe(429);
    s.setNow("2026-11-09T00:00:00.000Z");
    expect((await request(s, 3)).status).toBe("queued");
  });

  it("counts each user on their own", async () => {
    const s = await setup({ dailyAnalysisLimit: 1 });
    const bobProject = await s.store.createProject(bob, { name: "Bob" });
    await s.store.createUploadUrl(bob, bobProject.id, {
      fileName: "b.mp4",
      mimeType: "video/mp4",
      durationMs: 1000,
    });
    await s.store.createScript(bob, bobProject.id, "Only step here.");
    await request(s, 1);
    expect((await rejects(request(s, 2))).status).toBe(429);
    expect((await s.store.startAnalysis(bob, bobProject.id, {})).status).toBe("queued");
  });

  it("does not count a repeated request that returns the existing job", async () => {
    const s = await setup({ dailyAnalysisLimit: 2 });
    const first = await request(s, 1);
    for (let i = 0; i < 5; i++) expect((await request(s, 1)).id).toBe(first.id);
    await request(s, 2);
    expect((await rejects(request(s, 3))).status).toBe(429);
  });

  it("does not count a refused request", async () => {
    const s = await setup({ dailyAnalysisLimit: 1 });
    await request(s, 1);
    await rejects(request(s, 2));
    await rejects(request(s, 3));
    const events = await s.store.listAuditEvents(alice, s.p.id);
    expect(events.filter((e) => e.type === "analysis_requested")).toHaveLength(1);
  });

  it("refuses a video above the maximum length at the store, not only in the schema", async () => {
    const store = createFixtureStore({ maxVideoMs: 60_000 });
    const p = await store.createProject(alice, { name: "Long" });
    const err = await rejects(
      store.createUploadUrl(alice, p.id, {
        fileName: "long.mp4",
        mimeType: "video/mp4",
        durationMs: 60_001,
      }),
    );
    expect(err.status).toBe(400);
    expect(err.details).toMatchObject({ reason: "video_too_long" });
  });
});

describe("fixture store audit events (ingestion 6.1)", () => {
  const SECRET_SCRIPT = "Zebra quartz secret sentence one.\nMango thunder secret sentence two.";
  const SECRET_FILE = "my-private-recording-final.mp4";
  const SECRET_LABEL = "Chocolate waterfall checklist label";

  async function activity() {
    const store = createFixtureStore({ now: fixedNow });
    const p = await store.createProject(alice, { name: "Audit project name" });
    await store.createUploadUrl(alice, p.id, {
      fileName: SECRET_FILE,
      mimeType: "video/mp4",
      durationMs: 12_000,
    });
    await store.createScript(alice, p.id, SECRET_SCRIPT);
    await store.setChecklist(alice, p.id, [SECRET_LABEL, "Second label"]);
    await store.startAnalysis(alice, p.id, {});
    return { store, p, events: await store.listAuditEvents(alice, p.id) };
  }

  it("records one event for each create step, in order, with the actor", async () => {
    const { events } = await activity();
    expect(events.map((e) => e.type)).toEqual([
      "project_created",
      "asset_version_created",
      "script_version_created",
      "checklist_replaced",
      "analysis_requested",
    ]);
    expect(events.every((e) => e.actorId === "user-alice")).toBe(true);
    expect(new Set(events.map((e) => e.id)).size).toBe(events.length);
  });

  it("holds ids and counts only, never script text, file names, labels or the project name", async () => {
    const { events } = await activity();
    const json = JSON.stringify(events);
    for (const secret of [
      "Zebra",
      "Mango",
      "secret sentence",
      SECRET_FILE,
      "private-recording",
      SECRET_LABEL,
      "Second label",
      "Audit project name",
      ".mp4",
    ]) {
      expect(json).not.toContain(secret);
    }
    for (const e of events) {
      for (const v of Object.values(e.data)) {
        expect(["string", "number", "boolean"].includes(typeof v) || v === null).toBe(true);
        // Strings are ids (short, no spaces).
        if (typeof v === "string") expect(v).toMatch(/^[\w:.-]+$/);
      }
    }
  });

  it("records counts that match what happened", async () => {
    const { events } = await activity();
    const byType = Object.fromEntries(events.map((e) => [e.type, e.data]));
    expect(byType["asset_version_created"]).toMatchObject({ version: 1, durationMs: 12_000 });
    expect(byType["script_version_created"]).toMatchObject({ version: 1, segments: 2 });
    expect(byType["checklist_replaced"]).toEqual({ items: 2 });
    expect(byType["analysis_requested"]).toMatchObject({ kind: "analysis", segments: null });
  });

  it("only lets the owner read the trail", async () => {
    const { store, p } = await activity();
    expect((await rejects(store.listAuditEvents(bob, p.id))).status).toBe(404);
    expect((await rejects(store.listAuditEvents(anon, "proofpay-demo"))).status).toBe(403);
  });
});

describe("fixture store re-analysis (change-impact 3)", () => {
  async function copy() {
    const store = createFixtureStore({ now: fixedNow, dailyAnalysisLimit: 100 });
    const p = await store.createProject(alice, { name: "Copy", copyFromDemo: true });
    const detail = await store.getProjectDetail(alice, p.id);
    return { store, id: p.id, text: detail.scriptVersion?.text ?? "" };
  }

  it("returns the lines worth re-checking when a sentence is edited", async () => {
    const { store, id, text } = await copy();
    const out = await store.createScript(alice, id, text.replace("New Invoice", "Add Invoice"));
    expect(out.reanalysisPlan).toEqual(["seg-2"]);
  });

  it("returns an empty plan for a cosmetic edit", async () => {
    const { store, id, text } = await copy();
    const out = await store.createScript(
      alice,
      id,
      text.replace("Thanks for watching.", "thanks for watching!!"),
    );
    expect(out.reanalysisPlan).toEqual([]);
  });

  it("refuses segmentIds that are not in the current script, or an empty list", async () => {
    const { store, id } = await copy();
    const unknown = await rejects(store.startAnalysis(alice, id, { segmentIds: ["seg-99"] }));
    expect(unknown.status).toBe(400);
    expect(unknown.details).toMatchObject({ unknownSegmentIds: ["seg-99"] });
    expect((await rejects(store.startAnalysis(alice, id, { segmentIds: [] }))).status).toBe(400);
  });

  it("applies a finished analysis: replaces stale evidence, resolves its Poltergeist, finishes the job", async () => {
    const { store, id, text } = await copy();
    const edit = await store.createScript(alice, id, text.replace("New Invoice", "Add Invoice"));
    const stale = edit.staleEvidenceIds[0] ?? "";
    const detail = await store.getProjectDetail(alice, id);
    const job = await store.startAnalysis(alice, id, { segmentIds: edit.reanalysisPlan ?? [] });
    const seg = detail.scriptVersion?.segments.find((s) => s.id === "seg-2");
    const out = await store.applyAnalysisResult(alice, id, job.id, {
      evidence: [
        {
          id: stale,
          projectId: id,
          checklistItemId: "ck-2",
          scriptSegmentId: "seg-2",
          scriptVersionId: seg?.scriptVersionId ?? "",
          segmentHash: seg?.hash ?? "",
          assetVersionId: detail.assetVersion?.id ?? "",
          startMs: 4000,
          endMs: 10000,
          transcriptSegmentIds: [],
          frameObservationIds: [],
          explanation: "New candidate. A person must confirm it.",
          confidence: "medium",
          status: "candidate",
          source: "ai",
          analysisRunId: "run-x",
        },
      ],
      findings: [],
    });
    expect(out.replacedEvidenceIds).toEqual([stale]);
    expect(out.job.status).toBe("succeeded");
    const evidence = await store.listEvidence(alice, id);
    expect(evidence.find((e) => e.id === stale)?.status).toBe("candidate");
    expect(evidence.filter((e) => e.status === "stale")).toHaveLength(0);
    const findings = await store.listFindings(alice, id);
    expect(findings.find((f) => f.type === "poltergeist")?.status).toBe("resolved");
    expect((await store.getJob(alice, id, job.id)).status).toBe("succeeded");
  });

  it("keeps a person's decision on an unchanged line when the same result arrives again", async () => {
    const { store, id } = await copy();
    const before = await store.listEvidence(alice, id);
    const target = before.find((e) => e.scriptSegmentId === "seg-3");
    await store.reviewEvidence(alice, target?.id ?? "", { decision: "confirm" });
    const detail = await store.getProjectDetail(alice, id);
    const job = await store.startAnalysis(alice, id, {});
    await store.applyAnalysisResult(alice, id, job.id, { evidence: before, findings: [] });
    const after = await store.listEvidence(alice, id);
    expect(after.find((e) => e.id === target?.id)?.status).toBe("confirmed");
    expect(detail.project.id).toBe(id);
  });

  it("a targeted run only writes about its own lines", async () => {
    const { store, id } = await copy();
    const before = await store.listEvidence(alice, id);
    const other = {
      ...(before.find((e) => e.scriptSegmentId === "seg-1") as (typeof before)[number]),
      status: "rejected" as const,
    };
    const job = await store.startAnalysis(alice, id, { segmentIds: ["seg-3"] });
    await store.applyAnalysisResult(alice, id, job.id, { evidence: [other], findings: [] });
    expect(await store.listEvidence(alice, id)).toEqual(before);
  });

  it("records script_revised and asset_replaced with counts only", async () => {
    const { store, id, text } = await copy();
    await store.createScript(alice, id, text.replace("New Invoice", "Add Invoice"));
    await store.createUploadUrl(alice, id, {
      fileName: "take2.mp4",
      mimeType: "video/mp4",
      durationMs: 40_000,
    });
    const events = await store.listAuditEvents(alice, id);
    expect(events.find((e) => e.type === "script_revised")?.data).toEqual({
      modified: 1,
      added: 0,
      removed: 0,
      staleEvidence: 1,
    });
    expect(events.find((e) => e.type === "asset_replaced")?.data).toEqual({ staleEvidence: 3 });
    expect(JSON.stringify(events)).not.toContain("Add Invoice");
  });

  it("reopens a Poltergeist when the same evidence goes stale a second time", async () => {
    const { store, id, text } = await copy();
    const edit = await store.createScript(alice, id, text.replace("New Invoice", "Add Invoice"));
    const detail = await store.getProjectDetail(alice, id);
    const seg = detail.scriptVersion?.segments.find((s) => s.id === "seg-2");
    const job = await store.startAnalysis(alice, id, { segmentIds: ["seg-2"] });
    await store.applyAnalysisResult(alice, id, job.id, {
      evidence: [
        {
          id: edit.staleEvidenceIds[0] ?? "",
          projectId: id,
          checklistItemId: "ck-2",
          scriptSegmentId: "seg-2",
          scriptVersionId: seg?.scriptVersionId ?? "",
          segmentHash: seg?.hash ?? "",
          assetVersionId: detail.assetVersion?.id ?? "",
          startMs: 0,
          endMs: 1,
          transcriptSegmentIds: [],
          frameObservationIds: [],
          explanation: "x",
          confidence: "medium",
          status: "candidate",
          source: "ai",
          analysisRunId: "r",
        },
      ],
      findings: [],
    });
    expect(
      (await store.listFindings(alice, id)).find((f) => f.type === "poltergeist")?.status,
    ).toBe("resolved");
    await store.createScript(alice, id, text.replace("New Invoice", "Make Invoice"));
    expect(
      (await store.listFindings(alice, id)).find((f) => f.type === "poltergeist")?.status,
    ).toBe("open");
  });
});

describe("fixture store dismissals stick (change-impact review of 4.4)", () => {
  it("refuses to confirm a candidate that was dismissed while stale", async () => {
    const store = createFixtureStore({ now: fixedNow });
    const p = await store.createProject(alice, { name: "Copy", copyFromDemo: true });
    const d = await store.getProjectDetail(alice, p.id);
    const edit = await store.createScript(
      alice,
      p.id,
      (d.scriptVersion?.text ?? "").replace("New Invoice", "Add Invoice"),
    );
    const staleId = edit.staleEvidenceIds[0] ?? "";
    await store.reviewEvidence(alice, staleId, { decision: "reject" });
    const err = await rejects(store.reviewEvidence(alice, staleId, { decision: "confirm" }));
    expect(err.code).toBe("review_refused");
    // A later script change does not reopen the dismissed candidate or its finding.
    await store.createScript(
      alice,
      p.id,
      (d.scriptVersion?.text ?? "").replace("New Invoice", "Make Invoice"),
    );
    expect((await store.listEvidence(alice, p.id)).find((e) => e.id === staleId)?.status).toBe(
      "rejected",
    );
    expect(
      (await store.listFindings(alice, p.id)).find((f) => f.evidenceId === staleId)?.status,
    ).toBe("resolved");
  });
});

describe("fixture store coverage, reshoots and the Final Seal (final-seal 1 to 3)", () => {
  /** A copy of the demo where a person has settled every checklist item. */
  async function reviewed(opts: { seal?: boolean } = {}) {
    const store = createFixtureStore({ now: fixedNow });
    const p = await store.createProject(alice, { name: "Seal me", copyFromDemo: true });
    const evidence = await store.listEvidence(alice, p.id);
    const by = (seg: string) => evidence.find((e) => e.scriptSegmentId === seg)?.id ?? "";
    for (const seg of ["seg-1", "seg-2", "seg-3"])
      await store.reviewEvidence(alice, by(seg), { decision: "confirm" });
    await store.reviewEvidence(alice, by("seg-5"), { decision: "needs_outside_proof" });
    const detail = await store.getProjectDetail(alice, p.id);
    const exportItem = detail.checklist.find((c) => c.label.startsWith("Export"));
    const reshoot = await store.createReshoot(alice, p.id, {
      note: "Record the export step.",
      checklistItemId: exportItem?.id,
    });
    const seal = opts.seal ? await store.sealProject(alice, p.id, "Reviewed all items.") : null;
    return { store, id: p.id, detail, reshoot, seal, text: detail.scriptVersion?.text ?? "" };
  }

  it("reports coverage, blockers and no seal for a fresh copy", async () => {
    const store = createFixtureStore({ now: fixedNow });
    const p = await store.createProject(alice, { name: "Fresh", copyFromDemo: true });
    const out = await store.getCoverage(alice, p.id);
    expect(out.coverage.totals).toEqual({
      proven: 0,
      needs_review: 4,
      outside_proof: 0,
      reshoot: 0,
      uncovered: 1,
    });
    expect(out.seal).toBeNull();
    expect(out.blockers).toEqual(["undecided_candidates", "uncovered_items"]);
  });

  it("refuses to seal with 409 seal_blocked and lists every blocker", async () => {
    const store = createFixtureStore({ now: fixedNow });
    const p = await store.createProject(alice, { name: "Fresh", copyFromDemo: true });
    const err = await rejects(store.sealProject(alice, p.id));
    expect(err.status).toBe(409);
    expect(err.code).toBe("seal_blocked");
    expect(err.details).toEqual({ blockers: ["undecided_candidates", "uncovered_items"] });
  });

  it("seals once a person has settled everything, even with an open reshoot and outside-proof item", async () => {
    const { store, id, seal } = await reviewed({ seal: true });
    expect(seal).toMatchObject({
      status: "active",
      sealedBy: "user-alice",
      note: "Reviewed all items.",
    });
    expect(seal?.coverage.totals).toEqual({
      proven: 3,
      needs_review: 0,
      outside_proof: 1,
      reshoot: 1,
      uncovered: 0,
    });
    expect(seal?.coverage.provenPercent).toBe(60);
    const out = await store.getCoverage(alice, id);
    expect(out.seal?.id).toBe(seal?.id);
    expect(out.blockers).toEqual([]);
  });

  it("needs a person: a blank user id never seals", async () => {
    const blank = { userId: "   " };
    const store = createFixtureStore({ now: fixedNow });
    const p = await store.createProject(blank, { name: "Blank", copyFromDemo: true });
    expect((await rejects(store.sealProject(blank, p.id))).status).toBe(401);
    expect((await rejects(store.sealProject(anon, p.id))).status).toBe(404);
  });

  it("refuses to seal the demo project and anyone else's project", async () => {
    const { store, id } = await reviewed();
    expect((await rejects(store.sealProject(alice, "proofpay-demo"))).code).toBe("demo_read_only");
    expect((await rejects(store.sealProject(bob, id))).status).toBe(404);
  });

  it("keeps one active seal and the history of the earlier one", async () => {
    const { store, id, seal } = await reviewed({ seal: true });
    const second = await store.sealProject(alice, id, "Sealed again.");
    expect(second.id).not.toBe(seal?.id);
    expect((await store.getCoverage(alice, id)).seal?.status).toBe("active");
    const report = await store.getReportData(alice, id);
    expect(report.seal?.id).toBe(second.id);
  });

  it("breaks the seal when a script edit makes evidence stale, and keeps the record (3.6)", async () => {
    const { store, id, seal, text } = await reviewed({ seal: true });
    await store.createScript(alice, id, text.replace("New Invoice", "Add Invoice"));
    const out = await store.getCoverage(alice, id);
    expect(out.seal).toMatchObject({ id: seal?.id, status: "broken" });
    expect(out.seal?.brokenReason).toMatch(/script was edited/);
    expect(out.blockers).toContain("stale_evidence");
    const events = await store.listAuditEvents(alice, id);
    expect(
      events.some(
        (e) =>
          e.type === "seal_broken" &&
          JSON.stringify(e.data) === JSON.stringify({ sealId: seal?.id }),
      ),
    ).toBe(true);
  });

  it("keeps the seal through a cosmetic edit", async () => {
    const { store, id, text } = await reviewed({ seal: true });
    await store.createScript(
      alice,
      id,
      text.replace("Thanks for watching.", "thanks for watching!!"),
    );
    expect((await store.getCoverage(alice, id)).seal?.status).toBe("active");
  });

  it("breaks the seal when a new video is uploaded", async () => {
    const { store, id } = await reviewed({ seal: true });
    await store.createUploadUrl(alice, id, {
      fileName: "take2.mp4",
      mimeType: "video/mp4",
      durationMs: 30_000,
    });
    const out = await store.getCoverage(alice, id);
    expect(out.seal?.status).toBe("broken");
    expect(out.seal?.brokenReason).toMatch(/new video/);
  });

  it("lists reshoots and lets only the owner mark one done, without proving the item", async () => {
    const { store, id, reshoot, detail } = await reviewed();
    expect((await store.listReshoots(alice, id)).map((r) => r.id)).toEqual([reshoot.id]);
    expect((await rejects(store.updateReshoot(bob, reshoot.id, "done"))).status).toBe(404);
    const done = await store.updateReshoot(alice, reshoot.id, "done");
    expect(done.status).toBe("done");
    const out = await store.getCoverage(alice, id);
    const item = detail.checklist.find((c) => c.label.startsWith("Export"));
    expect(out.coverage.items.find((i) => i.checklistItemId === item?.id)?.state).toBe("uncovered");
    expect(out.blockers).toEqual(["uncovered_items"]);
    expect(out.coverage.openReshootIds).toEqual([]);
  });

  it("will not update a reshoot on the demo", async () => {
    const store = createFixtureStore({ now: fixedNow });
    expect((await rejects(store.updateReshoot(alice, "nope", "done"))).status).toBe(404);
  });

  it("puts decisions, the seal and coverage in the report data, with the reviewer and time", async () => {
    const { store, id } = await reviewed({ seal: true });
    const report = await store.getReportData(alice, id);
    expect(report.decisions).toHaveLength(4);
    expect(
      report.decisions.every((d) => d.reviewerId === "user-alice" && d.createdAt.length > 0),
    ).toBe(true);
    expect(report.seal?.status).toBe("active");
    expect(report.coverage.totals.proven).toBe(3);
  });
});
