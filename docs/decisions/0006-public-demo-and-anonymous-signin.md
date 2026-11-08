# 0006 Public demo project and anonymous sign-in

## Context
Judges have little time. A login wall costs score. Open AI processing could run up our bill.

## Decision
- A public, read-only demo project opens without login.
- "Try your own video" uses Supabase anonymous sign-in.
- Limits: per-user and per-day analysis counts, maximum 180-second video, maximum frame budget. Enforced server-side.
- Row Level Security: users see only their own projects; the demo project is readable by everyone.

## Consequences
- Judges reach the product in seconds.
- Anonymous users can be abused; limits and a spending cap on provider keys are required.
- Anonymous data should be deleted after a retention period (define in the ingestion spec).
