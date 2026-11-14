import type { CSSProperties } from "react";

export type CornerPosition = "top-left" | "top-right" | "bottom-left" | "bottom-right";

const PLACE: Record<CornerPosition, string> = {
  "top-left": "left-1 top-1",
  "top-right": "right-1 top-1 -scale-x-100",
  "bottom-left": "bottom-1 left-1 -scale-y-100",
  "bottom-right": "bottom-1 right-1 -scale-100",
};

/**
 * A tiny filigree mark for one corner of a panel: an L-shaped rule that curls into a small
 * scroll, with a dot at the bend. Original drawing. Decorative only, so hidden from screen
 * readers, and drawn in `currentColor` (default `text-line-strong`).
 * The parent needs `position: relative`.
 */
export function Corner({
  position,
  className = "",
  style,
}: {
  position: CornerPosition;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <svg
      viewBox="0 0 12 12"
      width={12}
      height={12}
      fill="none"
      stroke="currentColor"
      strokeWidth={1}
      strokeLinecap="round"
      aria-hidden="true"
      focusable="false"
      data-ornament="corner"
      style={style}
      className={`pointer-events-none absolute text-line-strong ${PLACE[position]} ${className}`}
    >
      <path d="M1 11V3.5A2.5 2.5 0 0 1 3.5 1H11" />
      <path d="M4 1.2c0 1.6-1.2 2.8-2.8 2.8" />
      <path d="M6.5 3.5a1.2 1.2 0 1 1-1.2 1.2" />
      <circle cx="3.6" cy="3.6" r="0.6" fill="currentColor" stroke="none" />
    </svg>
  );
}

/** All four corner marks at once, for a `.panel`. */
export function PanelCorners({ className }: { className?: string }) {
  return (
    <>
      <Corner position="top-left" className={className} />
      <Corner position="top-right" className={className} />
      <Corner position="bottom-left" className={className} />
      <Corner position="bottom-right" className={className} />
    </>
  );
}
