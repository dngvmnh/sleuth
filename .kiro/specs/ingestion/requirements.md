# Ingestion: requirements

Owner: Đăng (@dngvmnh). Covers projects, upload URLs, script and checklist versions, job creation and status, anonymous sign-in, processing limits.

Today (Phase 2) all of this works against the in-memory fixture store (`packages/db/src/fixture/store.ts`). This spec adds the same behaviour on Supabase and adds limits. Fixture mode must keep working with no keys after every task.

`[PBT]` marks a criterion that a fast-check property test must cover.

## 1. Projects and access

1.1 WHEN a signed-in user sends a valid name to `POST /projects`, THE SYSTEM SHALL create a project owned by that user and return it with status 201.

1.2 IF the caller is not signed in, THEN `POST /projects` SHALL answer 401 `unauthorized`.

1.3 WHEN a user lists projects, THE SYSTEM SHALL return the public demo project plus only that user's own projects. [PBT: for any set of users and projects, no list contains another user's non-demo project.]

1.4 IF a user requests a project they cannot read, THEN THE SYSTEM SHALL answer 404 `not_found` and not reveal that it exists.

1.5 IF any write targets the demo project, THEN THE SYSTEM SHALL answer 403 `demo_read_only`, whoever the caller is.

1.6 WHEN a visitor opens the demo project without signing in, THE SYSTEM SHALL serve it read-only.

## 2. Upload URLs and asset versions

2.1 WHEN a signed-in owner sends a file name, a `video/*` MIME type and a `durationMs` from 0 to 180000, THE SYSTEM SHALL create an `AssetVersion` and return a signed upload URL that expires within 5 minutes.

2.2 IF `durationMs` is not an integer, is negative, or is above 180000, THEN THE SYSTEM SHALL answer 400 `invalid_request` and create nothing. [PBT: every value outside 0..180000 is rejected; every integer inside is accepted.]

2.3 WHEN an asset version is created, THE SYSTEM SHALL number it one higher than the project's highest version. [PBT: versions are 1..n with no gaps after any number of uploads.]

2.4 THE SYSTEM SHALL store videos in a private bucket under a path that starts with the project id, and SHALL never return the service-role key or a long-lived URL.

2.5 WHEN a new asset version is created, THE SYSTEM SHALL mark every evidence candidate on older versions stale (see change-impact).

## 3. Script and checklist versions

3.1 WHEN script text is posted, THE SYSTEM SHALL store a new `ScriptVersion` whose segments come from `segmentScript`, keeping the id of any sentence that was only edited or moved, and SHALL keep all older versions.

3.2 THE SYSTEM SHALL never give a new segment an id that any earlier version of the project used. [PBT: across any sequence of edits, ids of removed segments are never reused.]

3.3 IF script text is empty after trimming or longer than 20000 characters, THEN THE SYSTEM SHALL answer 400 `invalid_request`.

3.4 WHEN a checklist is posted, THE SYSTEM SHALL replace the whole list in one transaction and number positions 0..n-1. [PBT: positions are contiguous for any input list of 1..50 items.]

3.5 IF a checklist has no items or more than 50, THEN THE SYSTEM SHALL answer 400 `invalid_request`.

## 4. Jobs

4.1 WHEN analysis is requested and the project has a current asset version and script version, THE SYSTEM SHALL insert a `queued` job in `processing_jobs` and return it with status 202.

4.2 IF the project has no asset version or no script version, THEN THE SYSTEM SHALL answer 409 `missing_inputs`.

4.3 WHEN analysis is requested again for the same asset version and script version while a job for them is `queued` or `running`, THE SYSTEM SHALL return that job and create no second one. [PBT: after any sequence of identical requests, at most one active job exists per project, asset version and script version.]

4.4 WHEN a job status is requested, THE SYSTEM SHALL return status, attempts, max attempts and a short error text, and only if the job belongs to a project the caller can read.

4.5 WHEN two workers claim jobs at once, THE SYSTEM SHALL give each job to exactly one of them (`FOR UPDATE SKIP LOCKED`). Verified against a real Postgres, not the fixture.

## 5. Anonymous sign-in and limits

5.1 WHEN a visitor chooses "try your own video", THE SYSTEM SHALL sign them in anonymously with Supabase and use that user id as the owner.

5.2 THE SYSTEM SHALL allow each user at most `DAILY_ANALYSIS_LIMIT_PER_USER` analysis requests per UTC day (default 5), and SHALL answer 429 `limit_exceeded` with the reset time when the limit is hit. [PBT: for any sequence of requests across users and days, no user's accepted count in a day exceeds the limit.]

5.3 THE SYSTEM SHALL reject videos longer than `MAX_VIDEO_SECONDS` (180) and SHALL cap frames per analysis at `MAX_FRAMES_PER_VIDEO` (60).

5.4 WHEN an anonymous user's project is older than the retention period (default 7 days), THE SYSTEM SHALL delete the project, its rows and its stored files.

## 6. Audit and errors

6.1 WHEN a project, asset version, script version, checklist or job is created, THE SYSTEM SHALL write an `AuditEvent` with the actor id and ids only. Events SHALL NOT contain script text, transcripts or file names.

6.2 THE SYSTEM SHALL return every error as `{ "error": { "code", "message", "details?" } }` and SHALL NOT include stack traces or SQL.

6.3 Every route SHALL validate its body with the Zod schema from `packages/contracts` and SHALL check access before reading or writing.
