"use client";

import { useEffect, useMemo, useState } from "react";
import { useApiClient } from "@/components/guest-auth-provider";
import type { ApiClient } from "@/lib/api-client";

/** The real number of open findings across the visitor's projects, or why there is none. */
export type OpenFindingsTotal = { state: "loading" } | { state: "ready"; count: number } | { state: "error" };

/**
 * Adds up open findings over every project the visitor can see (the demo and their own).
 * If any project fails to load, the total is an error: a partial sum would be a wrong number.
 * A change of `refreshKey` (page or save) counts again; the last real total stays meanwhile.
 */
export function useOpenFindings(refreshKey: string, client?: ApiClient): OpenFindingsTotal {
  const shared = useApiClient();
  const api = useMemo(() => client ?? shared, [client, shared]);
  const [total, setTotal] = useState<OpenFindingsTotal>({ state: "loading" });

  useEffect(() => {
    let cancelled = false;
    api
      .listProjects()
      .then(({ projects }) => Promise.all(projects.map((p) => api.listFindings(p.id))))
      .then((lists) => {
        if (cancelled) return;
        const count = lists.reduce((n, r) => n + r.findings.filter((f) => f.status === "open").length, 0);
        setTotal({ state: "ready", count });
      })
      .catch(() => {
        if (!cancelled) setTotal({ state: "error" });
      });
    return () => {
      cancelled = true;
    };
  }, [api, refreshKey]);

  return total;
}
