# Deploy plan (decision D-5): free options only

Status: PROPOSAL. Nothing is deployed yet. Team rule (9 November 2026): free tiers only, no card on file, no paid plan. Limits were read from the vendors' own pages on 9 November 2026; check them again before launch. Items marked OPEN need a team decision.

## What runs where

| Part | Free option | Cost | Owner |
|---|---|---|---|
| Web app (`apps/web`, Next.js) | Vercel Hobby | $0 | OPEN |
| Worker (`apps/worker`, needs FFmpeg) | GitHub Actions scheduled workflow on this public repo | $0 | OPEN (worker owner Phạm Quốc Bảo is the natural fit) |
| Database, Auth, Storage | Supabase Free | $0 | Đăng |
| AI providers | See D-4 in `docs/coordination/decisions-needed.md` | $0 | OPEN |

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
1. Production database: a second free Supabase project (`sleuth-prod`), or reuse `sleuth-dev`. Recommendation: a second project. Free allows 2 active projects, and tests then never touch judged data.
2. Per-file size cap on uploads, so 1 GB of storage is not filled by a few large files.
3. Who owns each account.
4. Public "try your own video" goes live only after D-4 is settled (what happens to visitors' videos).

## Steps

Rehearse once before 30 November, then repeat for launch.

### 1. Supabase (production project, Free plan)
1. Create the project. Region: the same as `sleuth-dev` (ap-northeast-2).
2. Auth: enable anonymous sign-ins. Storage: create the private bucket `video-assets`.
3. From the repo root, with the production `DATABASE_URL` in your local env file: `pnpm db:migrate`, then `pnpm db:seed`.

### 2. Worker on GitHub Actions (not built yet)
1. Add a workflow `.github/workflows/worker.yml` with `on: schedule` (`*/5 * * * *`) and `workflow_dispatch`.
2. Steps: checkout, pnpm and Node 22, `sudo apt-get install -y ffmpeg`, `pnpm install --frozen-lockfile`, then `pnpm worker -- --once` with `SLEUTH_DATA_MODE=supabase`.
3. Store `DATABASE_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` and the provider keys as repository secrets. Scheduled runs use `main` only, and pull requests from forks do not get secrets.
4. Note: `--once` skips the hourly purge timer (ADR 0008). Add a second scheduled job (hourly) that runs the purge once.

Risk: the service-role key becomes a GitHub secret. Anyone with write access to the repo can read it through a workflow. Keep the collaborator list to the three of us.

### 3. Web on Vercel Hobby
1. Import the GitHub repo. Root directory: `apps/web`. Install command: `pnpm install --frozen-lockfile`.
2. Environment variables: `SLEUTH_DATA_MODE=supabase`, `DATABASE_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_APP_URL`, `DAILY_ANALYSIS_LIMIT_PER_USER`, `MAX_VIDEO_SECONDS`.
3. Deploy, then open the public demo signed out. It must load without a login.

### 4. Smoke test after each deploy
1. Signed out: the demo project, its evidence and the report open.
2. "Try your own video": anonymous sign-in, create a project, upload a short clip, start analysis.
3. Within about 10 minutes the job reaches `succeeded` (one scheduled worker run).
4. A second browser cannot see the first browser's project.

## Rollback
- Web: promote the previous deployment in Vercel.
- Worker: disable the workflow in the Actions tab.
- Database: migrations only add; do not drop tables. Export the database before launch (`pg_dump` with the production URL), because backups on the Free plan are not confirmed here.
