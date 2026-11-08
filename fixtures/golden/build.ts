import {
  GoldenFixtureSchema,
  type ChecklistItem,
  type FrameObservation,
  type GoldenFixture,
  type TranscriptSegment,
} from "@sleuth/contracts";
import { segmentScript } from "@sleuth/domain";
import { analyse } from "@sleuth/evidence-engine";

/**
 * Source of truth for `fixtures/golden/proofpay-demo/`. Edit the inputs here, run
 * `pnpm tsx fixtures/golden/generate.ts`, review the JSON diff, and commit both.
 * "ProofPay" is an invented product. No real footage is included: `storagePath` is a placeholder.
 */

export const PROJECT_ID = "proofpay-demo";
export const ASSET_ID = "av-1";
export const SCRIPT_ID = "sv-1";
export const RUN_ID = "run-golden-1";
export const DURATION_MS = 52000;
const CREATED = "2026-11-01T00:00:00.000Z";

export const SCRIPT_TEXT = [
  "Welcome to ProofPay, the invoicing tool for freelancers.",
  "First, click New Invoice to start a draft.",
  "Enter the client name and the amount of 1,250 dollars.",
  "Click Export to download the invoice as a PDF.",
  "All customer data is encrypted end to end.",
  "Thanks for watching.",
].join("\n");

const CHECKLIST_LABELS = [
  "Show the ProofPay welcome screen",
  "Create a new invoice",
  "Fill in the client and the amount",
  "Export the invoice as a PDF",
  "State that customer data is encrypted",
];

/** [startMs, endMs, text]. The fourth line is spoken but not in the script (unscripted). */
const SPEECH: [number, number, string][] = [
  [1000, 5000, "Welcome to ProofPay, the invoicing tool for freelancers."],
  [6000, 10000, "First, click New Invoice to start a draft."],
  [11000, 18000, "Now I enter the client name and an amount of 1,250 dollars."],
  [19000, 24000, "Then I save it and check the preview."],
  [30000, 35000, "ProofPay keeps all your customer data encrypted end to end."],
  [44000, 47000, "Thanks for watching."],
];

/** [timestampMs, description, onScreenText]. Timestamps are multiples of the 2000 ms sampling step. */
const FRAMES: [number, string, string[]][] = [
  [2000, "Home screen of the app with a logo", ["ProofPay"]],
  [4000, "Empty invoice list with a button in the top right", ["Invoices", "New Invoice"]],
  [8000, "New invoice form opens with empty fields", ["New Invoice", "Client", "Amount"]],
  [12000, "Form with the client field being typed in", ["Client", "Lumen Studio"]],
  [14000, "Amount field filled in", ["Amount", "1,250.00"]],
  [16000, "Completed invoice form", ["Client: Lumen Studio", "Amount: 1,250.00"]],
  [20000, "Saved invoice preview", ["Preview", "Invoice INV-001"]],
  [22000, "Preview page scrolled down", ["Preview"]],
  [32000, "Settings page with a security section", ["Settings", "Security"]],
  [46000, "Invoice list with one invoice", ["Invoices", "INV-001"]],
];

function words(text: string, startMs: number, endMs: number) {
  const parts = text.split(/\s+/).filter(Boolean);
  const total = parts.reduce((n, w) => n + w.length, 0);
  let cursor = startMs;
  return parts.map((w, i) => {
    const end =
      i === parts.length - 1 ? endMs : Math.round(cursor + ((endMs - startMs) * w.length) / total);
    const out = { text: w, startMs: Math.round(cursor), endMs: end };
    cursor = end;
    return out;
  });
}

export function buildGoldenFixture(): GoldenFixture {
  const segments = segmentScript(SCRIPT_TEXT, { scriptVersionId: SCRIPT_ID });
  const checklist: ChecklistItem[] = CHECKLIST_LABELS.map((label, i) => ({
    id: `ck-${i + 1}`,
    projectId: PROJECT_ID,
    label,
    position: i,
  }));
  const transcript: TranscriptSegment[] = SPEECH.map(([startMs, endMs, text], i) => ({
    id: `tr-${i + 1}`,
    projectId: PROJECT_ID,
    assetVersionId: ASSET_ID,
    startMs,
    endMs,
    text,
    words: words(text, startMs, endMs),
  }));
  const frames: FrameObservation[] = FRAMES.map(([timestampMs, description, onScreenText], i) => ({
    id: `fr-${i + 1}`,
    projectId: PROJECT_ID,
    assetVersionId: ASSET_ID,
    timestampMs,
    description,
    onScreenText,
  }));
  const { evidence, findings } = analyse({
    projectId: PROJECT_ID,
    assetVersionId: ASSET_ID,
    durationMs: DURATION_MS,
    analysisRunId: RUN_ID,
    segments,
    checklist,
    transcript,
    observations: frames,
  });
  return GoldenFixtureSchema.parse({
    project: {
      id: PROJECT_ID,
      name: "ProofPay demo (public example)",
      ownerId: null,
      isDemo: true,
      currentScriptVersionId: SCRIPT_ID,
      currentAssetVersionId: ASSET_ID,
      createdAt: CREATED,
    },
    assetVersion: {
      id: ASSET_ID,
      projectId: PROJECT_ID,
      version: 1,
      storagePath: "placeholder/proofpay-demo.mp4",
      mimeType: "video/mp4",
      durationMs: DURATION_MS,
      createdAt: CREATED,
    },
    script: {
      id: SCRIPT_ID,
      projectId: PROJECT_ID,
      version: 1,
      text: SCRIPT_TEXT,
      segments,
      createdAt: CREATED,
    },
    checklist,
    transcript,
    frames,
    expectedEvidence: evidence,
    expectedFindings: findings,
    job: {
      id: "job-demo-1",
      projectId: PROJECT_ID,
      kind: "analysis",
      status: "queued",
      attempts: 0,
      maxAttempts: 3,
      lockedBy: null,
      heartbeatAt: null,
      error: null,
      payload: { assetVersionId: ASSET_ID, scriptVersionId: SCRIPT_ID },
      createdAt: CREATED,
      updatedAt: CREATED,
    },
  });
}

/** File name (without .json) for each part of the fixture. */
export const FIXTURE_FILES = {
  project: "project",
  assetVersion: "asset-version",
  script: "script",
  checklist: "checklist",
  transcript: "transcript",
  frames: "frames",
  expectedEvidence: "expected-evidence",
  expectedFindings: "expected-findings",
  job: "job",
} as const satisfies Record<keyof GoldenFixture, string>;
