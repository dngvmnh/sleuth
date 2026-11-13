/**
 * Unit test for the option parsing of scripts/prod-e2e.ts. No network: importing the script does
 * not run it. The vitest projects do not include `scripts/`, so run it with Node's test runner:
 *
 *   pnpm tsx --test scripts/prod-e2e.test.ts
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { SPEECH_ONLY_MARK, signInModeOf, speechOnlyCount } from "./prod-e2e";

test("no team settings means a guest", () => {
  assert.deepEqual(signInModeOf({}), { mode: "guest" });
  assert.deepEqual(signInModeOf({ PROD_E2E_EMAIL: "  ", PROD_E2E_PASSWORD: "" }), {
    mode: "guest",
  });
});

test("both team settings mean the team account", () => {
  assert.deepEqual(
    signInModeOf({ PROD_E2E_EMAIL: " a@example.invalid ", PROD_E2E_PASSWORD: "p w" }),
    {
      mode: "team",
      email: "a@example.invalid",
      password: "p w",
    },
  );
});

test("only one team setting is an error that names no value", () => {
  for (const env of [
    { PROD_E2E_EMAIL: "a@example.invalid" },
    { PROD_E2E_PASSWORD: "secret-password" },
  ]) {
    const out = signInModeOf(env);
    assert.equal(out.mode, "error");
    const text = JSON.stringify(out);
    assert.ok(!text.includes("a@example.invalid"));
    assert.ok(!text.includes("secret-password"));
  }
});

test("counts speech-only findings by their limits text", () => {
  const note = `${SPEECH_ONLY_MARK}: no video frames were analysed, so nothing on screen was checked.`;
  assert.equal(speechOnlyCount([]), "0 of 0");
  assert.equal(
    speechOnlyCount([
      { limits: `${note} Frames are sampled.` },
      { limits: "Frames are sampled." },
      {},
    ]),
    "1 of 3",
  );
});
