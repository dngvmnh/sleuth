import type { Ref } from "react";
import type { Seal } from "@sleuth/contracts";

/**
 * Wax-seal confirmation, shown only after the server returned the new seal.
 * The stamp animation uses `.sleuth-seal-stamp`, which reduced motion turns off (tokens.css).
 */
export function SealConfirmation({ seal, ref }: { seal: Seal; ref?: Ref<HTMLDivElement> }) {
  return (
    <div
      ref={ref}
      tabIndex={-1}
      role="group"
      aria-label="Final Seal applied"
      className="mt-4 flex items-center gap-4 rounded-md border border-ok bg-surface p-4"
      data-testid="seal-confirmation"
    >
      <svg
        width="56"
        height="56"
        viewBox="0 0 56 56"
        aria-hidden="true"
        className="sleuth-seal-stamp shrink-0 text-danger"
      >
        <path
          d="M28 3 L33 8 L40 6 L42 13 L49 15 L47 22 L53 28 L47 34 L49 41 L42 43 L40 50 L33 48 L28 53 L23 48 L16 50 L14 43 L7 41 L9 34 L3 28 L9 22 L7 15 L14 13 L16 6 L23 8 Z"
          fill="currentColor"
        />
        <circle cx="28" cy="28" r="13" fill="none" stroke="var(--sleuth-bg)" strokeWidth="2" />
        <path d="M21 28.5 L26 33 L35 23" fill="none" stroke="var(--sleuth-bg)" strokeWidth="3" />
      </svg>
      <div>
        <p className="font-display text-lg text-foreground">Final Seal applied</p>
        <p className="text-sm text-muted">
          {/* Shown only to the person who just pressed the seal, so the signer is always `you`. */}
          <span title={`Audit id: ${seal.sealedBy}`}>Signed off by you</span> at{" "}
          {seal.sealedAt.slice(0, 16).replace("T", " ")} UTC.
          {seal.note ? ` Note: ${seal.note}` : ""}
        </p>
      </div>
    </div>
  );
}
