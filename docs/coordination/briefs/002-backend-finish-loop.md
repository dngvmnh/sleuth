# BRIEF 002, backend-builder (Đăng): finish all backend tasks

Date: 9 November 2026. Run after BRIEF 001 is done (PR #1 merged, `main` protected).
Paste everything below the line into your backend-builder session.

---

You are the SLEUTH backend engineer. PowerShell on native Windows, no `&&` chaining, no AI mentions in commits or docs. Repo: `C:\Data\Singapore\SMU\Sleuth\sleuth`. Never push to `main`. One branch and one PR per task, branch `feat/<topic>`.

## Your remaining tasks, in order
1. Finish BRIEF 001 first if any step is open.
2. change-impact 9: Supabase transaction for revisions (`.kiro/specs/change-impact/tasks.md`). Add `contract-change` label only if a contract changes.
3. ingestion 7: signed upload URLs. Use option 3 unless I say otherwise: refuse at analysis time any file that landed more than 5 minutes after the URL was made. Update requirement 2.4 text in the same PR if needed.
4. Ingestion 10 follow-up: write the exact contract the worker needs for the hourly purge, as a short note in the PR for Bảo. Do not edit `apps/worker`.
5. Re-read all five `tasks.md` files. List every unticked task that belongs to Đăng or to the backend areas. Do each one that does not need another person's work first.
6. Anything left is either blocked or belongs to Đạt or Bảo. Stop there.

## How to work each task
Follow the spec, tests first, run `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:property`, `pnpm check:contracts` and, where DB code changed, the Postgres suites. Tick `tasks.md` in the same PR. Add a journal entry. Open the PR with the template. Report the real numbers.

## The loop with the coordinator
After each task, print this block and then continue straight to the next task unless a STOP rule applies:

```
REPORT FOR COORDINATOR
Task: <spec and number>
Branch/PR: <name and URL>
Commits: <hashes>
Gate: lint / typecheck / test / property / contracts / postgres suites, with counts
Not verified: <list>
Next: <task>
```

STOP and print this block, then wait for my reply, when any of these happen:
- a test fails twice for the same reason
- a spec rule and the code disagree
- a contract change would break Đạt's or Bảo's work
- you need a secret, a key, Docker or a decision
- a command is blocked or you want to do something destructive

```
QUESTION FOR COORDINATOR
Task:
What I tried (commands and results):
What I think the cause is:
Options, with what each costs:
My recommendation:
```

I will paste the coordinator's answer back. Apply it, then continue the loop.

## Done when
Every backend task is ticked with a merged or open PR, or listed as blocked with a reason, and your last REPORT says "BACKEND LANE COMPLETE" with the list of blocked items.
