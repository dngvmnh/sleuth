import { describe, expect, it } from "vitest";
import { SPEECH_ONLY_MARK, signInModeOf, speechOnlyCount } from "./prod-e2e";

// Unit test for the option parsing of scripts/prod-e2e.ts. No network: importing the script does
// not run it (it runs only when called as a script). Runs with `pnpm test` and in CI.

describe("signInModeOf (scripts/prod-e2e.ts)", () => {
  it("means a guest when no team setting is set", () => {
    expect(signInModeOf({})).toEqual({ mode: "guest" });
    expect(signInModeOf({ PROD_E2E_EMAIL: "  ", PROD_E2E_PASSWORD: "" })).toEqual({
      mode: "guest",
    });
  });

  it("means the team account when both are set", () => {
    expect(
      signInModeOf({ PROD_E2E_EMAIL: " a@example.invalid ", PROD_E2E_PASSWORD: "p w" }),
    ).toEqual({ mode: "team", email: "a@example.invalid", password: "p w" });
  });

  it("is an error that names no value when only one is set", () => {
    for (const env of [
      { PROD_E2E_EMAIL: "a@example.invalid" },
      { PROD_E2E_PASSWORD: "secret-password" },
    ]) {
      const out = signInModeOf(env);
      expect(out.mode).toBe("error");
      const text = JSON.stringify(out);
      expect(text).not.toContain("a@example.invalid");
      expect(text).not.toContain("secret-password");
    }
  });
});

describe("speechOnlyCount (scripts/prod-e2e.ts)", () => {
  it("counts findings whose limits say the run was speech only", () => {
    const note = `${SPEECH_ONLY_MARK}: no video frames were analysed, so nothing on screen was checked.`;
    expect(speechOnlyCount([])).toBe("0 of 0");
    expect(
      speechOnlyCount([
        { limits: `${note} Frames are sampled.` },
        { limits: "Frames are sampled." },
        {},
      ]),
    ).toBe("1 of 3");
  });
});
