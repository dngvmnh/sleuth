# BRIEF 007, frontend: the "haunted house" UI revamp (detail pass + night-wind audio)

Date: 14 November 2026. Written by Đăng. Builds on brief 006 (PRs #46 to #53, already on `main`).
Runs in a Kiro `frontend-builder` session (Đăng drives it, or forward to Đạt). No calendar: go as fast as the gates allow.

Parallel plan: step 1 lands first, because it owns `globals.css`, `tokens.css`, `components/ornaments/`, `components/shell/` and `features/ambience/`. Once it is merged, steps 2, 3 and 4 can run at the same time in three Kiro sessions, each in its own git worktree and branch. They must not edit the files step 1 owns. If one needs a new shared class, it adds it in its own feature folder and reports it, so it can be moved to `globals.css` afterwards. Step 5 goes last.

Paste everything below the line into the session.

---

You are the SLEUTH frontend engineer. PowerShell on native Windows, no `&&` chaining, English everywhere, no AI mentions in commits, docs or PRs, no co-author trailer. Repo: `C:\Data\Singapore\SMU\Sleuth\sleuth`. Never push to `main`. One branch and one PR per numbered step below. Run `git pull` on `main` before each branch.

## Goal

Brief 006 gave SLEUTH the `hollow` colours. This brief gives it the *craft*: the layered, detailed look of a premium dark-fantasy game menu (think "midnight adventure in an old house"), applied to a QA tool. Every screen should feel like walking through a haunted house at night, while every label still says plainly what it is.

Inspiration only. Do not copy any existing game, studio, designer, artwork, logo, text or sound. All art is original SVG or CSS; all audio is synthesized in the browser with the Web Audio API (no audio files, no samples, nothing from any game).

## Design language (apply everywhere)

**Type**
- Display: Instrument Serif (`font-display`), cream (`text-foreground`) with ONE italic accent word per heading in amber (`italic text-primary`). Pattern: `The cut is <em>haunted</em>.`, `A cabinet of <em>findings</em>.`, `A house of <em>claims</em>.`, `The final <em>seal</em>.`
- Eyebrow above every section heading: sans, `text-[11px] font-semibold uppercase tracking-[0.28em] text-spectral`, preceded by a short 24px rule (`before:` pseudo-element, `bg-line-strong`). Example: `— CHAPTER I · THE SCREENING ROOM`. The eyebrow is decorative; the heading carries meaning.
- Big numerals for counts: `font-display text-6xl tabular-nums` with a small caption under it (`08` / `of 24 claims covered`).
- Outlined giant word (from the festival poster style): one huge sans word per hero, `text-transparent` with `-webkit-text-stroke: 1px var(--sleuth-border-strong)` and `aria-hidden="true"`, sitting behind the heading at 8 to 12% visual weight. Dashboard: `HAUNTED`. Report: `SEALED` or `UNSEALED`.

**Panels**
- Forest panel: `bg-surface/85` + `border border-line` + `rounded-[2px]` (sharp, not pill) + inner hairline: a second 1px inset border 4px inside (`outline outline-1 outline-line -outline-offset-4`). Corners get tiny original SVG filigree marks (`components/ornaments/corner.tsx`, 12px, `text-line-strong`, `aria-hidden`).
- Section dividers: thin rule with a centred small ornament (diamond or key glyph), `components/ornaments/divider.tsx`.
- Cards lift on hover by 2px with a soft amber glow (`shadow-[0_0_24px_rgb(var(--sleuth-fog-b)/0.18)]`); no motion under reduced motion.

**Atmosphere layers** (all `aria-hidden`, `pointer-events-none`, all off under `prefers-reduced-motion` except static ones)
1. Existing `.sleuth-fog` (keep).
2. Film grain: one static SVG `feTurbulence` noise as a fixed overlay at 4 to 6% opacity (static, so allowed under reduced motion).
3. Vignette: radial gradient darkening the edges.
4. Low ground mist band at the bottom of hero sections: two blurred gradient strips drifting slowly in opposite directions (60s+ loop).
5. Lantern cursor: in hero sections only, a 280px radial amber light that follows the pointer (`pointermove` updating two CSS variables, throttled with `requestAnimationFrame`). Off for touch and reduced motion.
6. Rare silhouettes: in the dashboard hero SVG, a bat or crow silhouette crosses the moon once every 20 to 40 s (random delay). Slow, small, never flashing.
7. Candle flicker on the primary CTA glow: opacity between 0.85 and 1 over 2.5 to 4 s irregular keyframes. **Never** a flash: no more than 3 luminance changes per second, small amplitude only (WCAG 2.3.1).

**Spooky but plain (D-18, keep)**: every themed label keeps its plain meaning next to it or in an `sr-only` span. No gamified words: no "level", "XP", "quest", "unlock", "achievement". Counters count real things (claims, findings, lines).

## Night wind (ambient audio)

New: `apps/web/features/ambience/` with `night-wind.ts` (engine, no React), `use-night-wind.ts` (hook), `night-wind-toggle.tsx` (button), and tests.

Sound design, all generated with Web Audio (no files):
- **Wind bed:** brown noise (generate a 4 s buffer of integrated white noise, loop it) through a `BiquadFilterNode` bandpass (Q about 0.8). An LFO (`OscillatorNode` at 0.05 to 0.12 Hz through a `GainNode`) moves the band centre between about 250 and 900 Hz so the wind rises and falls. A second, quieter noise layer with a highpass around 2.5 kHz gives the hiss.
- **Distant howl** every 18 to 45 s (random): a sine oscillator plus a quieter detuned triangle, pitch gliding with `setTargetAtTime` from about 330 Hz up to 520 Hz and back down to 280 Hz over 3 to 5 s, slight vibrato (5 Hz LFO, ±6 Hz), through a lowpass at 1.2 kHz and a long reverb. The envelope fades in over 0.8 s and out over 1.5 s. It should read as far away and mournful, not a jump-scare.
- **Low drone:** two sine oscillators at about 55 Hz and 55.4 Hz (slow beating), very quiet.
- **Reverb:** a `ConvolverNode` with a generated impulse (2.5 to 3.5 s of decaying stereo noise).
- **Master:** `GainNode` capped at 0.18, fades in over 2 s and out over 0.6 s. A `DynamicsCompressorNode` before the destination.

Rules:
- **Off by default.** It never autoplays. The first click on the toggle creates the `AudioContext` (browser autoplay rules need that gesture).
- Remember the choice in `localStorage` (`sleuth.nightWind` = `on`/`off`, wrapped in try/catch). On a later visit with `on`, show the toggle as "Night wind: tap to resume" and wait for one click; do not start sound without a gesture.
- **Duck for the video:** when the workspace video player plays, fade the wind to 0 within 300 ms, and fade back when it pauses or ends. A reviewer must hear the demo's own audio cleanly. Wire this through a tiny event (`window.dispatchEvent(new CustomEvent("sleuth:media", { detail: "play" | "pause" }))`) from `features/player/`, so the player and ambience stay decoupled.
- Pause (suspend the context) when the tab is hidden (`visibilitychange`), resume when it is visible again and the toggle is on.
- Toggle UI in the header: a button with a small original SVG icon (crescent and wind lines) and the text `Night wind: off` / `Night wind: on`, `aria-pressed`, at least 24×24 px. A volume slider is optional (a native `input type="range"`, labelled `Night wind volume`).
- Tests (Vitest with a fake `AudioContext`): starts only after the toggle; remembers the choice; ducks on `sleuth:media` play and restores on pause; suspends on hidden; never creates a context on page load.

## Global shell

`apps/web/app/(workspace)/layout.tsx`, plus a new `components/shell/` folder.

- **Top bar** (grid of three):
  - Left: `SLEUTH` wordmark in the display serif with a small key or lantern glyph. Under it, a tiny eyebrow `THE HAUNTED CUT`.
  - Centre: nav links `Dashboard`, `Findings guide` (`/#findings-guide`), and `Report` (only inside a project). The active link has a 2px amber underline that slides in (`scale-x` transition; static under reduced motion). Use `aria-current="page"`.
  - Right:
    - A counter chip (original SVG lantern icon) showing the real total of open findings across the visitor's projects, e.g. `◆ 7 open`. Hide it while loading or on error. Never invent a number.
    - The Night wind toggle.
    - An identity chip: avatar circle with an original SVG hooded-figure glyph, and two lines, `Guest reviewer` / `Session ends when you close the browser`. A signed-in team account shows `Team reviewer`. No level, no XP.
- **Footer bar** (print hidden):
  - Left: keyboard hints, styled like keycaps (`kbd`, `border-line-strong`): `← →  Move between markers`, `Esc  Close the lantern`, `Tab  Next control`. Show only keys that really work. Those three exist today in `features/timeline/timeline.tsx`.
  - Centre: `ALL HALLOWS' CUT · EVERY CLAIM NEEDS PROOF` in the tracked eyebrow style.
  - Right: a save indicator tied to real state. `Saved` with a check after the last script, checklist or decision save succeeds; `Saving…` while one is in flight; nothing when nothing was edited. Use a small context (`components/shell/save-status.tsx`) that the editors already calling the API can report into. If wiring that is bigger than half a day, show it only on the workspace page and say so in the PR.

## Screens (one PR each, in this order)

### 1. Foundations + shell + Night wind (`feat/web-haunted-shell`)
- Ornaments (`components/ornaments/`), atmosphere layers (grain, vignette, mist, lantern cursor), eyebrow and panel utilities. Add them to `globals.css` as component classes: `.eyebrow`, `.panel`, `.panel-inset`, `.outline-word`, `.kbd`.
- New tokens, if any, go in `tokens.css` for **both** themes, and the contrast test must cover them. Đăng owns tokens, so list every token you add in the PR description.
- Header, footer and save status from "Global shell" above. The Night wind feature from "Night wind" above.

### 2. Dashboard: "The screening room" (`feat/web-haunted-dashboard`)
Files: `app/(workspace)/page.tsx`, `features/dashboard/*`, new `features/dashboard/hero-art.tsx`.
- **Hero** (two columns on desktop, stacked on mobile):
  - Left:
    - eyebrow `CHAPTER I · THE SCREENING ROOM`
    - H1 `The cut is <em>haunted</em>.`
    - one-line plain description: what SLEUTH checks
    - two buttons: amber primary `Open the public demo →` (arrow icon, candle-flicker glow) and outline `Start a project`
    - under them, a progress line from real demo coverage: `08 / 24 · claims covered in the demo` with a thin gold bar
  - Right: original SVG art, an old cinema house on a hill:
    - crescent moon, bare trees, one lit window
    - a film reel forming the rose window
    - layered silhouettes, so parallax under the lantern cursor is optional
  - Floating clue card overlapping the art's lower left, a small forest panel:
    - eyebrow `LATEST CLUE`
    - the most recent real finding in the demo: icon, `Ghost (claim with no proof)`, timestamp, one-line excerpt
    - clicking it opens that finding in the workspace
    - It must be real data from the API; hide the card if there is none.
  - Behind the H1: the outlined giant word `HAUNTED`.
- **Three steps row** with the heading `A little further <em>into the cut</em>.` and three cards, each with an original SVG vignette and a plain caption:
  - `I · Write what you promise` (script and checklist)
  - `II · Upload the cut` (video)
  - `III · Press the seal` (Final Seal)
  - Each card links to the right place (the demo workspace tabs, or the report).
- **Projects** as "recent cuts" thumbnail cards:
  - a film-frame SVG poster with sprocket holes, carrying the project's initials in the display serif
  - the name
  - big numeral open findings
  - last change
  - a `Public demo, read-only` tag where true
  - Keep every test id and the create flow from `project-list.tsx` working.
- **Findings guide** (`id="findings-guide"`), the "cabinet": heading `A cabinet of <em>findings</em>.`
  - Left: a 3-column grid (2 on tablet, 1 on mobile) with one card per finding type. Each card holds:
    - the large original icon
    - spooky name
    - plain name
    - a small tag in place of a "rarity" label, from real rules: `Blocks the seal` (danger) or `Needs a person` (warn) or `Outside proof` (spectral)
  - Right: a sticky detail panel for the selected card. It shows:
    - the large icon
    - `meaning` from `FINDING_LABELS`
    - `How it is found` (one plain sentence each, from `.kiro/steering/ghost-hunt.md`)
    - `How to clear it` (one plain sentence)
  - The cards work as a radio group (arrow keys, `aria-checked`), or as buttons with `aria-pressed` and an `aria-controls` panel.
  - The Cursed Frame card gets a hover effect: a 2 to 3 px RGB-split text shadow. Keep it static, not flashing, and off under reduced motion.

### 3. Workspace: "A house of claims" (`feat/web-haunted-workspace`)
Files: `features/workspace/*`, `features/timeline/*` (keep marker shapes and keyboard), `features/lantern/*`.
- Header block:
  - eyebrow `CHAPTER II · THE INVESTIGATION`
  - project name in display serif
  - the italic accent subtitle `A house of <em>claims</em>.`
- **Claims map** (new `features/workspace/claims-map.tsx`). It replaces the plain counts block, and keeps the existing coverage bar data. It is a floor-plan-style grid: one "room" box per script line and per checklist item, sized by text length bucket (S/M/L), laid out with CSS grid like a house plan.
  - Room states each use a different border style and an icon, never colour alone:
    - `Covered` (gold, solid border, check icon)
    - `Candidate waiting` (spectral, dashed border, lantern icon, soft pulse)
    - `No proof yet` (muted, dotted border, lock icon)
    - `Stale after edit` (warn, double border, clock icon)
  - Legend under the map. Big numeral on the side: `08` `of 24 claims covered`.
  - Clicking a room selects the sentence and seeks the timeline (reuse the existing selection and seek functions). Rooms are buttons with full labels such as `Line 3, covered: "Upload a demo video"`.
- The Evidence Lantern becomes the right-side detail panel: forest panel, eyebrow `THE LANTERN`, and the finding badge.
- Script, Checklist, Upload and Analysis tabs: the active tab gets the amber underline from the nav. Keep the accessible tab pattern from brief 006.
- **Video player frame:** wrap it in a "projector" frame with a thin gold rule and corner ornaments. While it plays, send `sleuth:media` events for the Night wind ducking.

### 4. Report: "The final seal" (`feat/web-haunted-report`)
Files: `features/report/*`, `app/(workspace)/projects/[id]/report/page.tsx`.
- eyebrow `CHAPTER III · THE VERDICT`; H1 `The final <em>seal</em>.`; the outlined word `SEALED` or `UNSEALED` behind it, matching real seal state.
- Seal panel:
  - a large `WaxSealIcon` in gold, pressed with the existing `.sleuth-seal-stamp` once on success
  - blockers listed as "locked doors", each with a lock icon, a plain reason and a link to fix
- Coverage table as a ledger: alternating faint rows, display-serif numerals.
- **Print stays white** (`@media print` token swap). The atmosphere layers, footer and Night wind are hidden in print. Check one printed page.

### 5. Error pages and loading (`feat/web-haunted-states`)
- 404 copy:
  - eyebrow `A LOCKED DOOR`
  - H1 `This room is <em>empty</em>.`
  - plain line `We could not find that page.`
  - amber button `Back to the dashboard`
- Error page: `Something <em>creaked</em>.` with a plain message and `Try again`.
- Loading skeletons: forest panels with a slow shimmer (static under reduced motion). Use `loading.tsx` for the workspace and report routes.

## Accessibility and quality gates (every PR)

- Token classes only, no raw hex (the theme test). Text at least 12 px and 4.5:1. Meaningful lines at least 3:1. Targets at least 24×24.
- All decoration is `aria-hidden`. The outlined giant words are `aria-hidden`. The heading text stays real text.
- `prefers-reduced-motion`: no drift, no flicker, no cursor light, no silhouettes, no pulse. Grain and vignette may stay (static).
- `forced-colors`: panels keep visible borders; decorative layers vanish.
- No flashing (WCAG 2.3.1). Audio off by default with a visible control (WCAG 1.4.2).
- Mobile at 375 px: no horizontal scroll, 16 px side gutters, and the hero art goes below the text.
- No new dependency. Next.js App Router, Tailwind, existing icons, plus new original SVGs in `components/icons/` or `components/ornaments/`.
- Keep every existing test id and e2e spec passing. Add unit tests for the claims map (state mapping, labels, click selects), the cabinet selection, the Night wind engine, and the header counter (hidden on error).

## Done when (per PR, paste real output)

- `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`
- `pnpm exec playwright test --project=chromium --workers=1` (including `tests/e2e/a11y.spec.ts`)
- `node tools/kiro-hooks/hook.mjs ghost-scan`
- CI `check` and `db` green
- Screenshots in the PR description: desktop 1440 px and mobile 375 px, plus one with reduced motion on
- A dated journal entry in `docs/kiro-engineering-journal.md` naming the Kiro features used (steering, spec, hooks, agent)

## Stop and report instead of guessing if

- a gate still fails after two different fix attempts
- you need to change contracts, the API, `packages/` or anything that sets evidence to `confirmed`
- a step is bigger than one day

## Do not

- copy any artwork, layout file, text, logo or audio from any game, studio or designer
- use audio files or samples (synthesize everything)
- start sound without a click, or play it under the demo video
- use gamified words, or show a number that is not real
