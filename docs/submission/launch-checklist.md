# DRAFT: launch checklist

> DRAFT. Times are SGT. "Open" means nobody has confirmed it in the repo yet. Owners mark items done here with the date.

| # | Item | Due | Owner | State |
|---|---|---|---|---|
| 1 | Kiro credits request, confirmed for all three of us | Wed 2 Dec 04:00 (request closes) | Each person; Đăng checks | Open: Đăng, Đạt and Phạm Quốc Bảo each confirm "requested" here |
| 2 | Devpost registration, project created, Đạt and Phạm Quốc Bảo added as teammates | Before Mon 30 Nov | Đăng | Open |
| 3 | Official video rules read and quoted in `dogfood-plan.md` | Wed 25 Nov | Đăng | Open (rules page not readable by the page reader on 13 Nov) |
| 4 | Demo script and checklist locked | Wed 25 Nov | Đăng | Open |
| 5 | Production rehearsed: `scripts/prod-e2e.ts` passes on production | Sun 29 Nov | Đăng | Open (rehearsed on sleuth-dev on 13 Nov only) |
| 6 | Three outside testers try the live site and report issues | 30 Nov to 2 Dec | Đăng finds them; Đạt fixes UI issues | Open: names not chosen |
| 7 | Record the demo video | Mon 30 Nov | Open | Open |
| 8 | Analyse the recording on production, review, seal | Tue 1 Dec | Đăng | Open |
| 9 | Feature freeze | Wed 2 Dec 23:59 | All | Open |
| 10 | Final video edit | Thu 3 Dec | Open | Open |
| 11 | Video uploaded (host and link per the rules) | Fri 4 Dec | Open | Open |
| 12 | Devpost text from `docs/submission/devpost.md` and `kiro-usage.md` (drop the DRAFT marks only after a read-through) | Fri 4 Dec 18:00 | Đăng | Open |
| 13 | Blog post (`blog.md`) and social posts (`social.md`) | After submit, by Sat 5 Dec | Open | Open |
| 14 | Submit (internal deadline) | Fri 4 Dec 18:00 | Đăng | Open |
| 15 | Official deadline | Sat 5 Dec 06:00 | — | — |

## Every week until judging ends

- Open both Supabase projects (`sleuth-dev` and `sleuth-prod`) in the dashboard once a week. Owner: Đăng. The `keep-alive` workflow pings `sleuth-prod` twice a week; `sleuth-dev` has no ping.
- Check the `keep-alive` runs in GitHub Actions. If GitHub has switched the schedule off, turn it back on (see `docs/deploy-plan.md`, "Keep-alive").

## Rollback

If a deploy breaks the live site: Vercel, the project, Deployments. Pick the last good Production deployment, open its menu, and choose Promote to Production (or Instant Rollback). Then fix forward on a branch. Owner: Đăng.
