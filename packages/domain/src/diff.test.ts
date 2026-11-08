import { describe, expect, it } from "vitest";
import { diffScriptVersions } from "./diff";

const seg = (id: string, hash: string) => ({ id, hash });

describe("diffScriptVersions", () => {
  it("reports unchanged segments", () => {
    const v = [seg("a", "1"), seg("b", "2")];
    expect(diffScriptVersions(v, v)).toEqual({
      added: [],
      modified: [],
      removed: [],
      unchanged: ["a", "b"],
    });
  });

  it("reports a changed hash as modified", () => {
    expect(diffScriptVersions([seg("a", "1")], [seg("a", "9")]).modified).toEqual(["a"]);
  });

  it("reports new ids as added and missing ids as removed", () => {
    const diff = diffScriptVersions([seg("a", "1"), seg("b", "2")], [seg("a", "1"), seg("c", "3")]);
    expect(diff.added).toEqual(["c"]);
    expect(diff.removed).toEqual(["b"]);
    expect(diff.unchanged).toEqual(["a"]);
  });
});
