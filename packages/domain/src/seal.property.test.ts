import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type {
  ChecklistItem,
  EvidenceCandidate,
  EvidenceStatus,
  ReviewDecisionKind,
} from "@sleuth/contracts";
import { computeCoverage } from "./coverage";
import { canSeal, sealBlockers } from "./seal";
import { makeEvidence } from "./test-helpers";

const HASH = "a".repeat(64);
const SEGMENTS = ["s1", "s2", "s3", "s4"];
const script = {
  segments: SEGMENTS.map((id, index) => ({
    id,
    scriptVersionId: "sv1",
    index,
    text: id,
    hash: HASH,
  })),
};
const STATUSES: EvidenceStatus[] = [
  "candidate",
  "confirmed",
  "rejected",
  "stale",
  "needs_reshoot",
  "needs_outside_proof",
];
const DECISIONS: ReviewDecisionKind[] = [
  "confirm",
  "reject",
  "needs_reshoot",
  "needs_outside_proof",
];
const JOB_STATUSES = ["queued", "running", "succeeded", "failed"] as const;

const caseArb = fc.integer({ min: 0, max: 5 }).chain((n) => {
  const checklist: ChecklistItem[] = Array.from({ length: n }, (_, i) => ({
    id: `c${i}`,
    projectId: "p1",
    label: `I${i}`,
    position: i,
  }));
  return fc
    .array(
      fc.record({
        item: fc.option(fc.integer({ min: 0, max: Math.max(0, n - 1) }), { nil: null }),
        segment: fc.constantFrom(...SEGMENTS),
        status: fc.constantFrom(...STATUSES),
      }),
      { maxLength: 10 },
    )
    .chain((rows) => {
      const evidence: EvidenceCandidate[] = rows.map((r, i) =>
        makeEvidence({
          id: `ev-${i}`,
          scriptSegmentId: r.segment,
          status: r.status,
          checklistItemId: n === 0 || r.item === null ? null : `c${r.item}`,
        }),
      );
      const decisions = evidence.length
        ? fc.array(
            fc.record({
              evidenceId: fc.constantFrom(...evidence.map((e) => e.id)),
              decision: fc.constantFrom(...DECISIONS),
              createdAt: fc.constant("2026-11-08T10:00:00.000Z"),
            }),
            { maxLength: 10 },
          )
        : fc.constant(
            [] as { evidenceId: string; decision: ReviewDecisionKind; createdAt: string }[],
          );
      return fc
        .tuple(
          decisions,
          fc.array(fc.constantFrom(...JOB_STATUSES), { maxLength: 3 }),
          fc.boolean(),
        )
        .map(([d, jobs, hasAnalysis]) => ({
          checklist,
          evidence,
          decisions: d,
          jobs: jobs.map((status) => ({ status })),
          hasAnalysis,
        }));
    });
});

const inputOf = (c: {
  checklist: ChecklistItem[];
  evidence: EvidenceCandidate[];
  decisions: { evidenceId: string; decision: ReviewDecisionKind; createdAt: string }[];
  jobs: { status: (typeof JOB_STATUSES)[number] }[];
  hasAnalysis: boolean;
}) => ({
  coverage: computeCoverage(c.checklist, script, c.evidence, c.decisions),
  evidence: c.evidence,
  jobs: c.jobs,
  hasAnalysis: c.hasAnalysis,
});

describe("sealing rules [3.2]", () => {
  it("refuses whenever any candidate is undecided", () => {
    fc.assert(
      fc.property(caseArb, (c) => {
        fc.pre(c.evidence.some((e) => e.status === "candidate"));
        const r = canSeal(inputOf(c));
        expect(r.ok).toBe(false);
        expect(sealBlockers(inputOf(c))).toContain("undecided_candidates");
      }),
    );
  });

  it("refuses whenever stale evidence remains", () => {
    fc.assert(
      fc.property(caseArb, (c) => {
        fc.pre(c.evidence.some((e) => e.status === "stale"));
        expect(sealBlockers(inputOf(c))).toContain("stale_evidence");
      }),
    );
  });

  it("refuses whenever a job is queued or running", () => {
    fc.assert(
      fc.property(caseArb, (c) => {
        fc.pre(c.jobs.some((j) => j.status === "queued" || j.status === "running"));
        expect(sealBlockers(inputOf(c))).toContain("job_running");
      }),
    );
  });

  it("allows sealing only when every item is settled and nothing is pending", () => {
    fc.assert(
      fc.property(caseArb, (c) => {
        const input = inputOf(c);
        if (canSeal(input).ok) {
          expect(input.coverage.items.length).toBeGreaterThan(0);
          for (const i of input.coverage.items) {
            expect(["uncovered", "needs_review"]).not.toContain(i.state);
          }
          expect(c.evidence.some((e) => e.status === "candidate" || e.status === "stale")).toBe(
            false,
          );
          expect(c.jobs.some((j) => j.status === "queued" || j.status === "running")).toBe(false);
          expect(c.hasAnalysis).toBe(true);
        }
      }),
      { numRuns: 500 },
    );
  });

  it("gives the same answer as the list of blockers", () => {
    fc.assert(
      fc.property(caseArb, (c) => {
        const input = inputOf(c);
        const blockers = sealBlockers(input);
        expect(canSeal(input).ok).toBe(blockers.length === 0);
      }),
    );
  });

  it("is sometimes allowed (the rules are not vacuous)", () => {
    const allowed = fc.sample(caseArb, 3000).filter((c) => canSeal(inputOf(c)).ok).length;
    expect(allowed).toBeGreaterThan(0);
  });
});
