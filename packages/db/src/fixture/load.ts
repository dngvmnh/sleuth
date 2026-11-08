import { GoldenFixtureSchema, type GoldenFixture } from "@sleuth/contracts";
import assetVersion from "../../../../fixtures/golden/proofpay-demo/asset-version.json";
import checklist from "../../../../fixtures/golden/proofpay-demo/checklist.json";
import expectedEvidence from "../../../../fixtures/golden/proofpay-demo/expected-evidence.json";
import expectedFindings from "../../../../fixtures/golden/proofpay-demo/expected-findings.json";
import frames from "../../../../fixtures/golden/proofpay-demo/frames.json";
import job from "../../../../fixtures/golden/proofpay-demo/job.json";
import project from "../../../../fixtures/golden/proofpay-demo/project.json";
import script from "../../../../fixtures/golden/proofpay-demo/script.json";
import transcript from "../../../../fixtures/golden/proofpay-demo/transcript.json";

/** The checked-in golden fixture, parsed with the contracts. Throws if it drifts from them. */
export function loadGoldenFixture(): GoldenFixture {
  return GoldenFixtureSchema.parse({
    project,
    assetVersion,
    script,
    checklist,
    transcript,
    frames,
    expectedEvidence,
    expectedFindings,
    job,
  });
}
