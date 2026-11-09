import { describe, expect, it } from "vitest";
import type { EvidenceStatus } from "@sleuth/contracts";
import { diffScriptVersions } from "./diff";
import { planReanalysis } from "./reanalysis";
import { makeEvidence } from "./test-helpers";

const seg = (id: string, hash: string) => ({ id, hash });
const ev = (segment: string, status: EvidenceStatus = "candidate") =>
  makeEvidence({ scriptSegmentId: segment, status });

describe("planReanalysis", () => {
  const prev = [seg("a", "1"), seg("b", "2"), seg("c", "3")];

  it("includes modified and added segments", () => {
    const diff = diffScriptVersions(prev, [
      seg("a", "1"),
      seg("b", "9"),
      seg("c", "3"),
      seg("d", "4"),
    ]);
    expect(planReanalysis(diff, [ev("a"), ev("c")])).toEqual(["b", "d"]);
  });

  it("leaves out unchanged segments that still have valid evidence", () => {
    const diff = diffScriptVersions(prev, prev);
    expect(planReanalysis(diff, [ev("a"), ev("b", "confirmed"), ev("c", "rejected")])).toEqual([]);
  });

  it("leaves out removed segments", () => {
    const diff = diffScriptVersions(prev, [seg("a", "1")]);
    expect(planReanalysis(diff, [ev("a"), ev("b", "stale"), ev("c", "stale")])).toEqual([]);
  });

  it("includes an unchanged segment whose evidence is all stale", () => {
    const diff = diffScriptVersions(prev, prev);
    expect(planReanalysis(diff, [ev("a", "stale"), ev("b")])).toEqual(["a"]);
  });

  it("does not include an unchanged segment with stale and fresh evidence", () => {
    const diff = diffScriptVersions(prev, prev);
    expect(planReanalysis(diff, [ev("a", "stale"), { ...ev("a"), id: "ev-a-2" }])).toEqual([]);
  });

  it("does not include an unchanged segment that never had evidence", () => {
    const diff = diffScriptVersions(prev, prev);
    expect(planReanalysis(diff, [])).toEqual([]);
  });

  it("plans every surviving segment when the video changed", () => {
    const diff = diffScriptVersions(prev, [seg("a", "1"), seg("b", "9"), seg("d", "4")]);
    expect(planReanalysis(diff, [], { assetChanged: true }).sort()).toEqual(["a", "b", "d"]);
  });

  it("lists modified before added, with no duplicates", () => {
    const diff = diffScriptVersions(prev, [seg("a", "7"), seg("b", "2"), seg("x", "8")]);
    expect(planReanalysis(diff, [ev("a", "stale")])).toEqual(["a", "x"]);
  });
});
