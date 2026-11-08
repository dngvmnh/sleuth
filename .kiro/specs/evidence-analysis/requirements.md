# Evidence analysis: requirements

Owner: Phạm Quốc Bảo (@baofrovn). Covers FFmpeg audio extraction and frame sampling, transcription, script alignment (missing, changed, reordered, unscripted lines), video analysis, candidate matching, explanations, confidence, Needs Outside Proof classification, and an evaluation harness.

Today (Phase 2) `analyse()` in `packages/evidence-engine/src/analyse.ts` does word-overlap matching on the mock fixture, `runPipeline()` runs it with mock providers, and the worker's fixture mode writes JSON. This spec replaces the shortcuts with real stages behind the same interfaces. The mock providers and the golden fixture test must keep passing after every task.

`[PBT]` marks a criterion that a fast-check property test must cover.

## 1. Media preparation (FFmpeg)

1.1 WHEN a job names a video file, THE WORKER SHALL read its duration with FFmpeg's probe and reject the job with a short error if the duration is above `MAX_VIDEO_SECONDS` (180) or cannot be read.

1.2 WHEN the video is accepted, THE WORKER SHALL extract mono 16 kHz audio to a temporary file.

1.3 THE WORKER SHALL sample frames at a fixed interval and never more than `MAX_FRAMES_PER_VIDEO` (60); WHEN the interval would give more, it SHALL widen the interval. [PBT: for any duration 0..180000 ms and budget, count <= budget, first timestamp is 0, last <= duration, all integers.]

1.4 WHEN a job finishes or fails, THE WORKER SHALL delete its temporary audio and frames.

1.5 IF FFmpeg is missing or exits with an error, THEN THE WORKER SHALL fail the job with a message that names the step and contains no file content.

## 2. Transcription

2.1 THE SYSTEM SHALL call speech to text only through `TranscriptionProvider` and SHALL keep the mock provider working.

2.2 WHEN a provider returns segments, THE SYSTEM SHALL parse them with `TranscriptSegmentSchema` and drop any segment that fails or ends after the video duration, counting the dropped ones. [PBT: after validation, every kept segment satisfies `0 <= startMs <= endMs <= durationMs`.]

2.3 IF the provider call fails or times out, THEN THE SYSTEM SHALL retry within the job's attempt limit and then fail the job with the provider name and an error class, never the audio or text.

2.4 THE SYSTEM SHALL record word-level timestamps when the provider gives them.

## 3. Script alignment

3.1 WHEN a transcript and a script exist, THE SYSTEM SHALL align each script segment to at most one transcript segment and label it `exact`, `changed`, `missing` or `reordered`.

3.2 THE SYSTEM SHALL label a script segment `missing` when no transcript segment covers at least 60% of its key words, and `changed` when the best match covers between 60% and 85%. A `missing` segment SHALL produce a Phantom Dialogue finding.

3.3 THE SYSTEM SHALL label a segment `reordered` when its matched transcript segment is out of order relative to its neighbours, and SHALL say so in the finding or evidence explanation. [PBT: aligning a script to a transcript built from the same sentences in script order never yields `reordered`, `missing` or `changed`.]

3.4 THE SYSTEM SHALL list transcript segments that match no script segment as unscripted lines in the analysis result.

3.5 THE SYSTEM SHALL use each transcript segment for at most one script segment unless two script lines are identical. [PBT: no transcript segment is matched to two different non-identical script lines.]

## 4. Video analysis

4.1 THE SYSTEM SHALL call frame or clip analysis only through `VideoAnalysisProvider` and SHALL keep the mock provider working.

4.2 WHEN a provider returns observations, THE SYSTEM SHALL parse them with `FrameObservationSchema`, drop any that fail or sit after the video duration, and count the dropped ones. [PBT: every kept observation has an integer timestamp within 0..durationMs.]

4.3 THE SYSTEM SHALL cap provider calls per job by the frame budget and a configurable cost ceiling, and SHALL fail the job with `budget_exceeded` before exceeding it.

4.4 THE SYSTEM SHALL NOT send audio, frames or text to any provider other than the one named in config, and SHALL NOT log them.

## 5. Candidate matching, explanations and confidence

5.1 WHEN a script segment has a spoken match, THE SYSTEM SHALL look for frame observations within the matched interval plus a fixed window and create at most one `EvidenceCandidate` per script segment and video version, with `status: "candidate"` and `source: "ai"`.

5.2 THE SYSTEM SHALL NEVER create evidence with status `confirmed` or source `human`. [PBT: for any input, no produced candidate is confirmed or human-sourced.]

5.3 THE SYSTEM SHALL assign `high`, `medium` or `low` confidence by documented rules (spoken coverage, number of matching key words, frame distance) and SHALL describe confidence in every explanation as a ranking, not proof.

5.4 THE SYSTEM SHALL give every candidate and every finding an explanation that states what was found, what was not found, and the limits of the check. [PBT: for any input, no finding has an empty `found`, `notFound` or `limits`.]

5.5 WHEN a candidate would be `medium` or `low`, THE SYSTEM SHALL also create a Cursed Frame finding so a person must check it.

5.6 WHEN a checklist item has no candidate with visual evidence and is not outside proof, THE SYSTEM SHALL create a Ghost finding that says which frames were checked.

5.7 Running the same analysis twice SHALL create no duplicate candidates or findings and SHALL keep human decisions whose segment hash is unchanged. [PBT: `mergeEvidence(mergeEvidence(a, b), b)` equals `mergeEvidence(a, b)`; timestamps stay within bounds.]

## 6. Needs Outside Proof

6.1 WHEN a script segment contains a claim from the outside-proof term list (security, encryption, compliance, guarantees, absolutes such as "always" and "never", performance superlatives), THE SYSTEM SHALL create a Needs Outside Proof finding and a candidate with status `needs_outside_proof`, and SHALL NOT attach frames as evidence for it.

6.2 THE SYSTEM SHALL keep the term list in one file that the team can extend without code changes elsewhere.

6.3 The finding SHALL say that footage cannot prove the claim and what kind of proof could (document, certificate, audit report).

## 7. Evaluation harness

7.1 THE REPOSITORY SHALL hold at least 5 hand-labelled clips under `tests/evaluation/` (script, checklist, expected findings per segment, written by a person who watched the clip), recorded by the team. No third-party footage.

7.2 WHEN `pnpm eval` runs, THE HARNESS SHALL run the pipeline on each clip and print per-finding-type precision and recall plus every disagreement.

7.3 THE HARNESS SHALL work with mock providers in CI (checks the plumbing) and with real providers locally (measures quality), and SHALL label which one produced each number.

7.4 THE TEAM SHALL quote only numbers the harness printed, with the clip count and provider named.

## 8. Worker integration

8.1 WHEN `SLEUTH_DATA_MODE=supabase`, THE WORKER SHALL load the job's inputs from the database, run the pipeline, and write candidates and findings with `mergeEvidence` and `mergeFindings` semantics (idempotent).

8.2 WHEN a job has `segmentIds`, THE WORKER SHALL analyse only those segments and leave other candidates untouched (see change-impact).

8.3 THE WORKER SHALL send a heartbeat while it works and SHALL log only job ids, counts and step names.
