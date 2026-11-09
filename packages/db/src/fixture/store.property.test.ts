import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { EvidenceCandidate, ReviewDecisionKind, ScriptSegment } from "@sleuth/contracts";
import { createFixtureStore, type AnalysisResult } from "./store";
import { StoreError } from "../store";

/**
 * Random sequences of edits, cosmetic edits, removals, uploads, re-analyses and reviews against a
 * copy of the demo project. After every step the change-impact invariants must hold:
 * change-impact requirements 1.2 to 1.6, 2.1, 3.3, 3.5, 4.1 and 4.4.
 * The worker is played by `produce`, which makes one candidate per requested line.
 */

const alice = { userId: "user-alice" };
const STATUS_AFTER: Record<ReviewDecisionKind, EvidenceCandidate["status"]> = {
  confirm: "confirmed",
  reject: "rejected",
  needs_reshoot: "needs_reshoot",
  needs_outside_proof: "needs_outside_proof",
};

type Op =
  | { kind: "edit"; at: number }
  | { kind: "cosmetic" }
  | { kind: "remove" }
  | { kind: "upload"; durationMs: number }
  | { kind: "reanalyse" }
  | { kind: "review"; at: number; decision: ReviewDecisionKind };

const opArb: fc.Arbitrary<Op> = fc.oneof(
  { weight: 4, arbitrary: fc.record({ kind: fc.constant("edit" as const), at: fc.nat() }) },
  { weight: 2, arbitrary: fc.record({ kind: fc.constant("cosmetic" as const) }) },
  { weight: 1, arbitrary: fc.record({ kind: fc.constant("remove" as const) }) },
  {
    weight: 2,
    arbitrary: fc.record({
      kind: fc.constant("upload" as const),
      durationMs: fc.integer({ min: 1000, max: 180_000 }),
    }),
  },
  { weight: 4, arbitrary: fc.record({ kind: fc.constant("reanalyse" as const) }) },
  {
    weight: 4,
    arbitrary: fc.record({
      kind: fc.constant("review" as const),
      at: fc.nat(),
      decision: fc.constantFrom<ReviewDecisionKind>(
        "confirm",
        "reject",
        "needs_reshoot",
        "needs_outside_proof",
      ),
    }),
  },
);

function produce(
  projectId: string,
  assetVersionId: string,
  segments: readonly ScriptSegment[],
  ids: readonly string[],
): AnalysisResult {
  const wanted = new Set(ids);
  return {
    evidence: segments
      .filter((s) => wanted.has(s.id))
      .map((s) => ({
        id: `ev-${s.id}-${assetVersionId}`,
        projectId,
        checklistItemId: null,
        scriptSegmentId: s.id,
        scriptVersionId: s.scriptVersionId,
        segmentHash: s.hash,
        assetVersionId,
        startMs: 0,
        endMs: 1000,
        transcriptSegmentIds: [],
        frameObservationIds: [],
        explanation: "Stand-in for the worker. A person must confirm it.",
        confidence: "medium" as const,
        status: "candidate" as const,
        source: "ai" as const,
        analysisRunId: "run-property",
      })),
    findings: [],
  };
}

describe("fixture store: change-impact invariants over random histories", () => {
  it("holds after every step", async () => {
    await fc.assert(
      fc.asyncProperty(fc.array(opArb, { minLength: 1, maxLength: 14 }), async (ops) => {
        const store = createFixtureStore({ dailyAnalysisLimit: 10_000 });
        const project = await store.createProject(alice, { name: "History", copyFromDemo: true });
        const id = project.id;
        let plan: string[] = [];
        let counter = 0;

        for (const op of ops) {
          const before = await store.listEvidence(alice, id);
          const detail = await store.getProjectDetail(alice, id);
          const script = detail.scriptVersion;
          if (!script || !detail.assetVersion) throw new Error("copy of the demo must have both");
          const lines = script.text.split("\n");
          const beforeById = new Map(before.map((e) => [e.id, e]));

          if (op.kind === "edit" || op.kind === "cosmetic" || op.kind === "remove") {
            let text: string;
            if (op.kind === "edit") {
              const k = op.at % lines.length;
              text = lines.map((l, i) => (i === k ? `${l} extra${++counter}` : l)).join("\n");
            } else if (op.kind === "cosmetic") {
              text = lines
                .map(
                  (l) =>
                    `${l
                      .replace(/[.!?]+$/, "")
                      .toLowerCase()
                      .replace(/ /g, "  ")}!!`,
                )
                .join("\n");
            } else {
              if (lines.length < 2) continue;
              text = lines.slice(0, -1).join("\n");
            }
            const out = await store.createScript(alice, id, text);
            const after = await store.listEvidence(alice, id);
            const touched = new Set([...out.diff.modified, ...out.diff.removed]);

            // 1.4 / 1.5: evidence on untouched lines is exactly as before.
            for (const e of after) {
              if (!touched.has(e.scriptSegmentId)) expect(e).toEqual(beforeById.get(e.id));
            }
            // 1.2: every previously fresh candidate on a touched line is now stale
            // (a candidate a person rejected stays rejected, so a dismissal sticks).
            for (const e of before) {
              if (
                touched.has(e.scriptSegmentId) &&
                e.status !== "stale" &&
                e.status !== "rejected"
              ) {
                expect(after.find((a) => a.id === e.id)?.status).toBe("stale");
              }
            }
            if (op.kind === "cosmetic") {
              // 1.3: a cosmetic edit changes nothing and plans nothing new.
              expect(out.diff.modified).toEqual([]);
              expect(out.staleEvidenceIds).toEqual([]);
              expect(after).toEqual(before);
              for (const sid of out.reanalysisPlan ?? []) expect(plan).toContain(sid);
            }
            if (op.kind === "edit") expect(out.diff.modified).toHaveLength(1);
            if (op.kind === "remove") expect(out.diff.removed).toHaveLength(1);
            // 7 / audit: counts only, and they match what happened.
            const audit = (await store.listAuditEvents(alice, id))
              .filter((e) => e.type === "script_revised")
              .at(-1);
            expect(audit?.data).toEqual({
              modified: out.diff.modified.length,
              added: out.diff.added.length,
              removed: out.diff.removed.length,
              staleEvidence: out.staleEvidenceIds.length,
            });
            // 4.1: each newly stale candidate has an open Poltergeist.
            const findings = await store.listFindings(alice, id);
            for (const sid of out.staleEvidenceIds) {
              expect(
                findings.some(
                  (f) => f.type === "poltergeist" && f.evidenceId === sid && f.status === "open",
                ),
              ).toBe(true);
            }
            plan = out.reanalysisPlan ?? [];
          }

          if (op.kind === "upload") {
            await store.createUploadUrl(alice, id, {
              fileName: "v.mp4",
              mimeType: "video/mp4",
              durationMs: op.durationMs,
            });
            const after = await store.listEvidence(alice, id);
            // 2.1: nothing on an older video stays fresh.
            // (a candidate a person rejected stays rejected).
            expect(after.every((e) => e.status === "stale" || e.status === "rejected")).toBe(true);
            const wasFresh = before.filter((b) => b.status !== "stale" && b.status !== "rejected");
            const findings = await store.listFindings(alice, id);
            for (const e of wasFresh) {
              expect(
                findings.some(
                  (f) => f.type === "poltergeist" && f.evidenceId === e.id && f.status === "open",
                ),
              ).toBe(true);
            }
            const audit = (await store.listAuditEvents(alice, id))
              .filter((e) => e.type === "asset_replaced")
              .at(-1);
            expect(audit?.data).toEqual({ staleEvidence: wasFresh.length });
            plan = script.segments.map((s) => s.id); // a new video needs every line analysed
          }

          if (op.kind === "reanalyse" && plan.length > 0) {
            const wanted = new Set(plan);
            const job = await store.startAnalysis(alice, id, { segmentIds: plan });
            const fresh = await store.getProjectDetail(alice, id);
            const result = produce(
              id,
              fresh.assetVersion?.id ?? "",
              fresh.scriptVersion?.segments ?? [],
              plan,
            );
            await store.applyAnalysisResult(alice, id, job.id, result);
            const after = await store.listEvidence(alice, id);
            // 3.3: lines outside the plan are untouched, and so are their human decisions (1.6).
            for (const e of before) {
              if (!wanted.has(e.scriptSegmentId))
                expect(after.find((a) => a.id === e.id)).toEqual(e);
            }
            // 3.5: running the same result again adds nothing.
            await store.applyAnalysisResult(alice, id, job.id, result);
            expect(await store.listEvidence(alice, id)).toEqual(after);
            plan = [];
          }

          if (op.kind === "review" && before.length > 0) {
            const target = before[op.at % before.length] as EvidenceCandidate;
            // Outdated = marked stale, or built on a line text / video that is no longer current.
            // A dismissed (rejected) stale candidate is still outdated.
            const currentHash = script.segments.find((s) => s.id === target.scriptSegmentId)?.hash;
            const outdated =
              target.status === "stale" ||
              currentHash !== target.segmentHash ||
              target.assetVersionId !== detail.assetVersion.id;
            let result: Awaited<ReturnType<typeof store.reviewEvidence>> | null = null;
            try {
              result = await store.reviewEvidence(alice, target.id, { decision: op.decision });
            } catch (e) {
              expect(e).toBeInstanceOf(StoreError);
              expect((e as StoreError).code).toBe("review_refused");
            }
            // 4.4: outdated evidence can only be dismissed; anything current is accepted.
            expect(result !== null).toBe(!outdated || op.decision === "reject");
            if (result) {
              expect(result.evidence.status).toBe(STATUS_AFTER[op.decision]);
            } else {
              expect((await store.listEvidence(alice, id)).find((e) => e.id === target.id)).toEqual(
                target,
              );
            }
          }

          // ---- invariants after every step ----
          const now = await store.listEvidence(alice, id);
          const cur = await store.getProjectDetail(alice, id);
          const hashes = new Map((cur.scriptVersion?.segments ?? []).map((s) => [s.id, s.hash]));
          expect(new Set(now.map((e) => e.id)).size).toBe(now.length);
          for (const e of now) {
            // A candidate a person dismissed (rejected) may be outdated; it can only stay rejected
            // (checked in the review step above). Everything else that is not stale is fresh.
            if (e.status === "stale" || e.status === "rejected") continue;
            // 1.2 / 2.1 / 4.4: fresh evidence matches the current line text and the current video.
            expect(hashes.get(e.scriptSegmentId)).toBe(e.segmentHash);
            expect(e.assetVersionId).toBe(cur.assetVersion?.id);
          }
          const findings = await store.listFindings(alice, id);
          for (const e of now.filter((x) => x.status === "stale")) {
            expect(findings.some((f) => f.type === "poltergeist" && f.evidenceId === e.id)).toBe(
              true,
            );
          }
          for (const f of findings.filter((x) => x.type === "poltergeist" && x.status === "open")) {
            expect(now.find((e) => e.id === f.evidenceId)?.status).toBe("stale");
          }
        }
      }),
      { numRuns: 200 },
    );
  });

  it("is not vacuous: random histories reach stale evidence, re-analysis and refused reviews", async () => {
    const seen = { stale: false, reanalysed: false, refused: false };
    const store = createFixtureStore({ dailyAnalysisLimit: 100 });
    const p = await store.createProject(alice, { name: "Walk", copyFromDemo: true });
    const d = await store.getProjectDetail(alice, p.id);
    const out = await store.createScript(
      alice,
      p.id,
      (d.scriptVersion?.text ?? "").replace("New Invoice", "Add Invoice"),
    );
    seen.stale = out.staleEvidenceIds.length === 1;
    const staleId = out.staleEvidenceIds[0] ?? "";
    await store
      .reviewEvidence(alice, staleId, { decision: "confirm" })
      .catch(() => (seen.refused = true));
    const job = await store.startAnalysis(alice, p.id, { segmentIds: out.reanalysisPlan ?? [] });
    const cur = await store.getProjectDetail(alice, p.id);
    await store.applyAnalysisResult(
      alice,
      p.id,
      job.id,
      produce(
        p.id,
        cur.assetVersion?.id ?? "",
        cur.scriptVersion?.segments ?? [],
        out.reanalysisPlan ?? [],
      ),
    );
    seen.reanalysed = (await store.listEvidence(alice, p.id)).every((e) => e.status !== "stale");
    expect(seen).toEqual({ stale: true, reanalysed: true, refused: true });
  });
});
