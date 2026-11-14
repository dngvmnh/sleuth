"use client";

import { useEffect, useState } from "react";
import { useGuestAuth } from "@/components/guest-auth-provider";
import type { GuestAuth } from "@/lib/guest-auth";

/** The id of the person looking at the page, from the local session; null until known or when signed out. */
export function useViewerId(auth?: GuestAuth): string | null {
  const shared = useGuestAuth();
  const source = auth ?? shared;
  const [id, setId] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    const read = source.currentUserId ? source.currentUserId() : Promise.resolve(null);
    void read.then((value) => {
      if (!cancelled) setId(value);
    });
    return () => {
      cancelled = true;
    };
  }, [source]);
  return id;
}
