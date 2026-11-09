# Worker contract for Supabase mode (inputs for evidence-analysis 12)

Owner of this contract: Đăng (`packages/db`). Owner of the handler: Phạm Quốc Bảo (`apps/worker`).
Code: `packages/db/src/supabase/worker.ts`. Contract test: `packages/db/src/supabase/worker.test.ts` (runs in the CI `db` job).

## Who owns what

| Part | Owner | Calls |
|---|---|---|
| Job status | worker queue, `apps/worker/src/pg-queue.ts` | `claim`, `heartbeat`, `complete`, `fail` |
| Job data | worker store, `createWorkerStore({ db, storage })` from `@sleuth/db` | `loadJobInputs`, `createVideoDownloadUrl`, `writeJobResult` |

The store never changes a job's status. The queue never writes evidence.

## The handler, step by step

```ts
import { createDb, createWorkerStore, storageFromEnv, WorkerStoreError } from "@sleuth/db";

const { db } = createDb(process.env.DATABASE_URL!, { max: 2 });
const store = createWorkerStore({ db, storage: storageFromEnv() ?? undefined });

// The loop has already called queue.claim(workerId) and starts heartbeats.
export const supabaseHandler = (workerId: string): JobHandler => async (job) => {
  const inputs = await store.loadJobInputs(job.id, workerId);   // 1. inputs
  const url = await store.createVideoDownloadUrl(inputs);       // 2. video, 300 s URL
  // 3. download to a per-job temp folder, probe, extract audio and frames, run the pipeline
  //    on inputs.script.segments (only inputs.segmentIds when not null). Delete temp files in finally.
  await store.writeJobResult(job.id, workerId, result);         // 4. result
  // 5. the loop calls queue.complete(job.id, workerId) after the handler returns.
};
```

## Claim
`queue.claim(workerId)` sets `status = 'running'`, `locked_by = workerId`, `attempts + 1`. Every store call below checks that lease. Today the loop calls the handler with the job only; the handler needs the `workerId` too (pass it when creating the handler, as above).

## `loadJobInputs(jobId, workerId)` returns `JobInputs`

| Field | Meaning |
|---|---|
| `job` | the claimed job |
| `projectId` | its project |
| `asset` | the video version the job was queued for (`storagePath`, `durationMs`, `mimeType`) |
| `script` | the script version the job was queued for, segments in order |
| `checklist` | checklist items in order |
| `existingEvidence` | everything stored now; the Ghost check needs it on a targeted run |
| `segmentIds` | lines to analyse, or `null` for a full run |

## `writeJobResult(jobId, workerId, result)`

`result` is `{ evidence, findings, transcript?, frames? }`. One transaction:
- transcript and frames are inserted (existing ids are kept);
- evidence is merged with `mergeEvidence` (a person's decision on an unchanged line is kept);
- findings with `mergeFindings` (resolved stays resolved); Poltergeists of replaced stale evidence are resolved;
- on a targeted job, anything outside `segmentIds` is dropped, and checklist-level findings come only from full runs;
- `projectId` and `assetVersionId` are set by the store, whatever the pipeline wrote.

Writing the same result twice changes nothing, so a retried job is safe.

## Refusals: `WorkerStoreError.code`

Turn each into `queue.fail(job.id, workerId, "<step>: <code>")`. The message holds no content.

| Code | When | What the worker does |
|---|---|---|
| `lease_lost` | the job is not `running`, or another worker holds it | stop; the loop's `fail` call is then a no-op, because `fail` only touches rows this worker holds |
| `superseded` | a newer video or script exists | `fail`; the user re-runs analysis on the new version |
| `demo_read_only` | the job belongs to the public demo | `fail` |
| `upload_missing` | storage has no file at the asset path | `fail` |
| `job_not_found` | the job or project is gone (for example purged) | stop |
| `not_configured` | no storage client was passed | fix the worker's environment |

## Notes for Bảo
- `pg-queue.ts` opens its own `postgres(...)` client without `prepare: false`. That works on the session pooler. It fails on the transaction pooler; add `prepare: false` if the host ever moves there.
- The seeded demo job (`job-demo-1`) is `queued`. A worker in supabase mode will claim it and fail it with `demo_read_only` after its attempts. That changes the demo's job row, not its evidence. If that is unwanted, the claim query can skip `is_demo` projects.
- Heartbeats keep running while the pipeline works (requirement 8.3); logs hold job ids, counts and step names only.
