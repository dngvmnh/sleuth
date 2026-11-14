export type DividerGlyph = "diamond" | "key";

function Glyph({ glyph }: { glyph: DividerGlyph }) {
  if (glyph === "key") {
    return (
      <svg viewBox="0 0 20 10" width={20} height={10} fill="none" stroke="currentColor" strokeWidth={1} aria-hidden="true" focusable="false">
        <circle cx="4" cy="5" r="2.5" />
        <path d="M6.5 5H17M14 5v2.5M16.5 5v1.8" strokeLinecap="round" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 12 12" width={12} height={12} fill="none" stroke="currentColor" strokeWidth={1} aria-hidden="true" focusable="false">
      <path d="M6 1 11 6 6 11 1 6Z" />
      <path d="M6 4 8 6 6 8 4 6Z" fill="currentColor" stroke="none" />
    </svg>
  );
}

/**
 * A section divider: a thin rule on each side of a small centred ornament. Decorative only
 * (`aria-hidden`), so it never adds a separator to the reading order.
 */
export function OrnamentDivider({ glyph = "diamond", className = "" }: { glyph?: DividerGlyph; className?: string }) {
  return (
    <div aria-hidden="true" data-ornament="divider" className={`flex items-center gap-3 text-line-strong ${className}`}>
      <span className="h-px flex-1 bg-line" />
      <Glyph glyph={glyph} />
      <span className="h-px flex-1 bg-line" />
    </div>
  );
}
