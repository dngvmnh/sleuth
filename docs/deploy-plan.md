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
3. Storage, then New bucket: name `video-assets`, Public bucket OFF, file size limit 50 MB, allowed MIME types `video/mp4, video/quicktime, video/webm`. The Free plan caps any file at 50 MB, which matches `MAX_VIDEO_BYTES` (52428800).
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

The workflow is `.github/workflows/worker.yml`. It runs `pnpm worker -- --once` on `ubuntu-latest` with FFmpeg, takes the queued jobs, and does one retention purge (ADR 0008) first. It is manual only (`workflow_dispatch`) for now. The 5-minute schedule is commented out because decision D-4 says visitors' videos must not reach Gemini, and the "no video analysis" worker mode is not built. When that mode exists, uncomment the schedule.

Repository secrets to add (GitHub, Settings, Secrets and variables, Actions, New repository secret):

| Secret | Value | Secret? |
|---|---|---|
| `DATABASE_URL` | production session pooler URL | yes |
| `NEXT_PUBLIC_SUPABASE_URL` | production Project URL | no, but kept as a secret for simplicity |
| `SUPABASE_SERVICE_ROLE_KEY` | production service_role key | yes, full database access |
| `TRANSCRIPTION_API_KEY` | Deepgram key | yes |
| `VIDEO_ANALYSIS_API_KEY` | Gemini key | yes |

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

The web app needs no provider keys: only the worker calls Deepgram and Gemini.

Deploy, then open the public demo signed out. It must load without a login.

### 4. Smoke test after each deploy
1. Signed out: the demo project, its evidence and the report open.
2. "Try your own video": anonymous sign-in, create a project, upload a short clip, start analysis.
3. Run the worker workflow by hand (Actions tab). The job reaches `succeeded`.
4. A second browser cannot see the first browser's project.

## Vercel Hobby terms (read 10 November 2026)

Vercel's [fair use guidelines](https://vercel.com/docs/limits/fair-use-guidelines#commercial-usage) limit Hobby teams to non-commercial personal use. Commercial use means a deployment used for the financial gain of anyone involved in any part of its production. The listed examples are payments from visitors, advertising a sale, paid hosting or coding work, affiliate links, and ads. Asking for donations is not commercial.

SLEUTH has none of those. A hackathon prize is not on the list, but the definition is wide ("financial gain of anyone"), so whether a prize counts is not clear from the text. Vercel says to contact its support when unsure. Our reading: a hackathon demo fits Hobby. It is a reading, not Vercel's answer. If you want certainty, ask Vercel support before launch. If it does not fit, the fallback is another free static and server host, which would need its own check.
## Rollback
- Web: promote the previous deployment in Vercel.
- Worker: disable the workflow in the Actions tab.
- Database: migrations only add; do not drop tables. Export the database before launch (`pg_dump` with the production URL), because backups on the Free plan are not confirmed here.
