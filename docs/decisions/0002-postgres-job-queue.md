# 0002 Postgres job queue

## Context
Analysis is slow (FFmpeg, transcription, video analysis) and must not run in a web request.

## Decision
A `processing_jobs` table in Postgres. The worker claims jobs with `SELECT ... FOR UPDATE SKIP LOCKED`, writes a heartbeat, and retries up to a limit. No Redis or Kafka.

## Consequences
- One fewer service to host and learn.
- Jobs must be idempotent, because retries and stale-heartbeat reclaims can run a job twice.
- Throughput is limited by Postgres; fine for the 180-second MVP limit.
- In `fixture` mode the worker reads a job from disk and writes JSON, so the loop can be developed without a database.
