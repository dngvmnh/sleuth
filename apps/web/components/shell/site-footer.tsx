import { SaveStatusIndicator } from "./save-status";

/**
 * The keys listed here are the ones that really work today, in the workspace timeline
 * (features/timeline/timeline.tsx): arrows move between markers, Escape goes back to the
 * script, Tab moves to the next control.
 */
export const KEY_HINTS: { keys: string[]; spoken: string; action: string }[] = [
  { keys: ["←", "→"], spoken: "Left and Right arrow keys", action: "Move between markers" },
  { keys: ["Esc"], spoken: "Escape", action: "Back to the script" },
  { keys: ["Tab"], spoken: "Tab", action: "Next control" },
];

/** Site footer: keyboard hints, the motto and the save indicator. Hidden in print. */
export function SiteFooter() {
  return (
    <footer data-print="hide" className="mt-16 border-t border-line bg-surface/60 print:hidden">
      <div className="mx-auto grid max-w-6xl gap-4 px-4 py-4 sm:px-6 lg:grid-cols-[1fr_auto_1fr] lg:items-center">
        <ul aria-label="Keyboard keys" className="flex flex-wrap gap-x-5 gap-y-2 text-xs text-muted" role="list">
          {KEY_HINTS.map((hint) => (
            <li key={hint.action} className="inline-flex items-center gap-1.5">
              <span className="sr-only">{hint.spoken}:</span>
              {hint.keys.map((key) => (
                <kbd key={key} className="kbd" aria-hidden="true">
                  {key}
                </kbd>
              ))}
              <span className="ml-1">{hint.action}</span>
            </li>
          ))}
        </ul>
        <p className="eyebrow lg:justify-self-center">All Hallows&apos; cut · Every claim needs proof</p>
        <div className="lg:justify-self-end">
          <SaveStatusIndicator />
        </div>
      </div>
    </footer>
  );
}
