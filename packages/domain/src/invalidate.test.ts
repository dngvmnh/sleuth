import { describe, expect, it } from "vitest";
import { invalidateForNewAssetVersion, invalidateForScriptChange } from "./invalidate";
import { makeEvidence } from "./test-helpers";

describe("invalidateForScriptChange", () => {
  const a = makeEvidence({ scriptSegmentId: "a", segmentHash: "h1" });
  const b = makeEvidence({ scriptSegmentId: "b", segmentHash: "h2" });

  it("marks evidence stale when its segment hash changed", () => {
    const out = invalidateForScriptChange(
      [a, b],
      [
        { id: "a", hash: "changed" },
        { id: "b", hash: "h2" },
      ],
    );
    expect(out.map((e) => e.status)).toEqual(["stale", "candidate"]);
  });

  it("marks evidence stale when its segment was removed", () => {
    const out = invalidateForScriptChange([a, b], [{ id: "b", hash: "h2" }]);
    expect(out.map((e) => e.status)).toEqual(["stale", "candidate"]);
  });

  it("leaves everything alone when no hash changed", () => {
    const out = invalidateForScriptChange(
      [a, b],
      [
        { id: "a", hash: "h1" },
        { id: "b", hash: "h2" },
      ],
    );
    expect(out).toEqual([a, b]);
  });

  it("does not mutate its input", () => {
    invalidateForScriptChange([a], [{ id: "a", hash: "other" }]);
    expect(a.status).toBe("candidate");
  });
});

describe("invalidateForNewAssetVersion", () => {
  it("marks evidence on the old video stale and keeps evidence on the new one", () => {
    const old = makeEvidence({ scriptSegmentId: "a", assetVersionId: "av1" });
    const fresh = makeEvidence({ scriptSegmentId: "b", assetVersionId: "av2" });
    const out = invalidateForNewAssetVersion([old, fresh], "av2");
    expect(out.map((e) => e.status)).toEqual(["stale", "candidate"]);
  });

  it("leaves rejected evidence rejected, so a dismissal sticks", () => {
    const rejected = makeEvidence({ scriptSegmentId: "a", status: "rejected" });
    expect(invalidateForNewAssetVersion([rejected], "av2")[0]).toEqual(rejected);
    expect(invalidateForScriptChange([rejected], [{ id: "a", hash: "changed" }])[0]).toEqual(
      rejected,
    );
  });

  it("also stales confirmed evidence", () => {
    const confirmed = makeEvidence({ scriptSegmentId: "a", status: "confirmed" });
    expect(invalidateForNewAssetVersion([confirmed], "av2")[0]?.status).toBe("stale");
  });
});
