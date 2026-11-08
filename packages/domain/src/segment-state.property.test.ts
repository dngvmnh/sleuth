import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { EvidenceStatus } from "@sleuth/contracts";
import { deriveSegmentStates, SEGMENT_STATES } from "./segment-state";
import { makeEvidence } from "./test-helpers";

const IDS = ["a", "b", "c", "d"];
const HASHES = ["h".repeat(64), "k".repeat(64)];
const STATUSES: EvidenceStatus[] = [
  "candidate",
  "confirmed",
  "rejected",
  "stale",
  "needs_reshoot",
  "needs_outside_proof",
];

const segmentsArb = fc
  .uniqueArray(fc.constantFrom(...IDS), { maxLength: 4 })
  .map((ids) => ids.map((id) => ({ id, hash: HASHES[0] as string })));

const evidenceArb = fc
  .array(
    fc.record({
      segment: fc.constantFrom(...IDS, "unknown"),
      status: fc.constantFrom(...STATUSES),
      hash: fc.constantFrom(...HASHES),
    }),
    { maxLength: 14 },
  )
  .map((rows) =>
    rows.map((r, i) =>
      makeEvidence({
        id: `ev-${i}`,
        scriptSegmentId: r.segment,
        status: r.status,
        segmentHash: r.hash,
      }),
    ),
  );

describe("deriveSegmentStates properties", () => {
  it("gives exactly one valid state to every segment and none to anything else", () => {
    fc.assert(
      fc.property(segmentsArb, evidenceArb, (segments, evidence) => {
        const out = deriveSegmentStates(segments, evidence);
        expect(Object.keys(out).sort()).toEqual(segments.map((s) => s.id).sort());
        for (const state of Object.values(out)) expect(SEGMENT_STATES).toContain(state);
      }),
    );
  });

  it("calls a segment stale when it has stale evidence and nothing fresh", () => {
    fc.assert(
      fc.property(segmentsArb, evidenceArb, (segments, evidence) => {
        const out = deriveSegmentStates(segments, evidence);
        for (const s of segments) {
          const mine = evidence.filter((e) => e.scriptSegmentId === s.id);
          const effective = mine.map((e) => (e.segmentHash === s.hash ? e.status : "stale"));
          if (effective.length > 0 && effective.every((st) => st === "stale")) {
            expect(out[s.id]).toBe("stale");
          }
        }
      }),
    );
  });

  it("never calls a segment covered without fresh confirmed evidence", () => {
    fc.assert(
      fc.property(segmentsArb, evidenceArb, (segments, evidence) => {
        const out = deriveSegmentStates(segments, evidence);
        for (const s of segments) {
          if (out[s.id] === "covered") {
            expect(
              evidence.some(
                (e) =>
                  e.scriptSegmentId === s.id &&
                  e.segmentHash === s.hash &&
                  e.status === "confirmed",
              ),
            ).toBe(true);
          }
        }
      }),
    );
  });

  it("calls a segment uncovered when it has no evidence", () => {
    fc.assert(
      fc.property(segmentsArb, evidenceArb, (segments, evidence) => {
        const out = deriveSegmentStates(segments, evidence);
        for (const s of segments) {
          if (!evidence.some((e) => e.scriptSegmentId === s.id))
            expect(out[s.id]).toBe("uncovered");
        }
      }),
    );
  });

  it("does not depend on the order of the evidence", () => {
    fc.assert(
      fc.property(segmentsArb, evidenceArb, (segments, evidence) => {
        expect(deriveSegmentStates(segments, [...evidence].reverse())).toEqual(
          deriveSegmentStates(segments, evidence),
        );
      }),
    );
  });
});
