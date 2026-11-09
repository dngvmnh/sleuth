# Decisions needed

Updated Tuesday 10 November 2026. Team rule: free options only for hosting and AI.

## Open

| ID | Decision | Who | By | State |
|---|---|---|---|---|
| D-4 | AI providers on free options only | Đăng | Mostly decided 10 Nov | Models and data rule set (see below). Open: the AI account owner is Đăng; the "no video analysis" worker mode is a task for Bảo. |

## Decided

| ID | Decision | Outcome | Where |
|---|---|---|---|
| D-1 | Ingestion 7 upload URL lifetime | Option 3: `expiresAt` is a 5-minute window; analysis refuses a late (`upload_late`) or missing (`upload_missing`) file. | PR #4, ingestion requirement 2.1 |
| D-2 | How to merge PR #1 | Merge commit (`deb6dbc`). | PR #1 |
| D-3 | Postgres in CI | Yes, as a throwaway local Supabase stack in the `db` job, never the shared dev project. | PR #5 |
| D-6 | Can one person enter both DEAD AIR and SLEUTH? | Yes. Đăng read the official rules on 9 November 2026. The team clause also allows one person on more than one team: [kiroween.devpost.com/rules](https://kiroween.devpost.com/rules). | Đăng |
| D-8 | Who adds the hourly purge to `apps/worker` | Đăng wrote it; Bảo owns the worker going forward. | PR #6, ADR 0008 |
| D-5 | Hosting on free options only | Free tiers only: Vercel Hobby, a GitHub Actions worker, Supabase Free. A second free Supabase project (`sleuth-prod`) is production. Upload cap is 50 MB (52428800 bytes, the same value as `MAX_VIDEO_BYTES`). Keep the weekly reminder to open both Supabase projects so they are not paused. Owner: Đăng. | `docs/deploy-plan.md` |
| D-7 | Eligibility answers | All three are university students and adults. Phạm Quốc Bảo and Đạt did not register for Kiroween 2025 and are above the age of majority. Đăng's answers are recorded. | Team, 10 Nov |

## D-4: free AI providers (decided 10 Nov)

- Gemini model: `gemini-3.8-flash` on the free tier. If the free tier refuses it, fall back to `gemini-3.6-flash` and record that here.
- Data rule: visitors' videos go to Deepgram only. Frames are never sent to Gemini for visitors.
- Task for Bao: add a "no video analysis" mode to the worker. Supabase mode refuses the mock providers today.
- Owner of both accounts: Đăng. No card on either.

### Original proposal

The adapters exist for Deepgram (transcription) and Gemini (video analysis), PR #18. ADR 0007 picked the paid Gemini tier; the free rule changes that.

| Part | Free option | Limit | Data handling | Source |
|---|---|---|---|---|
| Transcription | Deepgram, $200 sign-up credit | One-time credit, no card needed. Without a card it cannot bill, so the credit is the cap. Estimate: about $0.013 to $0.026 per 3-minute run (ADR 0007), so several thousand runs. | `mip_opt_out=true` stops retention (ADR 0007). It may cost up to double, which uses the credit faster. | [Deepgram sign-up](https://console.deepgram.com/signup) |
| Video analysis | Gemini API free tier | Rate-limited requests per minute and per day, per model. Check the active limits in AI Studio. | On the free tier, content may be used to improve Google's products (ADR 0007, official pricing page). | [rate limits](https://ai.google.dev/gemini-api/docs/rate-limits) |

The conflict: `.kiro/steering/ai-safety.md` says users' videos are not kept or used for training. The free Gemini tier does not promise that.

Recommendation:
1. Our own recorded clips: Deepgram credit plus Gemini free tier. We own the footage and accept the terms.
2. Visitors' videos ("try your own video"): Deepgram only, with no frames sent to Gemini. This needs a "no video analysis" mode in the worker (Bảo's area), because supabase mode refuses the mock providers today.
3. No card on any provider account. Both accounts belong to one owner (OPEN; Bảo is the natural fit).
4. Bảo amends ADR 0007 to match, if the team agrees.
