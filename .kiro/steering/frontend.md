---
inclusion: fileMatch
fileMatchPattern: ["apps/web/**"]
---

# Frontend rules

Scope: `apps/web`. API route files under `apps/web/app/api/` also load `backend.md`; the two do not conflict.

## Visual direction

Premium haunted film studio, not a cartoon. Midnight charcoal and deep purple backgrounds, spectral violet primary accent, candlelight amber for warnings. Clean sans-serif for UI text, cinematic serif for display headings. Thin borders, subtle fog, glowing timeline markers. Icons: ghosts, lanterns, film reels, wax seals.

Design tokens live in `apps/web/styles/`. Use tokens, never raw hex in components.

## Accessibility

- Text meets WCAG AA contrast on every background, including over fog.
- The timeline is fully keyboard navigable (arrow keys move markers, Enter seeks, Escape leaves).
- `prefers-reduced-motion: reduce` turns off fog, glow and pulsing.
- Interactive elements have visible focus rings and accessible names.
- Never rely on colour alone to show a finding type.

## Labels

Every spooky label has an ordinary-language label beside it (see `product.md`). Never show "Ghost" alone.

## States

Every screen handles loading, empty, processing, failed and done.
