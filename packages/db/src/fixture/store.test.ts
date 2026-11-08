import { describe, expect, it } from "vitest";
import { createFixtureStore } from "./store";
import { StoreError } from "../store";

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
