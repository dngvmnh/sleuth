# Deploy plan (decision D-5): free options only

Status: PROPOSAL, deploy preparation done on 10 November 2026. Nothing is deployed yet. Team rule (9 November 2026): free tiers only, no card on file, no paid plan. Limits were read from the vendors' own pages on 9 November 2026; check them again before launch. Items marked OPEN need a team decision.

## What runs where

| Part | Free option | Cost | Owner |
|---|---|---|---|
| Web app (`apps/web`, Next.js) | Vercel Hobby | $0 | Đăng |
| Worker (`apps/worker`, needs FFmpeg) | GitHub Actions scheduled workflow on this public repo | $0 | Đăng (worker owner Phạm Quốc Bảo is the natural fit) |
| Database, Auth, Storage | Supabase Free | $0 | Đăng |
| AI providers | See D-4 in `docs/coordination/decisions-needed.md` | $0 | Đăng |

Total: $0 per month. Nothing can be charged because no plan holds a card.

## Limits that matter

| Service | Limit | Source | What it means for us |
|---|---|---|---|
| Vercel Hobby | Personal, non-commercial use only. Monthly caps (for example 1,000,000 function invocations, 100 GB fast data transfer). Going over pauses the feature until 30 days pass. | [Hobby plan](https://vercel.com/docs/plans/hobby) | A hackathon entry is not commercial, so it fits our reading of the terms. The caps are far above judging traffic. |
| GitHub Actions | Standard runners are free with no minute cap on public repositories. Schedules run at most every 5 minutes, can start late, and stop after 60 days with no repository activity. | GitHub Actions docs and community answers ([events](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows)) | A queued job may wait 5 minutes or more before it starts. Push a commit or run the workflow by hand at least once every 60 days. |
| Supabase Free | 500 MB database, 1 GB file storage, 5 GB egress, 50,000 monthly active users, 2 active projects. Projects with low database activity over 7 days are paused. | [pricing](https://supabase.com/pricing), [project pausing](https://supabase.com/docs/guides/platform/free-project-pausing) | The 7-day purge (ADR 0008) keeps storage small. The worker queries the database every few minutes, which should count as activity, but Supabase does not promise a number. Check the dashboard weekly until results. |

## Why not the others
- Render Free: a free web service sleeps after 15 minutes without inbound HTTP traffic ([Render docs](https://render.com/docs/free)). Our worker has no inbound traffic, so it would sleep.
- Fly.io: no free plan; it bills for what runs.

## OPEN choices
1. Production database: DECIDED (9 Nov): a second free Supabase project (`sleuth-prod`). Free allows 2 active projects, and tests then never touch judged data.
2. DECIDED: per-file upload cap of 50 MB (52428800 bytes). `supabase/config.toml` sets the local bucket limit, the worker refuses larger downloads with `MAX_VIDEO_BYTES`, and the hosted bucket gets the same limit in step 1 below.
3. Who owns each account.
4. Public "try your own video" goes live only after D-4 is settled (what happens to visitors' videos).

## Steps

Rehearse once before 30 November, then repeat for launch. Never put a key in a chat, a commit or a log. Paste keys only into the dashboards named below, or into your own PowerShell window.

### 1. Supabase production project (`sleuth-prod`, Free plan)

What you click:
1. supabase.com, then New project. Name: `sleuth-prod`. Plan: Free. Region: Northeast Asia (Seoul), the same as `sleuth-dev`. Set a database password and save it in your password manager.
2. Authentication, then Sign In / Providers: turn on "Allow anonymous sign-ins".
3. Storage, then New bucket: name `video-assets`, Public bucket OFF, file size limit 50 MB, allowed MIME types `video/mp4, video/quicktime, video/webm, video/x-matroska`. The Free plan caps any file at 50 MB, which matches `MAX_VIDEO_BYTES` (52428800). The API accepts the same four types, so the bucket must list all four. Verify: Supabase, Storage, Buckets, `video-assets`: Public is off, the limit is 50 MB, and the four types are listed. Without this bucket every upload request fails with a 500 (this happened on 10 November, see section 5).
4. Connect (top bar), then Session pooler. Copy the connection string. It must start with `postgresql://postgres.<project-ref>:` and use host `aws-0-ap-northeast-2.pooler.supabase.com`, port 5432. This is the IPv4 address that works from this PC and from GitHub.
5. Project Settings, then API: copy the Project URL, the anon key, and the service_role key.

Apply the migrations (PowerShell, from the repo root). The values already set in the shell win over `.env.local`, so `.env.local` and the dev project stay untouched:

```powershell
$env:DATABASE_URL = Read-Host "Production session pooler URL"
pnpm db:migrate
pnpm db:seed
Remove-Item Env:DATABASE_URL
```

`db:seed` adds the public demo project. Migrations are recorded in `drizzle.__drizzle_migrations`; never paste SQL.

Check Row Level Security before the link goes public:
1. Dashboard, Database, Advisors, Security Advisor: no "RLS disabled" finding for any table in `public`.
2. Signed out, open the Table Editor with the anon key through the app: only the demo project is readable. The automated proof is `packages/db/src/supabase/rls.test.ts`; it only adds rows with a test prefix and removes them. Run it once against production with `$env:TEST_DATABASE_URL` set in your shell, then clear it.

Do not run the other database suites against production. The Free plan pauses a project after 7 quiet days: open both Supabase projects once a week.

### 2. Worker on GitHub Actions

The workflow is `.github/workflows/worker.yml`. It runs `pnpm worker -- --once` on `ubuntu-latest` with FFmpeg, takes the queued jobs, and does one retention purge (ADR 0008) first. Since 14 November it runs on a schedule every 10 minutes and can also be started by hand (`workflow_dispatch`); ADR 0009 records the choice and its limits. Visitors' videos stay speech only (decision D-4): frames go to Gemini only for owners listed in the repository variable `VIDEO_ANALYSIS_OWNER_IDS`.

Repository secrets to add (GitHub, Settings, Secrets and variables, Actions, New repository secret):

| Secret | Value | Secret? |
|---|---|---|
| `DATABASE_URL` | production session pooler URL | yes |
| `NEXT_PUBLIC_SUPABASE_URL` | production Project URL | no, but kept as a secret for simplicity |
| `SUPABASE_SERVICE_ROLE_KEY` | production service_role key | yes, full database access |
| `TRANSCRIPTION_API_KEY` | Deepgram key | yes |
| `VIDEO_ANALYSIS_API_KEY` | Gemini key | yes |

Optional repository **variable** (not a secret): `VIDEO_ANALYSIS_OWNER_IDS`, comma separated user ids of our own real (not anonymous) accounts whose clips may have frames sent to Gemini. Unset means every job is speech only (decision D-4). A visitor or anonymous guest is speech only even if listed.

Risk: anyone with write access to the repo can read these secrets through a workflow. Keep the collaborator list to the three of us. Scheduled runs use `main` only, and pull requests from forks get no secrets.

### 3. Web on Vercel Hobby

What you click: vercel.com, Add New, Project, import `dngvmnh/sleuth`. Root directory: `apps/web`. Framework: Next.js. Install command: `pnpm install --frozen-lockfile`.

Environment variables (Production):

| Variable | Value | Secret? |
|---|---|---|
| `SLEUTH_DATA_MODE` | `supabase` | no |
| `DATABASE_URL` | production session pooler URL | yes |
| `NEXT_PUBLIC_SUPABASE_URL` | production Project URL | no (public by design) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | production anon key | no (public by design; safe only with RLS on) |
| `SUPABASE_SERVICE_ROLE_KEY` | production service_role key | yes, server only |
| `SUPABASE_STORAGE_BUCKET` | `video-assets` | no |
| `NEXT_PUBLIC_APP_URL` | the Vercel URL, after the first deploy | no |
| `DAILY_ANALYSIS_LIMIT_PER_USER` | `5` | no |
| `MAX_VIDEO_SECONDS` | `180` | no |
| `MAX_VIDEO_BYTES` | `52428800` | no |
| `WORKER_DISPATCH_TOKEN` | fine-grained GitHub token, `dngvmnh/sleuth` only, "Actions: Read and write" only (ADR 0009 amendment) | yes, server only; **Production only**, never Preview |

The web app needs no provider keys: only the worker calls Deepgram and Gemini.

How to make `WORKER_DISPATCH_TOKEN`:
1. GitHub, your avatar, Settings, Developer settings, Personal access tokens, Fine-grained tokens, Generate new token.
2. Name `sleuth-worker-dispatch`. Expiration: 60 days. Resource owner: `dngvmnh`. Repository access: Only select repositories, `dngvmnh/sleuth`.
3. Permissions, Repository permissions: Actions, Read and write. Leave every other permission at No access. Generate, copy it.
4. Vercel, the project, Settings, Environment Variables, Add: key `WORKER_DISPATCH_TOKEN`, paste the value, tick **Production** only, mark it Sensitive, Save.
5. Deployments, the latest Production deployment, Redeploy, so the new variable is read.
Undo: delete the variable in Vercel and the token on GitHub. The 10-minute schedule still runs the worker.

Deploy, then open the public demo signed out. It must load without a login.

### 4. Smoke test after each deploy
1. Signed out: the demo project, its evidence and the report open.
2. "Try your own video": anonymous sign-in, create a project, upload a short clip, start analysis.
3. Wait for the scheduled worker (10 to 15 minutes), or start it now: `gh workflow run worker.yml --repo dngvmnh/sleuth`. The job reaches `succeeded`.
4. A second browser cannot see the first browser's project.

### 5. Production check, 10 November 2026 (`https://sleuth-eight.vercel.app`)

Run by `pnpm tsx scripts/prod-smoke.ts`. Part A needs nothing. Part B needs the public Project URL and anon key in your own shell (instructions at the top of the script). It never loads `.env.local`, starts no analysis job and sends nothing to Deepgram or Gemini.

| Check | Status | How |
|---|---|---|
| Site is in Supabase mode | Proven | A forged `x-fixture-user` header gets 401, so the fixture mode is off |
| Signed-out visitor sees only the demo | Proven | Script part A: list holds one project; demo, evidence, findings, coverage and report.csv return 200; an unknown id returns 404 |
| Signed-out visitor cannot write | Proven | Script part A: create 401; scripts, analysis, seal and upload-url 403; a forged bearer token 401 |
| No secret in the page or its JS | Proven | Fetched the page and 7 assets (584159 bytes). Zero matches for a JWT, `service_role`, `sb_secret_`, `postgres://`, a Supabase host, Deepgram, Gemini or any env name |
| Anonymous sign-in, create, upload | **Not proven** on 10 November (replaced by section 5b) | The web app has no sign-in screen yet and its JS holds no Supabase URL or anon key. Needs script part B |
| Two users cannot read each other's projects | **Not proven** on 10 November (replaced by section 5b) | Same reason. Policies reviewed in section 6; not run on production |
| 50 MB cap and file types | API: proven by tests. Live: **not proven** on 10 November (replaced by section 5b) | Unit, property, store-contract and route tests cover the API. The live site needs script part B and the bucket settings check |

Fixed in the API (contract change): the upload-url request now needs `sizeBytes` (1 to 52428800) and `mimeType` must be `video/mp4`, `video/quicktime`, `video/webm` or `video/x-matroska`. Anything else gets 400 before a URL is issued. The bucket settings in step 1 stay as the second wall. Script part B checks both: the API refuses a 51 MB size claim, and the bucket refuses a 51 MB body and a text body.

### 5b. Production check, 13 November 2026

Reported by Đăng; run in Đăng's shell with `pnpm tsx scripts/prod-smoke.ts` (parts A and B). Not re-run by the coding session.

- Root cause of the 10 November failure ("signed upload URL issued" got 500): `sleuth-prod` had no storage bucket. Step 1.3 above had never been done. The bucket `video-assets` now exists: private, 50 MB limit, MIME types `video/mp4`, `video/quicktime`, `video/webm`, `video/x-matroska`.
- The script also expected 200 from `createUploadUrl` while the contract declares 201. The script now expects 201.
- Result: all checks passed, 32 of 32 (parts A and B).

Rows of the 10 November table that this replaces:

| Check | Status on 13 November | How |
|---|---|---|
| Anonymous sign-in, create, upload | Proven on production | Part B: two anonymous users, create a project, signed upload URL issued (201) and a 4 KB file uploaded through the API |
| Two users cannot read each other's projects | Proven on production | Part B: user B gets 404 on A's project, B's list hides it, a signed-out visitor gets 404, B cannot write to it |
| 50 MB cap and file types | Proven on production | Part B: the API refuses a 51 MB size claim, a missing size, `text/plain` and a video over 180 s; the bucket refuses a 51 MB body and a text body |
| No secret in the page or its JS | Still true as of 10 November. Re-check after PR #27 | PR #27 (guest sign-in, not merged yet) puts the Supabase Project URL and the anon key in the page. Both are public by design (ADR 0006), so after #27 they are expected. Still forbidden anywhere in the page or its JS: `service_role`, `sb_secret_`, `postgres://` and any Deepgram or Gemini key |

### 5c. First real job

`scripts/prod-e2e.ts` runs the whole path as one user and prints PASS, FAIL or SKIP with counts and ids only. The exact lines for both modes, and the read-only queue check, are at the top of the script. Run it in your own shell.

| Mode | How | Worker | What it can prove |
|---|---|---|---|
| Guest | Only `PROD_SUPABASE_URL` and `PROD_SUPABASE_ANON_KEY` are set | Speech only, for any owner list (D-4) | Sign-in, upload, queue, worker, transcript, Ghost findings, seal blockers, CSV. It also proves the data rule: "speech-only findings: n of n" |
| Team account | Also `PROD_E2E_EMAIL` and `PROD_E2E_PASSWORD` (both, or neither) | Frames go to Gemini only if this account's user id is in the `VIDEO_ANALYSIS_OWNER_IDS` variable | Also screen evidence, resolving a finding (step 7) and an edit staling that evidence (step 8). Expect "speech-only findings: 0 of n" |

In guest mode, speech alone gives screen claims no candidate. So step 7 is SKIP and step 8 has no evidence to stale. Those two steps can only be proven in team-account mode.

Order of work:
1. Run the queue check; it must return no rows.
2. Start the script.
3. When it prints "analysis queued", run the queue check again. The scheduled worker takes the job within 10 to 15 minutes; you do not have to start it. If you want it sooner, run `gh workflow run worker.yml --repo dngvmnh/sleuth`. Only test projects (`zz-test-e2e-...`) should be queued while you rehearse, so a visitor's job is not mixed in.
4. After the run, delete the printed project by id (`docs/coordination/cleanup.md`).

Rehearsal on sleuth-dev, 14 November 2026: a local worker with the production settings (gemini, empty owner list) and a guest. Result: worker `speechOnly=1`, "speech-only findings: 2 of 2", 9 PASS, 1 SKIP (step 7), 0 secrets or transcript strings in the output.

### 6. Row-level security review (migrations 0000 to 0002)

All 14 tables in `public` have RLS on: `asset_versions`, `audit_events`, `checklist_items`, `evidence_candidates`, `findings`, `frame_observations`, `processing_jobs`, `projects`, `reshoot_tasks`, `review_decisions`, `script_segments`, `script_versions`, `seals`, `transcript_segments`.

- 13 tables have two policies: `<table>_read` (anon and authenticated: the project is the demo, or you own it) and `<table>_write` (authenticated only, for all commands: you own the project and it is not the demo).
- `projects` has four: `projects_read`, `projects_insert`, `projects_modify` and `projects_delete`. Insert, update and delete need `owner_id = auth.uid()` and not demo.
- Nobody but the server role can write the demo, and `anon` has no write policy anywhere.
- Gaps and notes:
  - The web server connects with a role that bypasses RLS, so the app code enforces access too. RLS is the second layer.
  - `owner_id` is not a foreign key to `auth.users`, so deleting a user does not remove the projects. The 7-day purge is what removes anonymous data.
  - An owner can write `audit_events` and `review_decisions` of their own project through the Data API. That only affects their own data.
  - Storage: no policies on `storage.objects` are created by the migrations. With RLS on and no policy, clients cannot read or write the bucket directly. Check the bucket is private (step 1).
  - Policy tests live in `packages/db/src/supabase/rls.test.ts` and ran on the dev project and in CI. They were not run on production.

To run them once on production, in your own shell (the suite adds rows with a test prefix and removes them):

```powershell
cd C:\Data\Singapore\SMU\Sleuth\sleuth
$env:TEST_DATABASE_URL = Read-Host "Production session pooler URL"
pnpm vitest run packages/db/src/supabase/rls.test.ts
Remove-Item Env:TEST_DATABASE_URL
```

### 7. Remove test data

The full, current list of test rows and files on both projects is in `docs/coordination/cleanup.md` (14 November 2026). This section keeps the general recipe.

The API has no delete route. After a smoke run, open the Supabase dashboard, SQL Editor, `sleuth-prod`, and run:

```sql
-- List first. Only zz-test- rows should appear, never proofpay-demo.
select id, name, owner_id, created_at from projects where name like 'zz-test-%';
delete from projects where name like 'zz-test-%' and not is_demo;
```

Child rows go with the project (cascade). Then Storage, `video-assets`: open each folder named with a deleted project id and delete it. SQL cannot delete Storage objects, so this step is by hand in the dashboard. Optionally, Authentication, Users: delete the anonymous users made today.

Left over from the 13 November run (delete these two folders in Storage, `video-assets`; each holds one 4 KB test file):
- `prj-0mwetmijy0001-78237676`
- `prj-0mweu1pmk0001-c9e4ae11`

The three test projects of that run (`zz-test-ec48xl`, `zz-test-836d6a`, `zz-test-eu60zn`) were already deleted.

## Keep-alive through judging (written 13 November 2026)

**The pausing rule (Supabase):** Free plan projects that show low activity over a 7-day period are paused to save server resources. Typically a few user requests to the database each day over the previous week are enough to prevent pausing ([Project Pausing](https://supabase.com/docs/guides/platform/free-project-pausing), read 13 November 2026). Supabase emails the owner about a week before a pause. A paused project can be restored from the dashboard (Resume project) for up to 1 year (same page).

**What we do:** `.github/workflows/keep-alive.yml` runs one read-only query (`select count(*) from projects where is_demo`) against `sleuth-prod` on Mondays and Thursdays at 03:17 UTC, plus a manual run. It uses the existing `DATABASE_URL` secret and runs only on `dngvmnh/sleuth`. The query runs in `scripts/keep-alive.ts`, which uses the worker's own driver and options (postgres.js through `@sleuth/db`, `prepare: false`, one connection, 20 s limit). An earlier version used `psql`, which failed on the same secret with exit code 2 and hid the reason.

It prints only `ok` or `error <category>`. The category is read from the error's code or name, never from its text:

| Output | Meaning | What to do |
|---|---|---|
| `ok` | The query ran | Nothing |
| `error auth` | The password or user was refused | Re-save `DATABASE_URL` from Connect, Session pooler, with the current password |
| `error host` | The host was not found or refused the connection | The secret holds a wrong host or a direct `db.<ref>` host; use the session pooler URL |
| `error timeout` | No answer in 20 s | Check the project is not paused; run it again |
| `error tls` | The TLS handshake failed | The URL forces a TLS mode the pooler does not offer; use the URL exactly as Supabase shows it |
| `error config` | No secret, or not a URL | Add or fix the secret |
| `error other` | Anything else, for example the pooler does not know the tenant (user name) | Re-copy the whole URL from Connect, Session pooler |

**Why it may not be enough:**
- Supabase calls activity "a few user requests ... each day". Two queries a week may be too few, so the weekly "open both projects" reminder stays (`docs/submission/launch-checklist.md`). If a warning email arrives, open the project in the dashboard at once.
- `sleuth-dev` has no ping. Open it by hand.

**Two limits of GitHub's scheduler:**
- In a public repository, scheduled workflows are automatically disabled when no repository activity has occurred in 60 days ([Disabling and enabling a workflow](https://docs.github.com/en/actions/managing-workflow-runs/disabling-and-enabling-a-workflow), read 13 November 2026). Fix: re-enable it in Actions, keep-alive, Enable workflow, or push a commit before day 60.
- Scheduled events can be delayed during periods of high load of GitHub Actions workflow runs ([Troubleshooting workflows](https://docs.github.com/en/enterprise-server@3.21/actions/how-tos/troubleshoot-workflows)). That is why the cron avoids minute 0. A late run of a few hours does not matter for a 7-day rule.

**After submission while judging continues:**
1. Leave the keep-alive schedule on, and do not merge anything risky to `main`.
2. Each week, check the last keep-alive runs in Actions and open both Supabase projects.
3. If a project pauses anyway, restore it from the dashboard (Resume project), then run `pnpm tsx scripts/prod-smoke.ts` part A.
4. Leave the worker schedule on (ADR 0009). If GitHub switches it off after 60 days without repository activity, turn it back on in the Actions tab.

## Vercel Hobby terms (read 10 November 2026)

Vercel's [fair use guidelines](https://vercel.com/docs/limits/fair-use-guidelines#commercial-usage) limit Hobby teams to non-commercial personal use. Commercial use means a deployment used for the financial gain of anyone involved in any part of its production. The listed examples are payments from visitors, advertising a sale, paid hosting or coding work, affiliate links, and ads. Asking for donations is not commercial.

SLEUTH has none of those. A hackathon prize is not on the list, but the definition is wide ("financial gain of anyone"), so whether a prize counts is not clear from the text. Vercel says to contact its support when unsure. Our reading: a hackathon demo fits Hobby. It is a reading, not Vercel's answer. If you want certainty, ask Vercel support before launch. If it does not fit, the fallback is another free static and server host, which would need its own check.
## Rollback
- Web: promote the previous deployment in Vercel.
- Worker: disable the workflow in the Actions tab.
- Database: migrations only add; do not drop tables. Export the database before launch (`pg_dump` with the production URL), because backups on the Free plan are not confirmed here.
