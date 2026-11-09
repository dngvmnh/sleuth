import { describe, expect, it } from "vitest";
import { SEGMENT_STATES } from "@sleuth/domain";
import { STATE_LABELS } from "./state";

// The state rules are tested in packages/domain (segment-state.test.ts and the property test).
// This file only checks the frontend labels.
describe("STATE_LABELS", () => {
  it("has a label for every state the domain can return", () => {
    expect(Object.keys(STATE_LABELS).sort()).toEqual([...SEGMENT_STATES].sort());
  });

  it("gives every state a name and a plain-English label", () => {
    for (const label of Object.values(STATE_LABELS)) {
      expect(label.name.length).toBeGreaterThan(0);
      expect(label.plain.length).toBeGreaterThan(0);
    }
  });

  it("pairs each finding state with its spooky and plain names from the product table", () => {
    expect(STATE_LABELS.uncovered).toMatchObject({ name: "Ghost", plain: "No visual evidence" });
    expect(STATE_LABELS.needs_review).toMatchObject({ name: "Cursed Frame", plain: "Needs human check" });
    expect(STATE_LABELS.stale).toMatchObject({ name: "Poltergeist", plain: "Evidence out of date" });
    expect(STATE_LABELS.outside_proof).toMatchObject({
      name: "Needs Outside Proof",
      plain: "Footage cannot prove this",
    });
  });
});
