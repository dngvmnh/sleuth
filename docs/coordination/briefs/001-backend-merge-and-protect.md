# BRIEF 001, backend-builder (Đăng)

Date: Monday 9 November 2026. Lane: backend. Agent: backend-builder.
Goal: put the team on one shared, green `main` so Đạt and Bảo can start.
Paste everything below the line into your backend-builder session.

---

You are the SLEUTH backend engineer. Run every command in PowerShell on native Windows. Do not chain with `&&`. Do not mention any AI tool in commits, docs or PR text. Work from `C:\Data\Singapore\SMU\Sleuth\sleuth`.

## Context
- `origin/main` is `30f588e` and its CI is red. `packages/media` is missing from it because an old `.gitignore` rule hid it.
- PR #1 (`feat/backend-milestones-1-3`, head `978dc4a`) fixes that and adds your milestones 1 to 3. CI is green on it. It is mergeable. It has no review and no label.
- Local `main` is at `978dc4a` and tracks the feature branch, not `origin/main`.
- Đạt and Bảo cannot start until PR #1 is merged.

## Do, in this order. Stop and report if any step fails.

1. Do not edit source files in this brief. Only the steps below.
2. Confirm state, read-only: `git status -sb`, `git log --oneline origin/main..HEAD`, `gh pr view 1 --json mergeStateStatus,mergeable`. Report the output.
3. Create the label: `gh label create contract-change --color D93F0B --description "Changes contracts, schema, OpenAPI or the golden fixture"`. Then add it to PR #1: `gh pr edit 1 --add-label contract-change`.
4. Ask me to confirm, then merge PR #1 with a MERGE COMMIT (not squash, not rebase): `gh pr merge 1 --merge`. Do not delete the branch yet.
5. Repoint local main. Run `git fetch origin`. Run `git branch --set-upstream-to=origin/main main`. Run `git pull --ff-only`. If the pull is not a clean fast-forward, stop and show me `git log --oneline --graph -15 --all`. Do not reset or force anything without asking me.
6. Check `origin/main` CI: `gh run list --branch main --limit 3`. Report the result. If it is red, read `gh run view <id> --log-failed` and tell me the cause. Do not fix it yet.
7. Delete the merged branches on the remote only after I say yes: `git push origin --delete fix/track-packages-media`, then `feat/backend-milestones-1-3`.
8. Branch protection on `main`: require a pull request, 1 approval, the `check` status to pass, no force push, no deletion. Use `gh api` with the REST branch-protection endpoint. Show me the JSON you will send and wait for my yes before sending it. Note that you are the repo owner, so do not enforce it for admins yet unless I say so.
9. On a new branch `chore/coordination` from updated `main`, commit these files and open a PR (do not push to `main`):
   - `.kiro/agents/coordinator.md`
   - `docs/coordination/` (board, decisions-needed, briefs, reviews)
   Commit message: `docs(coordination): add coordinator agent and first status board`. Run `pnpm lint` and `pnpm test` before you push, only if I confirm my other session is idle.
10. Add a journal entry to `docs/kiro-engineering-journal.md` (date 2026-11-09, name Đăng) in the same PR: what was merged, the CI result, what was protected, anything that failed.

## Then
Post the day-one message from `docs/team-plan.md` section 7 to Đạt and Bảo. Add this line: "main is ready at <commit>. Run section 8, then start your week-plan tasks in `docs/coordination/board.md` section 6."

## Report back with
- the merge commit hash and `git log --oneline -5` on `main`
- the CI state of `origin/main` after the merge
- the exact branch-protection settings applied
- PR link for `chore/coordination`
- anything you did not do, and why

## Do not
- push to `main`
- force-push, reset hard or delete anything without my yes
- touch source code, contracts or the lockfile
- start change-impact 9 or ingestion 7 yet (they come in BRIEF 002, after D-1)

## Done when
`origin/main` contains `packages/media` and the PR #1 work, its CI is green, `contract-change` exists, `main` is protected, and the coordination PR is open.
