"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { StatePanel } from "@/components/state-panel";
import { GuestSessionNote } from "@/components/guest-auth-provider";
import type { ApiClient } from "@/lib/api-client";
import type { GuestAuth } from "@/lib/guest-auth";
import { formatLastChange, useDashboard, type CreatePhase, type OpenCount } from "./use-dashboard";

const CREATE_LABEL: Record<CreatePhase, string> = {
  idle: "Create a project",
  signing_in: "Starting a guest session...",
  creating: "Creating...",
};

function openCountText(count: OpenCount | undefined): string {
  if (!count || count.state === "loading") return "Counting open findings...";
  if (count.state === "error") return "Open findings unavailable (could not load)";
  return `${count.count} open ${count.count === 1 ? "finding" : "findings"}`;
}

/**
 * Project list with loading, empty, error (retry) and done states.
 * Rows stay in the API order (the demo first, then the most recent change) and show
 * "Last change" from `project.updatedAt`.
 * Open findings come from listFindings; a failed load shows no number.
 */
export function ProjectList({ client, auth }: { client?: ApiClient; auth?: GuestAuth }) {
  const {
    status,
    projects,
    openCounts,
    errorMessage,
    creating,
    createPhase,
    createError,
    reload,
    createProject,
  } = useDashboard(client, auth);

  return (
    <div>
      <StatePanel
        status={status}
        errorMessage={errorMessage}
        onRetry={reload}
        onCreateProject={() => void createProject()}
        creating={creating}
      >
        <ul className="space-y-3">
          {projects.map((project) => (
            <li
              key={project.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-line bg-surface p-4"
            >
              <div>
                <Link
                  className="font-display text-xl text-primary-strong underline-offset-4 hover:underline"
                  href={`/projects/${encodeURIComponent(project.id)}`}
                >
                  {project.name}
                </Link>
                {project.isDemo ? (
                  <span className="ml-3 rounded border border-line px-2 py-0.5 text-xs text-muted">
                    Public demo, read-only
                  </span>
                ) : null}
                <p className="mt-1 text-sm text-muted">
                  {openCountText(openCounts[project.id])} · Last change{" "}
                  <time dateTime={project.updatedAt}>{formatLastChange(project.updatedAt)}</time>
                </p>
              </div>
              {project.isDemo ? (
                <Link
                  href={`/projects/${encodeURIComponent(project.id)}`}
                  className="rounded-md border border-line-strong px-3 py-1.5 text-sm text-foreground hover:bg-raised"
                  aria-label={`Open demo: ${project.name}`}
                >
                  Open demo
                </Link>
              ) : null}
            </li>
          ))}
        </ul>
        {status === "done" ? (
          <div className="mt-4">
            <Button
              onClick={() => void createProject()}
              disabled={creating}
              aria-busy={creating}
            >
              {CREATE_LABEL[createPhase]}
            </Button>
            <GuestSessionNote className="mt-2" auth={auth} />
          </div>
        ) : null}
      </StatePanel>
      {createError ? (
        <p role="alert" className="mt-3 text-sm text-danger">
          {createError}
        </p>
      ) : null}
    </div>
  );
}
