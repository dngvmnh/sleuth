import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { FrameObservation, TranscriptSegment } from "@sleuth/contracts";
import { segmentScript } from "@sleuth/domain";
import { runPipeline } from "@sleuth/evidence-engine";
import { createMockTranscriptionProvider, type VideoAnalysisProvider } from "@sleuth/media";
import {
  formatReport,
  scoreClip,
  summarise,
  type ClipScore,
  type ProducedAnalysis,
  type ProducedFinding,
} from "./report";
import {
  ClipSchema,
  LabelledTypeSchema,
  LabelsSchema,
  MockInputsSchema,
  type Clip,
  type Labels,
  type MockInputs,
} from "./schema";

const HERE = dirname(fileURLToPath(import.meta.url));
const PROJECT_ID = "eval";
const ASSET_VERSION_ID = "eval-av";

export interface LoadedClip {
  clip: Clip;
  labels: Labels | null;
  mock: MockInputs | null;
}

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf8")) as unknown;
}

/** Reads one clip folder. Throws a short message naming the file when a file does not match the format. */
export function loadClip(dir: string): LoadedClip {
  const parse = <T>(file: string, schema: { parse(input: unknown): T }): T => {
    try {
      return schema.parse(readJson(join(dir, file)));
    } catch (error) {
      throw new Error(`${file} in ${dir} does not match the clip format: ${String(error)}`, {
        cause: error,
      });
    }
  };
  const clip = parse("clip.json", ClipSchema);
  const has = (file: string) => existsSync(join(dir, file));
  return {
    clip,
    labels: has("labels.json") ? parse("labels.json", LabelsSchema) : null,
    mock: has("mock-inputs.json") ? parse("mock-inputs.json", MockInputsSchema) : null,
  };
}

/** Why a clip cannot be scored yet, or null when it can. */
export function notReadyReason(loaded: LoadedClip, providers: "mock"): string | null {
  if (loaded.clip.durationMs === null) return "not recorded yet (durationMs is empty)";
  if (loaded.labels === null) return "no labels.json";
  if (providers === "mock" && loaded.mock === null)
    return "no mock-inputs.json (needed for --providers mock)";
  return null;
}

/** A video provider that returns every hand-written observation as given. Sampling is not simulated. */
function inputObservations(canned: readonly FrameObservation[]): VideoAnalysisProvider {
  return { name: "mock", analyse: () => Promise.resolve([...canned]) };
}

/** Runs the real alignment and matching code on one clip's hand-written transcript and frames. */
export async function analyseWithMock(clip: Clip, mock: MockInputs): Promise<ProducedAnalysis> {
  const durationMs = clip.durationMs ?? 0;
  const segments = segmentScript(clip.script.join("\n"), { scriptVersionId: `${clip.name}-sv` });
  if (segments.length !== clip.script.length)
    throw new Error(
      `${clip.name}: the script splits into ${segments.length} lines but clip.json lists ${clip.script.length}`,
    );
  const transcript: TranscriptSegment[] = mock.transcript.map((t, i) => ({
    id: `t${i + 1}`,
    projectId: PROJECT_ID,
    assetVersionId: ASSET_VERSION_ID,
    startMs: t.startMs,
    endMs: t.endMs,
    text: t.text,
    words: [],
  }));
  const observations: FrameObservation[] = mock.observations.map((o, i) => ({
    id: `f${i + 1}`,
    projectId: PROJECT_ID,
    assetVersionId: ASSET_VERSION_ID,
    timestampMs: o.timestampMs,
    description: o.description,
    onScreenText: o.onScreenText,
  }));
  const result = await runPipeline({
    projectId: PROJECT_ID,
    assetVersionId: ASSET_VERSION_ID,
    durationMs,
    analysisRunId: `${clip.name}-run`,
    segments,
    checklist: clip.checklist.map((label, i) => ({
      id: `c${i + 1}`,
      projectId: PROJECT_ID,
      label,
      position: i,
    })),
    transcription: createMockTranscriptionProvider(transcript),
    videoAnalysis: inputObservations(observations),
    frameIntervalMs: 2000,
    maxFrames: 60,
  });

  const lineOf = new Map(segments.map((s, i) => [s.id, i + 1]));
  const itemOf = new Map(clip.checklist.map((_, i) => [`c${i + 1}`, i + 1]));
  const findings: ProducedFinding[] = [];
  for (const f of result.findings) {
    const type = LabelledTypeSchema.safeParse(f.type);
    if (!type.success) continue;
    if (type.data === "ghost") {
      const item = f.checklistItemId ? itemOf.get(f.checklistItemId) : undefined;
      if (item !== undefined) findings.push({ type: "ghost", checklistItem: item });
    } else {
      const line = f.scriptSegmentId ? lineOf.get(f.scriptSegmentId) : undefined;
      if (line !== undefined) findings.push({ type: type.data, scriptLine: line });
    }
  }
  const byId = new Map(transcript.map((t) => [t.id, t]));
  return {
    findings,
    unscripted: result.alignment.unscripted.flatMap((id) => {
      const t = byId.get(id);
      return t ? [{ startMs: t.startMs, endMs: t.endMs }] : [];
    }),
    reordered: result.alignment.aligned.flatMap((a) =>
      a.label === "reordered" ? [lineOf.get(a.segmentId) ?? 0] : [],
    ),
  };
}

export interface EvaluationResult {
  providers: "mock";
  clipsRun: string[];
  skipped: { clip: string; reason: string }[];
  scores: ClipScore[];
}

/** Scores every ready clip folder under `clipsDir`. */
export async function evaluate(
  clipsDir: string,
  providers: "mock" = "mock",
): Promise<EvaluationResult> {
  const names = readdirSync(clipsDir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && existsSync(join(clipsDir, e.name, "clip.json")))
    .map((e) => e.name)
    .sort();
  const result: EvaluationResult = { providers, clipsRun: [], skipped: [], scores: [] };
  for (const name of names) {
    const loaded = loadClip(join(clipsDir, name));
    const reason = notReadyReason(loaded, providers);
    if (reason !== null || loaded.labels === null || loaded.mock === null) {
      result.skipped.push({ clip: name, reason: reason ?? "not ready" });
      continue;
    }
    const produced = await analyseWithMock(loaded.clip, loaded.mock);
    result.clipsRun.push(name);
    result.scores.push(scoreClip(name, loaded.labels, produced));
  }
  return result;
}

function option(args: readonly string[], name: string): string | undefined {
  const at = args.indexOf(name);
  return at === -1 ? undefined : args[at + 1];
}

export async function main(args: readonly string[]): Promise<number> {
  const providers = option(args, "--providers") ?? "mock";
  if (providers !== "mock") {
    console.error(
      `provider_not_configured: --providers ${providers} is not available yet. ` +
        "Real providers arrive with evidence-analysis task 10; use --providers mock.",
    );
    return 2;
  }
  const clipsDir = resolve(option(args, "--clips") ?? join(HERE, "clips"));
  const resultsDir = resolve(option(args, "--results") ?? join(HERE, "results"));
  const result = await evaluate(clipsDir, "mock");
  console.log(
    formatReport({
      providers: result.providers,
      clipsRun: result.clipsRun,
      skipped: result.skipped,
      scores: result.scores,
    }),
  );
  mkdirSync(resultsDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const file = join(resultsDir, `${stamp}-${result.providers}.json`);
  writeFileSync(
    file,
    JSON.stringify(
      { ...result, summary: summarise(result.scores), ranAt: new Date().toISOString() },
      null,
      2,
    ),
  );
  console.log(`\nResults written to ${file}`);
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (error: unknown) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    },
  );
}
