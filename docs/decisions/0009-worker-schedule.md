# 0009 Worker trigger: a scheduled GitHub Actions run every 10 minutes

## Context
Visitors' analysis jobs are queued in the production database. Nothing runs them until a worker takes them (ADR 0008 and decision D-5: the worker lives on a free GitHub Actions schedule). Until now the `schedule` in `.github/workflows/worker.yml` was commented out, so a queued job only ran when someone started the workflow by hand.

## Decision
- The workflow runs on `cron: "*/10 * * * *"`. The repository is public, so standard Actions minutes are free.
- `concurrency: group: worker` with `cancel-in-progress: false` keeps runs from overlapping. A new run waits.
- Each run is `pnpm worker -- --once`: one purge of old anonymous projects, then take jobs until the queue is empty, then stop. An empty queue ends after the first claim. The `ffmpeg` install is skipped when the runner already has it.
- The web app tells the visitor the truth: "Queued. Analysis starts within about 10 to 15 minutes." The job state it shows is the real state, polled every 2 seconds. There is no fake progress.
- A test (`apps/worker/src/schedule.test.ts`) fails if the schedule or the concurrency group is removed, and checks that an empty queue returns after one claim.

## Limits
- GitHub may delay or skip scheduled runs when load is high. A job can wait longer than 15 minutes. The web app shows a clear message for a job queued more than 30 minutes (WP6).
- GitHub disables scheduled workflows in a public repository after 60 days without repository activity. The team pushes to it daily until submission, and the keep-alive workflow also needs the repository to be active.
- A long video makes one run last longer. The job timeout is 20 minutes, and a later run waits for it.

## Rejected
- A hosted always-on worker: not free.
- (Rejected on 13 Nov, accepted on 14 Nov; see the amendment.) A call from the web app that starts the workflow: needs a token with `actions:write` stored in Vercel.

## Amendment, 14 November 2026: start the worker when a job is queued

What happened: the `*/10` schedule produced no scheduled run for more than 45 minutes after #43 was merged (04:51 UTC). Only manual runs existed. The workflow was active, the repository public, `main` the default branch and Actions allowed. At 05:44 UTC Đăng's builder session disabled and re-enabled the workflow, which makes GitHub read the schedule again. GitHub gives no way to see a registered schedule, so the only proof is a run with event `schedule`.

The decision now: a queued job must not depend on GitHub's cron alone.
- `POST /projects/{id}/analysis` calls `requestWorkerRun()` (`apps/web/app/api/_lib/worker-dispatch.ts`) when the job is queued. It asks GitHub to start `worker.yml` on `main` (`workflow_dispatch`).
- **Token:** `WORKER_DISPATCH_TOKEN` is a fine-grained token for `dngvmnh/sleuth` only, with "Actions: Read and write" and nothing else. It is set in Vercel for Production only and never sent to the browser. Without it, nothing is sent and the schedule is the only path.
- **Limits:** one start per server instance per minute, and a 3-second limit on the call. The call never throws: the job is already saved, so a failed start only means the scheduled run picks it up. Logs hold `worker_dispatch` and a result word (and the HTTP status on a refusal), never the token or GitHub's reply.
- **Overlap:** the workflow's `concurrency: group: worker` keeps one run going and one waiting, so several starts do not run the worker twice at once.
- **Schedule:** the 10-minute schedule stays as the second path, for a start that failed, and for jobs that retry after a failure.
- **Risk:** someone holding the token can start and cancel workflow runs in this repository. The token cannot read code, change files or read other secrets. Give it an expiry date (60 days covers judging) and remove it from Vercel after judging.
