# Kiro engineering journal

Judges read this. Keep entries dated and honest: what Kiro did, what we corrected, what failed.

## Entry template

```
### YYYY-MM-DD, <name>, <area>
- Goal:
- Kiro feature used (steering / spec / hook / agent / MCP / chat):
- What Kiro produced:
- What we had to fix or reject:
- Result (tests run, real output):
```

## Entries

### 2026-11-08, scaffold owner, bootstrap Phase 1
- Goal: set up Kiro steering and decision records before writing code.
- Kiro feature used: chat in an empty clone of `dngvmnh/sleuth`, driven by a written bootstrap prompt.
- What Kiro produced: eight steering files in `.kiro/steering/`, six ADRs in `docs/decisions/`, and this journal.
- What we had to fix or reject: nothing yet; the owner has not reviewed it. The `frontend.md` rule lists UI folders instead of excluding `apps/web/app/api/**`, because we could not confirm that fileMatch supports exclusion patterns.
- Result: files written. No code and no tests exist yet, so nothing has been run.

### 2026-11-08, Đăng (@dngvmnh), Phase 1 review and corrections
- Goal: apply review notes to the Phase 1 output before building the scaffold.
- Kiro feature used: chat; steering files edited in place.
- What changed: `frontend.md` now matches `apps/web/**` (API routes also load `backend.md`; the two do not conflict). ADR 0004 now defines normalisation with the token regex `[\p{L}\p{N}]+(?:[.,:'-][\p{L}\p{N}]+)*` instead of stripping all punctuation, so "3.5" and "35" hash differently while "Click Export." and "click export" hash the same. Ownership now names Đạt (@phatdat220707), Đăng (@dngvmnh) and Phạm Quốc Bảo (@baofrovn). `TEAM-PLAN.md` moved to `docs/team-plan.md` (it was untracked, so a plain move). `.vscode/settings.json` sets the Windows terminal profile to PowerShell.
- What failed: `corepack enable` failed with EPERM because Node is installed under nvm for Windows (`C:\Users\...\nvm\v22.17.1`). Used `npm install -g pnpm@10.12.1` instead and pinned `packageManager` in the root `package.json`.
- Result: no code yet. Nothing to run.
