import { describe, expect, it } from "vitest";
import { signerLabel, UUID_PATTERN } from "./signer";

const ALICE = "24c9177b-c629-4203-b740-f603ebe0646c";
const BOB = "0b1e2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d";

describe("signerLabel", () => {
  it("says you when the viewer signed", () => {
    expect(signerLabel(ALICE, ALICE, ALICE)).toBe("you");
    expect(signerLabel(ALICE, ALICE, null)).toBe("you");
  });

  it("says the project owner when someone else, the owner, signed", () => {
    expect(signerLabel(ALICE, BOB, ALICE)).toBe("the project owner");
    expect(signerLabel(ALICE, null, ALICE)).toBe("the project owner");
  });

  it("says a reviewer when it cannot tell", () => {
    expect(signerLabel(ALICE, BOB, BOB)).toBe("a reviewer");
    expect(signerLabel(ALICE, null, null)).toBe("a reviewer");
    expect(signerLabel(ALICE, undefined, undefined)).toBe("a reviewer");
  });

  it("never returns an id or an e-mail address", () => {
    for (const viewer of [ALICE, BOB, null]) {
      for (const owner of [ALICE, BOB, null]) {
        const label = signerLabel(ALICE, viewer, owner);
        expect(label).not.toMatch(UUID_PATTERN);
        expect(label).not.toContain("@");
      }
    }
  });

  it("recognises an 8-4-4-4-12 hex id", () => {
    expect(UUID_PATTERN.test(`Signed off by ${ALICE} at`)).toBe(true);
    expect(UUID_PATTERN.test("Signed off by you at 2026-11-14 13:30 UTC.")).toBe(false);
  });
});
