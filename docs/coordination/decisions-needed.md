# Decisions needed

Updated Monday 9 November 2026, evening. Team rule: free options only for hosting and AI.

## Open

| ID | Decision | Who | By | State |
|---|---|---|---|---|
| D-4 | AI providers on free options only | Team | Fri 13 Nov | Proposal below. Owner: Dang. Open: what visitors' videos may be sent to. |
| D-5 | Hosting on free options only | Team | Fri 20 Nov | Proposal in `docs/deploy-plan.md` ($0: Vercel Hobby, GitHub Actions worker, Supabase Free). Owner: Dang. Open: second Supabase project for production, upload size cap. |
| D-7 | Eligibility answers | Each member | Wed 11 Nov | Student status: all three are students (Đăng, 9 Nov). Not yet answered: Kiroween 2025 registration, age of majority. |

## Decided

| ID | Decision | Outcome | Where |
|---|---|---|---|
| D-1 | Ingestion 7 upload URL lifetime | Option 3: `expiresAt` is a 5-minute window; analysis refuses a late (`upload_late`) or missing (`upload_missing`) file. | PR #4, ingestion requirement 2.1 |
| D-2 | How to merge PR #1 | Merge commit (`deb6dbc`). | PR #1 |
| D-3 | Postgres in CI | Yes, as a throwaway local Supabase stack in the `db` job, never the shared dev project. | PR #5 |
| D-6 | Can one person enter both DEAD AIR and SLEUTH? | Yes. Đăng read the official rules on 9 November 2026. The team clause also allows one person on more than one team: [kiroween.devpost.com/rules](https://kiroween.devpost.com/rules). | Đăng |
| D-8 | Who adds the hourly purge to `apps/worker` | Đăng wrote it; Bảo owns the worker going forward. | PR #6, ADR 0008 |

## D-4 proposal: free AI providers

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
