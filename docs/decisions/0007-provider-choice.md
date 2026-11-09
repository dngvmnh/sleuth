# 0007 Provider choice for transcription and video analysis

Status: proposed on 9 November 2026 by Phạm Quốc Bảo's workstream. It becomes accepted when Phạm Quốc Bảo confirms the two picks and Đăng sets the spending limit (decision D-4). Nothing here was measured on our own clips yet; the evaluation harness (`pnpm eval`, evidence-analysis tasks 10 and 13) decides whether the picks stay.

## Context

ADR 0005 fixed two interfaces: `TranscriptionProvider` (audio in, timed text out) and `VideoAnalysisProvider` (frames in, timed observations out, including text read from the screen). This record picks one real provider for each, so evidence-analysis task 10 can build the adapters.

What the pipeline needs from them:

| Need | Why | Source |
|---|---|---|
| Start and end time for every spoken segment, in ms | Frames are matched to speech by time. | requirement 2.2 |
| Word-level times when offered | Nice to have, not required. | requirement 2.4 |
| Text read from the screen, with a time | Checklist items often name a button or a label. | requirement 4.1 |
| Clips up to 180 s, at most 60 frames | Product limit. | `MAX_VIDEO_SECONDS`, `MAX_FRAMES_PER_VIDEO` |
| Our users' videos are not kept or used for training | Anonymous users upload their own screens. | `.kiro/steering/ai-safety.md` |
| A hard cost ceiling | Open product, public demo (ADR 0006). | requirement 4.3 |

## Options: transcription

Prices are list prices read on 9 November 2026 from the sources at the end. Model names and promotions in this market change within weeks, so the adapter reads the model id from config and the numbers must be checked again on the provider's own page when the account is opened.

| | Deepgram Nova-3 (pre-recorded) | AssemblyAI Universal-3.5 Pro | OpenAI `gpt-transcribe` |
|---|---|---|---|
| List price | $0.0043 per minute (mono) | $0.21 per hour = $0.0035 per minute | $0.0045 per minute |
| Segment and word times | Words with times, plus utterances, in one response. | Words with times. | Not confirmed. A third-party review (October 2026) says word timestamps and subtitles are still routed to `whisper-1`, which OpenAI removes on 26 February 2027. |
| File limit | Large files accepted (hosted API). | Audio and video files by upload or URL. | 25 MB per file. |
| Data handling | Hosted API users are in the model improvement program by default (audio kept in part for training). `mip_opt_out=true` on a request means the request is not retained. The same source says opting out gives up a discount, so the real price with the opt-out may be higher, up to about double. | Transcripts kept 30 days by default; a time-to-live as low as 1 hour or a delete call removes them. Only certain files, as the contract allows, are used for training. | Not read in detail. |
| Risk | Opt-out price must be confirmed. | Retention is a time window, not zero, for pre-recorded audio. | Model family is new; timestamp support unclear. |

## Options: video analysis

Frames (up to 60 per clip) go in, structured JSON comes out. Output text is billed as output tokens, and "thinking" tokens count as output, so the adapter asks for the lowest thinking level.

| | Google Gemini Flash (`gemini-3.8-flash`) | Anthropic Claude Haiku 5.5 | OpenAI vision (mini-class model) |
|---|---|---|---|
| List price | Introductory $0.75 in / $3.75 out per million tokens until 31 December 2026, then $1.50 / $7.50 (secondary sources; the official page has the figure per model). | $0.10 in / $0.50 out per million tokens for prompts up to 100,000 tokens, more above that (secondary sources). | Not confirmed in this review. |
| Images and text on screen | Takes images, video, audio and PDF; structured output supported. Image cost per picture is set by `media_resolution`. | Takes images; structured output supported. | Takes images. |
| Data handling | Official pricing page: on the paid tier, content is **not** used to improve Google's products. On the free tier it is. | API data is not used for training under the commercial terms (not re-read in this review). | Not read in this review. |
| Risk | Prices change often; thinking tokens inflate output cost. | Cheapest by far; quality at reading small UI text is not known to us. | Not compared. |

## Decision (proposed)

1. **Transcription: Deepgram Nova-3, pre-recorded, with `mip_opt_out=true` on every request.** It gives timed words and utterances in one response, and an opted-out request is not retained. AssemblyAI is the fallback: it is cheaper per minute, and a 1-hour time-to-live plus a delete call after each job gets close to the same result.
2. **Video analysis: Gemini Flash (`gemini-3.8-flash`) on the paid tier, lowest thinking level, one request per job with the sampled frames as images and a JSON schema for the answer.** The paid tier states in writing that content is not used to improve the products. Claude Haiku 5.5 is the cheap alternative to try.
3. **Both stay behind the interfaces from ADR 0005.** The model id is read from config (`TRANSCRIPTION_MODEL`, `VIDEO_ANALYSIS_MODEL`), so a swap is one adapter and no contract change.
4. **Choose by measurement, not by this table.** Once the adapters exist, run `pnpm eval` on the five labelled clips with each candidate and keep the one with better recall on the text-on-screen cases. Both video candidates cost cents per run, so the comparison is cheap.
5. **Nothing is sent to a provider other than the two named in config, and no audio, frame or text is logged** (requirements 2.3 and 4.4).

## Cost per run (estimate, not a measurement)

Assumptions: a 180-second clip at the maximum, 60 frames, about 1,100 input tokens per frame (a high estimate), about 1,000 tokens of instructions, about 100 output tokens per frame plus up to 6,000 tokens of thinking.

| Part | Calculation | Estimate |
|---|---|---|
| Transcription | 3 min x $0.0043 | $0.013; up to $0.026 if the opt-out doubles the rate |
| Video analysis, introductory price | (67,000 in x $0.75 + 12,000 out x $3.75) per million | about $0.095 |
| Video analysis, price from 1 January 2027 | (67,000 in x $1.50 + 12,000 out x $7.50) per million | about $0.19 |
| **Whole run, worst case** | | **about $0.22** |

A typical 90-second clip with 45 frames costs about half of that. With the per-user limit of 5 analyses a day (`DAILY_ANALYSIS_LIMIT_PER_USER`), 200 runs in a month would cost at most about $45. **Proposed hard limit on the provider accounts: $50 per month**, set by Đăng on the team account before any adapter runs on real footage. The adapter also stops a job with `budget_exceeded` when its own call count passes the frame budget (requirement 4.3).

Task 10's manual run must print token counts so this table can be replaced by real numbers.

## Consequences

- The adapters need two API keys, held only by the worker (`TRANSCRIPTION_API_KEY`, `VIDEO_ANALYSIS_API_KEY`). Keys never reach logs, the browser or Git.
- The first adapter calls use plain `fetch`; no vendor SDK is added, so `pnpm-lock.yaml` does not change.
- Deepgram's opt-out price and Gemini's per-image token count are the two numbers most likely to move the estimate. Both are checked in the first real run.
- If OpenAI later documents word or segment times for `gpt-transcribe`, it becomes a third candidate for the same harness run.
- Open for the team (D-4): who owns the accounts, and the monthly limit.

## Sources (read 9 November 2026)

- Gemini Developer API pricing and model page: ai.google.dev/gemini-api/docs/pricing and /docs/models/gemini-3.8-flash (paid tier "used to improve our products: No"; the model supports image, video, audio, PDF input and structured output). Flash price per million tokens from costgoat.com, apidog.com and emergent.sh summaries of the same page.
- Deepgram: "Your Data at Deepgram" and "Data retention and MIP" (developers.deepgram.com), GitHub discussion 1292 on the discount, per-minute price from brasstranscripts.com and cekura.ai.
- AssemblyAI: assemblyai.com/pricing, docs "Data retention and model training", "How long are outputs maintained?", "Data Controls".
- OpenAI: cartesia.ai "OpenAI Whisper API pricing 2026" (a competitor's page, so the OpenAI numbers should be checked on OpenAI's own page), litellm.ai and cekura.ai for per-minute prices; whisper-1 removal on 26 February 2027.
- Claude Haiku 5.5 price: activepieces.com, codersera.com, finout.io, puter.com.
