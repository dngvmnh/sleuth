import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { EvidenceStatus } from "@sleuth/contracts";
import { diffScriptVersions } from "./diff";
import { planReanalysis } from "./reanalysis";
import { makeEvidence } from "./test-helpers";

const IDS = ["a", "b", "c", "d", "e", "f"];
const STATUSES: EvidenceStatus[] = [
  "candidate",
  "confirmed",
  "rejected",
  "stale",
  "needs_reshoot",
  "needs_outside_proof",
];

/** A script version: a unique subset of ids, each with a hash from a small pool. */
const versionArb = fc
  .uniqueArray(fc.constantFrom(...IDS), { maxLength: 6 })
  .chain((ids) =>
    fc.tuple(...ids.map((id) => fc.constantFrom("h1", "h2", "h3").map((hash) => ({ id, hash })))),
  );

const evidenceArb = fc
  .array(fc.record({ segment: fc.constantFrom(...IDS), status: fc.constantFrom(...STATUSES) }), {
    maxLength: 12,
  })
  .map((rows) =>
    rows.map((r, i) =>
      makeEvidence({ id: `ev-${i}`, scriptSegmentId: r.segment, status: r.status }),
    ),
  );

describe("planReanalysis properties", () => {
  it("never plans an unchanged segment that has non-stale evidence", () => {
    fc.assert(
      fc.property(versionArb, versionArb, evidenceArb, (prev, next, evidence) => {
        const diff = diffScriptVersions(prev, next);
        const plan = planReanalysis(diff, evidence);
        for (const id of diff.unchanged) {
          const fresh = evidence.some((e) => e.scriptSegmentId === id && e.status !== "stale");
          if (fresh) expect(plan).not.toContain(id);
        }
      }),
    );
  });

  it("always plans modified and added segments and never removed ones", () => {
    fc.assert(
      fc.property(versionArb, versionArb, evidenceArb, (prev, next, evidence) => {
        const diff = diffScriptVersions(prev, next);
        const plan = planReanalysis(diff, evidence);
        for (const id of [...diff.modified, ...diff.added]) expect(plan).toContain(id);
        for (const id of diff.removed) expect(plan).not.toContain(id);
      }),
    );
  });

  it("returns no duplicates and only ids from the new version", () => {
    fc.assert(
      fc.property(
        versionArb,
        versionArb,
        evidenceArb,
        fc.boolean(),
        (prev, next, evidence, assetChanged) => {
          const plan = planReanalysis(diffScriptVersions(prev, next), evidence, { assetChanged });
          expect(new Set(plan).size).toBe(plan.length);
          const nextIds = new Set(next.map((s) => s.id));
          for (const id of plan) expect(nextIds.has(id)).toBe(true);
        },
      ),
    );
  });

  it("plans exactly the surviving segments when the video changed", () => {
    fc.assert(
      fc.property(versionArb, versionArb, evidenceArb, (prev, next, evidence) => {
        const plan = planReanalysis(diffScriptVersions(prev, next), evidence, {
          assetChanged: true,
        });
        expect([...plan].sort()).toEqual(next.map((s) => s.id).sort());
      }),
    );
  });

  it("plans nothing when nothing changed and all evidence is fresh", () => {
    fc.assert(
      fc.property(versionArb, (version) => {
        const evidence = version.map((s) =>
          makeEvidence({ id: `ev-${s.id}`, scriptSegmentId: s.id }),
        );
        expect(planReanalysis(diffScriptVersions(version, version), evidence)).toEqual([]);
      }),
    );
  });
});
