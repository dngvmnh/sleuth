# Deploy plan (decision D-5)

Status: PROPOSAL. Nothing here is bought or deployed yet. Items marked OPEN need a team decision. Prices were read from the vendors' own pages on 9 November 2026, in USD before tax; check them again before paying.

## What runs where

| Part | Proposal | Why | Owner |
|---|---|---|---|
| Web app (`apps/web`, Next.js) | Vercel | Next.js hosting with no server to run. | OPEN |
| Worker (`apps/worker`, Docker with FFmpeg) | Fly.io, one always-on Machine built from `apps/worker/Dockerfile` | The worker needs FFmpeg and runs for minutes per job, so it cannot be a serverless function. | OPEN (worker owner Phạm Quốc Bảo is the natural fit) |
| Database, Auth, Storage | Supabase | Already used by the code (`DATABASE_URL`, Auth, private `video-assets` bucket). | Đăng |
| AI providers | Decided in ADR 0007 and D-4 | Not part of hosting. Hard spend cap first. | D-4 |

## Cost

| Item | Price source | Price | When |
|---|---|---|---|
| Supabase Pro | [supabase.com/pricing](https://supabase.com/pricing), [database-only cost FAQ](https://supabase.com/kb/faqs/platform/database-only-cost) | $25 per month per organization; includes $10 of compute credits, which covers one project on Micro compute. | From 1 Dec until results. Free projects pause after about a week without activity (team plan, section 1). |
| Vercel | [vercel.com/pricing](https://vercel.com/pricing), [Hobby plan](https://vercel.com/docs/plans/hobby) | Hobby is $0 but limited to non-commercial, personal use. Pro is $20 per month. | OPEN: whether a hackathon entry fits Hobby's terms. If unsure, use Pro for December. |
| Fly.io worker | [fly.io pricing](https://fly.io/pricing/), [always-on cost example](https://fly.io/learn/always-on-agent-hosting-cost/) | shared-cpu-1x with 1 GB RAM: $6.70 per 30 days in Ashburn (iad). Each extra GB of RAM is $6.00 per month. A region near Seoul may cost slightly more. | From the first deploy rehearsal. |

Rough December total: Supabase $25, worker about $7, web $0 or $20. So about $32 to $52 per month, before AI provider costs and any usage above the included amounts.

OPEN: who pays, on whose card, and until which date (the end of judging is not written in this repo).

## OPEN choices

1. Production database: upgrade the existing `sleuth-dev` project, or create a separate `sleuth-prod`. Recommendation: a separate project, so tests never touch judged data. A second project adds compute fees beyond the included credits (Supabase invoice docs).
2. Vercel Hobby or Pro (see the cost table).
3. Worker region: Supabase runs in ap-northeast-2 (Seoul). Put the worker in the nearest Fly region to keep database calls fast.
4. Who owns each account and its billing alerts.
5. Public "try your own video" goes live only after the D-4 spend cap is set.

## Steps

Do each step once in a rehearsal before 30 November, then again for the real launch.

### 1. Supabase (production project)
1. Create or upgrade the project (OPEN choice 1). Turn on the Pro plan from 1 December.
2. Auth: enable anonymous sign-ins. Storage: create the private bucket `video-assets`.
3. From the repo root, with the production `DATABASE_URL` in your local env file: `pnpm db:migrate`, then `pnpm db:seed`.
4. Set a billing alert.

### 2. Worker on Fly.io
1. Install `flyctl` on Windows with the PowerShell installer from the Fly.io docs (`iwr https://fly.io/install.ps1 -useb | iex`), then `fly auth login`.
2. From the repo root: `fly launch --dockerfile apps/worker/Dockerfile --no-deploy`. Pick the region (OPEN choice 3) and a 1 GB shared-cpu Machine.
3. Set secrets, one by one, never in a file in the repo: `fly secrets set SLEUTH_DATA_MODE=supabase DATABASE_URL=... NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=...`, plus the provider keys from D-4.
4. `fly deploy`. Keep exactly one Machine always on (`fly scale count 1`).
5. Check the logs (`fly logs`): one `start` line in supabase mode and one `retention_purged` line (ADR 0008).

### 3. Web on Vercel
1. Import the GitHub repo. Root directory: `apps/web`. Install command: `pnpm install --frozen-lockfile`.
2. Environment variables: `SLEUTH_DATA_MODE=supabase`, `DATABASE_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_APP_URL`, `DAILY_ANALYSIS_LIMIT_PER_USER`, `MAX_VIDEO_SECONDS`.
3. Deploy, then open the public demo signed out. It must load without a login.

### 4. Smoke test after each deploy
1. Signed out: the demo project, its evidence and the report open.
2. "Try your own video": anonymous sign-in, create a project, upload a short clip, start analysis.
3. The job reaches `succeeded` on the worker (needs evidence-analysis 12).
4. A second browser cannot see the first browser's project.

## Rollback
- Web: promote the previous deployment in Vercel.
- Worker: `fly deploy` the previous image, or `fly scale count 0` to stop processing.
- Database: migrations only add; do not drop tables. Supabase Pro keeps daily backups (7 days).
