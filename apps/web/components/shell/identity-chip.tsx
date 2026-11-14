"use client";

import { useEffect, useState } from "react";
import { HoodedFigureIcon } from "@/components/icons";
import { useGuestAuth } from "@/components/guest-auth-provider";
import type { GuestAuth, ReviewerKind } from "@/lib/guest-auth";

/**
 * Who is reviewing, in two plain lines. The second line says only what is true: a guest
 * session lives in this browser until its data is cleared (see GuestSessionNote).
 */
export const IDENTITY_LINES: Record<ReviewerKind, [string, string]> = {
  visitor: ["Guest reviewer", "Not signed in, viewing only"],
  guest: ["Guest reviewer", "Guest session in this browser only"],
  team: ["Team reviewer", "Signed in with a team account"],
};

export function IdentityChip({ refreshKey, auth: given }: { refreshKey: string; auth?: GuestAuth }) {
  const shared = useGuestAuth();
  const auth = given ?? shared;
  const [kind, setKind] = useState<ReviewerKind | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    const read = auth.reviewerKind ? auth.reviewerKind() : Promise.resolve<ReviewerKind>("visitor");
    void read.then((k) => {
      if (!cancelled) setKind(k);
    });
    return () => {
      cancelled = true;
    };
  }, [auth, refreshKey]);

  const [title, detail] = IDENTITY_LINES[kind ?? "visitor"];
  return (
    <div className="flex items-center gap-2" data-testid="identity-chip">
      <span
        aria-hidden="true"
        className="flex size-8 flex-none items-center justify-center rounded-full border border-line-strong bg-raised text-gold"
      >
        <HoodedFigureIcon size={18} />
      </span>
      <span className="flex flex-col leading-tight">
        <span className="text-xs font-semibold text-foreground">{title}</span>
        {/* Wait for the real answer before saying anything about the session. */}
        {kind ? <span className="hidden text-xs text-muted xl:inline">{detail}</span> : null}
      </span>
    </div>
  );
}
