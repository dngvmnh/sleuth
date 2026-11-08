# Evidence analysis: design

## Where things are today

- Interfaces and mocks: `packages/media/src/providers.ts`, `mocks.ts`, `validate.ts`.
- Matching: `packages/evidence-engine/src/analyse.ts` (word overlap, fixed window), `text.ts`, `frames.ts` (`planFrames`), `merge.ts`, `pipeline.ts` (`runPipeline`).
- Worker: `apps/worker/src/{loop,handlers,fixture-queue,pg-queue}.ts`. Fixture mode reads `fixtures/golden/proofpay-demo`, writes `.sleuth-out/analysis-output.json`. Supabase mode fails loudly.
- Golden fixture: `fixtures/golden/build.ts` calls `analyse()`. The contract test also runs `runPipeline` with mocks and expects identical output.

## Pipeline

```
video file
  -> probe duration (ffprobe)            reject > 180 s
  -> extract audio (ffmpeg, mono 16k)   -> TranscriptionProvider -> validate
  -> sample frames (planFrames, <= 60)  -> VideoAnalysisProvider -> validate
  -> align(script segments, transcript)  -> AlignmentResult
  -> match(alignment, observations, checklist) -> candidates + findings
  -> merge into stored candidates/findings (idempotent)
```

Each stage is a pure function over validated data, except the three that touch the outside (FFmpeg, two providers). The outside stages sit in `packages/media` (FFmpeg wrapper, provider adapters) so `packages/evidence-engine` stays pure and testable without a binary or network.

## Modules

### `packages/media/src/ffmpeg.ts`
`probeDurationMs(path)`, `extractAudio(path, outPath)`, `extractFrames(path, timestampsMs, outDir)`. Wraps `ffprobe` and `ffmpeg` with `child_process.execFile` (no shell, arguments as an array, so a file name can never inject a command). Timeouts on every call. Errors become `MediaError(step, code)` with no paths or content in the message. Tests generate a tiny clip with `ffmpeg -f lavfi` so no footage file is needed; they skip when `ffmpeg` is missing.

### `packages/media/src/providers/*.ts`
One adapter per real provider, chosen by Bảo (decision recorded as ADR 0007 before task 4). Adapter rules:
- Input is a file path plus ids; output is parsed with the contract schemas.
- Timeouts, bounded retries with backoff, and a hard cap on calls per job.
- Tests use recorded responses checked into `packages/media/src/providers/__fixtures__/` (synthetic text, no real user content). No network in CI.
- Keys come from `TRANSCRIPTION_API_KEY` and `VIDEO_ANALYSIS_API_KEY`. A missing key fails the job with `provider_not_configured`.
- Provider choice is read from `TRANSCRIPTION_PROVIDER` / `VIDEO_ANALYSIS_PROVIDER` (`mock` by default).

### `packages/evidence-engine/src/align.ts`
```ts
type AlignmentLabel = "exact" | "changed" | "missing" | "reordered";
interface AlignedSegment { segmentId: string; label: AlignmentLabel; transcriptId: string | null; coverage: number }
interface AlignmentResult { aligned: AlignedSegment[]; unscripted: string[] /* transcript ids */ }
align(segments, transcript): AlignmentResult
```
Method: score every (segment, transcript segment) pair by key-word coverage (existing `coverage`), then pick matches with a greedy best-first assignment so one transcript segment serves one script segment. Order check: compute the longest increasing subsequence of matched transcript indices; matched segments outside it are `reordered`. Thresholds live in one `thresholds.ts`: 0.6 spoken, 0.85 exact.

The current `analyse()` is refactored to call `align()` first. Output for the golden fixture must not change (the contract test guards this).

### Matching and confidence
Window and distance rules move to `match.ts`. Confidence rules (documented in `docs/evidence-confidence.md`, written in task 7):
- high: exact alignment and at least 2 key words on a frame within the spoken interval
- medium: changed alignment, or only 1 key word, or frame outside the spoken interval but inside the window
- low: everything else that still yields a candidate, and all outside-proof candidates

Every number printed in an explanation comes from the same object that decided the confidence, so text and decision cannot drift.

### Explanations
`explain.ts` builds `{ found, notFound, limits }` for each finding type from typed inputs. A property test feeds random inputs and asserts the three parts are non-empty and contain no raw transcript text beyond the script line the user wrote.

### Outside proof
`outside-proof-terms.ts` exports the list and a `classify(text)` that returns the matched term and a proof hint ("security report", "compliance certificate", "benchmark"). The finding text uses the hint.

### Worker integration
`apps/worker/src/handlers.ts` gains `createSupabaseHandler({ db, storage, providers, config })`:
1. load job, asset, script segments, checklist (Drizzle, service role);
2. download video to a temp dir, run FFmpeg steps;
3. run `runPipeline`;
4. in one transaction: `mergeEvidence`, `mergeFindings`, store transcript and observations, set job status via the queue;
5. delete temp files in `finally`.
It depends on the ingestion Supabase store (ingestion tasks 5 to 7). Until then, tasks 1 to 8 run against fixtures and local files.

## Evaluation harness

```
tests/evaluation/
  clips/<name>/clip.json      script, checklist, durationMs, source video file name (video not committed unless small and ours)
  clips/<name>/labels.json    expected findings per segment/checklist item, written by a person who watched it
  run.ts                      loads clips, runs the pipeline with chosen providers, compares
  report.ts                   precision and recall per finding type, list of disagreements
```
`pnpm eval` runs `tsx tests/evaluation/run.ts`. With `--providers mock` it feeds the clip's `mock-inputs.json` (transcript and observations written by hand) through the real alignment and matching, which tests our logic. With real providers it measures end to end. Output is a JSON file under `tests/evaluation/results/` (gitignored) and a table on screen with the provider names and clip count in the header.

## Error handling and privacy

- Job errors are short strings `step: code`. No transcript text, frames, URLs or keys.
- Temp files go under the OS temp dir in a per-job folder and are removed in `finally`, including on failure.
- Provider payloads are never written to logs, even at debug level.

## Testing

- Unit tests per module; property tests as marked in the requirements.
- Golden fixture contract test must pass unchanged.
- FFmpeg tests use generated clips.
- Provider adapter tests use recorded responses.
- Evaluation harness runs in CI with mock providers.

## Open questions

- Which providers (cost, 180-second limit, word timestamps, on-screen text). Bảo decides and writes ADR 0007.
- Whether unscripted and reordered lines deserve their own finding types. Today they are explanation text only, because adding a type is a contract change that touches every area. Raise with Đăng after the first evaluation run.
- Where large evaluation videos live (Git LFS or outside the repo).
