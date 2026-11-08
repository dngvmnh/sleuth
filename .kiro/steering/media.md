---
inclusion: fileMatch
fileMatchPattern: ["apps/worker/**", "packages/media/**", "packages/evidence-engine/**"]
---

# Media and evidence rules

- Frame budget: at most `MAX_FRAMES_PER_VIDEO` frames per video; video at most `MAX_VIDEO_SECONDS` (180). Reject over-limit input before any provider call.
- Two provider interfaces only: `TranscriptionProvider` (word-level timestamps) and `VideoAnalysisProvider` (frames or short clip in, timestamped observations including on-screen text out). Mocks ship in `packages/media`. Real providers sit behind the same interfaces.
- Job processing is idempotent: running the same analysis twice creates no duplicate candidates. Key candidates by (analysisRunId, scriptSegmentId, assetVersionId, interval).
- Timestamps are integer ms with `0 <= startMs <= endMs <= durationMs`. Validate provider output and drop or flag violations.
- Provider output is untrusted. Parse with Zod.
- Never log media, transcripts or keys.
- Mock pipeline output on golden inputs must equal the golden expected evidence graph.
