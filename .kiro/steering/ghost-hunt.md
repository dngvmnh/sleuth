---
inclusion: manual
---

# Ghost hunt

Manual steering file. In Kiro chat, call it with `/ghost-hunt` (some versions use `#ghost-hunt`). Kiro 1.x no longer creates manual hooks, so this is how we run it on demand.

Review the current uncommitted diff against `.kiro/steering/ai-safety.md`.

1. Run `node tools/kiro-hooks/hook.mjs ghost-scan` and read its output. It only finds literal `"confirmed"` assignments, so also read the diff yourself.
2. Find every place where AI output could become `confirmed` without a human `ReviewDecision`. Look at: status assignments, database upserts, API handlers, worker handlers, mock providers, seed code, fixtures.
3. Find every warning, finding or error message that lacks one of: what was found, what was not found, the limits of the check.
4. Find every spooky label shown without its plain-English label.
5. Find anything that logs media content, transcripts, signed URLs or keys.

Report as a short list: file, line, what is wrong, suggested fix. If a category has no problems, say "none found" and name the files you read. Do not edit files. Do not report things you did not check.
