# Evidence analysis: tasks

All tasks are Phạm Quốc Bảo's (@baofrovn), half a day or less. Tasks 1 to 9 run against fixtures, generated clips and recorded responses with no keys. Task 10 and 11 need keys or the ingestion work. After every task: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:property`, `pnpm check:contracts` (the golden fixture test must stay green; if it must change, ask Đăng).

- [x] 1. FFmpeg wrapper: probe and audio extraction
  - Owner: Bảo
  - Files: `packages/media/src/ffmpeg.ts`, `packages/media/src/ffmpeg.test.ts`, `packages/media/src/index.ts`
  - Do: `probeDurationMs`, `extractAudio` with `execFile` and argument arrays; `MediaError(step, code)`; tests build a 3-second clip with `ffmpeg -f lavfi` in a temp dir, skip when FFmpeg is missing.
  - Done when: tests pass on your machine (FFmpeg 9.0.1 is installed) and a missing binary gives a clear `ffmpeg_missing` error.
  - Requirements: 1.1, 1.2, 1.5

- [x] 2. Frame extraction and cleanup
  - Owner: Bảo
  - Files: `packages/media/src/ffmpeg.ts`, `packages/media/src/ffmpeg.test.ts`, `packages/evidence-engine/src/frames.property.test.ts`
  - Do: `extractFrames(path, timestampsMs, outDir)`; a `withTempDir(fn)` helper that always deletes; property test for `planFrames`.
  - Done when: property test passes for durations 0..180000 and budgets 1..120; a test proves the temp dir is gone after a thrown error.
  - Requirements: 1.3, 1.4

- [ ] 3. Provider decision and ADR
  - Owner: Bảo
  - Files: `docs/decisions/0007-provider-choice.md`
  - Do: compare 2 to 3 options for transcription and for video analysis on: word timestamps, on-screen text, 180-second clips, price per run, data handling terms. Pick one each. No keys needed to write this.
  - Done when: ADR merged with the choice and the per-run cost estimate; Đăng sets the hard monthly spending limit on the team account.
  - Requirements: 2.1, 4.1, 4.3

- [x] 4. Output validation hardening
  - Owner: Bảo
  - Files: `packages/media/src/validate.ts`, `packages/media/src/validate.property.test.ts`
  - Do: property tests for 2.2 and 4.2 (random segments and observations, including NaN, negative, fractional and out-of-range values).
  - Done when: after validation every kept item satisfies the bounds and integers; rejected counts are correct.
  - Requirements: 2.2, 4.2

- [x] 5. Script alignment
  - Owner: Bảo
  - Files: `packages/evidence-engine/src/align.ts`, `thresholds.ts`, `align.test.ts`, `align.property.test.ts`, `analyse.ts`
  - Do: implement `align()` as designed; refactor `analyse()` to use it with no change to golden output.
  - Done when: unit tests cover exact, changed, missing, reordered and unscripted; property tests for 3.3 and 3.5 pass; golden contract test unchanged.
  - Requirements: 3.1 to 3.5

- [x] 6. Matching, confidence rules and explanations
  - Owner: Bảo
  - Files: `packages/evidence-engine/src/match.ts`, `explain.ts`, `analyse.ts`, `explain.property.test.ts`, `docs/evidence-confidence.md`
  - Do: move window and confidence logic into `match.ts`; build explanations in `explain.ts`; document the confidence rules in plain English.
  - Done when: property tests for 5.2 and 5.4 pass; the doc matches the code (the test imports the same constants); golden output unchanged.
  - Requirements: 5.1 to 5.6

- [ ] 7. Outside-proof classifier
  - Owner: Bảo
  - Files: `packages/evidence-engine/src/outside-proof-terms.ts`, `text.ts`, `outside-proof.test.ts`
  - Do: move the term list out of `text.ts`, add proof hints, add tests with at least 20 phrases (10 that must be flagged, 10 ordinary steps that must not).
  - Done when: no ordinary step is flagged; the finding text names the kind of proof.
  - Requirements: 6.1 to 6.3

- [ ] 8. Idempotency property tests through the pipeline
  - Owner: Bảo
  - Files: `packages/evidence-engine/src/pipeline.property.test.ts`
  - Do: run `runPipeline` twice with mock providers on random inputs and merge; also with a human decision applied between runs.
  - Done when: no duplicates, human decisions with unchanged hash survive, timestamps stay in bounds.
  - Requirements: 5.7

- [ ] 9. Evaluation harness skeleton with mock providers
  - Owner: Bảo
  - Files: `tests/evaluation/run.ts`, `report.ts`, `tests/evaluation/clips/example/clip.json`, `labels.json`, `mock-inputs.json`, `package.json` (`eval` script), `.gitignore` (results folder)
  - Do: harness as designed with one tiny example clip written by hand (text only, no video); prints precision and recall per finding type and every disagreement; header names provider and clip count.
  - Done when: `pnpm eval` prints a table; a deliberately wrong label shows up as a disagreement. Needs a root `package.json` change: ask Đăng to review.
  - Requirements: 7.2, 7.3

- [ ] 10. Real provider adapters (needs API keys)
  - Owner: Bảo
  - Files: `packages/media/src/providers/transcription-<name>.ts`, `video-analysis-<name>.ts`, `packages/media/src/providers/__fixtures__/` (recorded responses), tests
  - Do: implement the two adapters chosen in task 3 behind the interfaces; timeouts, bounded retries, call cap, cost ceiling; recorded-response tests; a manual script that runs one 30-second clip and prints counts only.
  - Done when: tests pass with recorded responses and no network; the manual run returns validated data; no key or content appears in logs (grep the run output).
  - Requirements: 2.1, 2.3, 2.4, 4.1, 4.3, 4.4

- [ ] 11. Record and label three clips, write the protocol
  - Owner: Bảo
  - Files: `tests/evaluation/clips/clip-1` to `clip-3`, `docs/evaluation-protocol.md`
  - Do: record three demo clips of our own (different screens; one with a deliberately missing step, one with a security claim). Write `labels.json` by watching the clip, without looking at tool output. Videos stay out of Git unless under 5 MB; note where they live. The protocol says who recorded and who labelled each clip.
  - Done when: three clips with labels exist and the protocol is merged. Tasks 14 and 15 add two more.
  - Requirements: 7.1

- [ ] 12. Supabase worker handler (needs ingestion tasks 5 to 7)
  - Owner: Bảo
  - Files: `apps/worker/src/handlers.ts`, `apps/worker/src/supabase-handler.ts`, `apps/worker/src/supabase-handler.test.ts`
  - Do: handler as designed; download video, run FFmpeg and pipeline, merge in a transaction, clean up in `finally`; honour `segmentIds`.
  - Done when: a job queued through the API on the dev project reaches `succeeded` with candidates in the database; a forced failure leaves no temp files and the job retried then failed.
  - Requirements: 8.1 to 8.3, 1.4

- [ ] 13. First evaluation run and write-up
  - Owner: Bảo
  - Files: `docs/evaluation-results.md`
  - Do: run `pnpm eval` with real providers on the five clips; record the printed table, provider names, date, and the three worst disagreements with a guess at why.
  - Done when: the document contains only numbers the harness printed. This feeds the Devpost text.
  - Requirements: 7.4

- [ ] 14. Record and label one clip with a reordered line
  - Owner: Đạt (@phatdat220707)
  - Files: `tests/evaluation/clips/clip-4`
  - Do: record a 60 to 120 second demo of the SLEUTH UI in which the presenter says two script lines in the wrong order. Write `clip.json` and `labels.json` following `docs/evaluation-protocol.md` (task 11). Do not run the tool before labelling.
  - Done when: the clip folder is merged with labels; Bảo reviews the format only.
  - Requirements: 7.1

- [ ] 15. Record and label one clip with an unscripted line
  - Owner: Đạt (@phatdat220707)
  - Files: `tests/evaluation/clips/clip-5`
  - Do: record a 60 to 120 second demo of the API or database flow in which the presenter adds a sentence that is not in the script. Label it by watching, before running the tool.
  - Done when: the clip folder is merged with labels; Bảo reviews the format only.
  - Requirements: 7.1

- [ ] 16. Queue claim test on a real Postgres (needs database; after ingestion task 5)
  - Owner: Bảo
  - Files: `apps/worker/src/pg-queue.test.ts`
  - Do: start two `createPgQueue` claimers against one queued job and prove only one gets it; prove a job whose heartbeat is older than `WORKER_STALE_SECONDS` is claimed again, and one with no attempts left is marked failed. Skip when `TEST_DATABASE_URL` is unset. This is the first time the claim SQL runs against Postgres: record the result in the journal.
  - Done when: the test passes on the dev project's database or a local Postgres.
  - Requirements: 8.3
