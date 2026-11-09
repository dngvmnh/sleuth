"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Project } from "@sleuth/contracts";
import { createApiClient, type ApiClient } from "@/lib/api-client";
import type { PanelStatus } from "@/components/state-panel";

/** Open-findings count for one project: still loading, a real number, or failed to load. */
export type OpenCount = { state: "loading" } | { state: "ready"; count: number } | { state: "error" };

export interface DashboardState {
  status: PanelStatus;
  projects: Project[];
  openCounts: Record<string, OpenCount>;
  errorMessage: string | undefined;
  creating: boolean;
  createError: string | undefined;
  reload: () => void;
  createProject: () => Promise<void>;
}

function messageOf(error: unknown): string {
  return error instanceof Error && error.message ? error.message : "Something went wrong.";
}

/**
 * "Last change" as shown on the dashboard: `project.updatedAt` in UTC, to the minute.
 * The API orders the list (the demo first, then the most recent change); the UI keeps that order.
 */
export function formatLastChange(updatedAt: string): string {
  const d = new Date(updatedAt);
  if (Number.isNaN(d.getTime())) return "unknown";
  return `${d.toISOString().slice(0, 16).replace("T", " ")} UTC`;
}

/** Loads projects and their open-findings counts, and offers a copy-from-demo create action. */
export function useDashboard(client?: ApiClient): DashboardState {
  const api = useMemo(() => client ?? createApiClient(), [client]);
  const [status, setStatus] = useState<PanelStatus>("loading");
  const [projects, setProjects] = useState<Project[]>([]);
  const [openCounts, setOpenCounts] = useState<Record<string, OpenCount>>({});
  const [errorMessage, setErrorMessage] = useState<string | undefined>(undefined);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | undefined>(undefined);
  const [attempt, setAttempt] = useState(0);
  // A ref blocks a second submit in the same tick, before React re-renders.
  const createInFlight = useRef(false);

  useEffect(() => {
    let cancelled = false;
    api
      .listProjects()
      .then((res) => {
        if (cancelled) return;
        // Keep the API order: the demo first, then the most recently changed.
        const sorted = res.projects;
        setProjects(sorted);
        setOpenCounts(Object.fromEntries(sorted.map((p) => [p.id, { state: "loading" } as OpenCount])));
        setStatus(sorted.length === 0 ? "empty" : "done");
        for (const project of sorted) {
          api
            .listFindings(project.id)
            .then((r) => {
              if (cancelled) return;
              const count = r.findings.filter((f) => f.status === "open").length;
              setOpenCounts((prev) => ({ ...prev, [project.id]: { state: "ready", count } }));
            })
            .catch(() => {
              if (cancelled) return;
              setOpenCounts((prev) => ({ ...prev, [project.id]: { state: "error" } }));
            });
        }
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setErrorMessage(messageOf(error));
        setStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, [api, attempt]);

  const reload = useCallback(() => {
    setStatus("loading");
    setErrorMessage(undefined);
    setAttempt((n) => n + 1);
  }, []);

  const createProject = useCallback(async () => {
    if (createInFlight.current) return;
    createInFlight.current = true;
    setCreating(true);
    setCreateError(undefined);
    try {
      await api.createProject("Copy of ProofPay demo", true);
      reload();
    } catch (error: unknown) {
      setCreateError(messageOf(error));
    } finally {
      createInFlight.current = false;
      setCreating(false);
    }
  }, [api, reload]);

  return {
    status,
    projects,
    openCounts,
    errorMessage,
    creating,
    createError,
    reload,
    createProject,
  };
}
