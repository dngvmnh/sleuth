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
- A webhook from the web app that starts the workflow on each upload: needs a token with `actions:write` stored in Vercel. That is a bigger secret for a small gain, so it is not used now.
