import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type {
  ChecklistItem,
  EvidenceCandidate,
  EvidenceStatus,
  ReviewDecisionKind,
} from "@sleuth/contracts";
import { COVERAGE_STATES } from "@sleuth/contracts";
import { computeCoverage } from "./coverage";
import { makeEvidence } from "./test-helpers";

const HASH = "a".repeat(64);
const SEGMENTS = ["s1", "s2", "s3", "s4", "s5"];
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

const checklistArb = fc.integer({ min: 0, max: 6 }).map((n): ChecklistItem[] =>
  Array.from({ length: n }, (_, i) => ({
    id: `c${i}`,
    projectId: "p1",
    label: `Item ${i}`,
    position: i,
  })),
);

const evidenceArb = (itemCount: number) =>
  fc
    .array(
      fc.record({
        item: fc.option(fc.integer({ min: 0, max: Math.max(0, itemCount - 1) }), { nil: null }),
        segment: fc.constantFrom(...SEGMENTS),
        status: fc.constantFrom(...STATUSES),
        staleHash: fc.boolean(),
      }),
      { maxLength: 12 },
    )
    .map((rows): EvidenceCandidate[] =>
      rows.map((r, i) =>
        makeEvidence({
          id: `ev-${i}`,
          scriptSegmentId: r.segment,
          checklistItemId: itemCount === 0 || r.item === null ? null : `c${r.item}`,
          status: r.status,
          segmentHash: r.staleHash ? "z".repeat(64) : HASH,
        }),
      ),
    );

const decisionsArb = (evidence: readonly EvidenceCandidate[]) =>
  evidence.length === 0
    ? fc.constant([] as { evidenceId: string; decision: ReviewDecisionKind; createdAt: string }[])
    : fc.array(
        fc.record({
          evidenceId: fc.constantFrom(...evidence.map((e) => e.id)),
          decision: fc.constantFrom(...DECISIONS),
          createdAt: fc.constant("2026-11-08T10:00:00.000Z"),
        }),
        { maxLength: 12 },
      );

const caseArb = checklistArb.chain((checklist) =>
  evidenceArb(checklist.length).chain((evidence) =>
    decisionsArb(evidence).map((decisions) => ({ checklist, evidence, decisions })),
  ),
);

describe("computeCoverage properties", () => {
  it("gives every checklist item exactly one state and totals that add up [1.3]", () => {
    fc.assert(
      fc.property(caseArb, ({ checklist, evidence, decisions }) => {
        const out = computeCoverage(checklist, script, evidence, decisions);
        expect(out.items.map((i) => i.checklistItemId)).toEqual(checklist.map((c) => c.id));
        for (const i of out.items) expect(COVERAGE_STATES).toContain(i.state);
        const sum = Object.values(out.totals).reduce((a, b) => a + b, 0);
        expect(sum).toBe(checklist.length);
        for (const s of COVERAGE_STATES) {
          expect(out.totals[s]).toBe(out.items.filter((i) => i.state === s).length);
        }
      }),
    );
  });

  it("keeps the proven percentage a whole number from 0 to 100 [1.3]", () => {
    fc.assert(
      fc.property(caseArb, ({ checklist, evidence, decisions }) => {
        const { provenPercent } = computeCoverage(checklist, script, evidence, decisions);
        expect(Number.isInteger(provenPercent)).toBe(true);
        expect(provenPercent).toBeGreaterThanOrEqual(0);
        expect(provenPercent).toBeLessThanOrEqual(100);
      }),
    );
  });

  it("never increases proven when a candidate becomes stale [1.4]", () => {
    fc.assert(
      fc.property(caseArb, fc.nat(), ({ checklist, evidence, decisions }, pick) => {
        fc.pre(evidence.length > 0);
        const before = computeCoverage(checklist, script, evidence, decisions).totals.proven;
        const i = pick % evidence.length;
        const staled = evidence.map((e, j) => (j === i ? { ...e, status: "stale" as const } : e));
        const after = computeCoverage(checklist, script, staled, decisions).totals.proven;
        expect(after).toBeLessThanOrEqual(before);
      }),
    );
  });

  it("never increases proven when a segment's hash changes under the evidence [1.4]", () => {
    fc.assert(
      fc.property(caseArb, ({ checklist, evidence, decisions }) => {
        const before = computeCoverage(checklist, script, evidence, decisions).totals.proven;
        const edited = { segments: script.segments.map((s) => ({ ...s, hash: "e".repeat(64) })) };
        expect(computeCoverage(checklist, edited, evidence, decisions).totals.proven).toBe(0);
        expect(before).toBeGreaterThanOrEqual(0);
      }),
    );
  });

  it("proves nothing without a person's confirm decision [1.5]", () => {
    fc.assert(
      fc.property(caseArb, ({ checklist, evidence, decisions }) => {
        const noConfirms = decisions.filter((d) => d.decision !== "confirm");
        const out = computeCoverage(checklist, script, evidence, noConfirms);
        expect(out.totals.proven).toBe(0);
        expect(out.provenPercent).toBe(0);
      }),
    );
  });

  it("never proves an item through an AI candidate that merely carries the confirmed status [1.5]", () => {
    fc.assert(
      fc.property(checklistArb, (checklist) => {
        const evidence = checklist.map((c, i) =>
          makeEvidence({
            id: `ev-${i}`,
            scriptSegmentId: "s1",
            checklistItemId: c.id,
            status: "confirmed",
            source: "ai",
          }),
        );
        expect(computeCoverage(checklist, script, evidence, []).totals.proven).toBe(0);
      }),
    );
  });

  it("counts a reshoot marked done the same as no reshoot", () => {
    fc.assert(
      fc.property(caseArb, ({ checklist, evidence, decisions }) => {
        const done = checklist.map((c, i) => ({
          id: `r${i}`,
          checklistItemId: c.id,
          status: "done" as const,
        }));
        expect(computeCoverage(checklist, script, evidence, decisions, done)).toEqual(
          computeCoverage(checklist, script, evidence, decisions, []),
        );
      }),
    );
  });
});
