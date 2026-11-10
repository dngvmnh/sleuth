"use client";

import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";

// ---------------------------------------------------------------------------
// Loading skeleton
// ---------------------------------------------------------------------------

/** A single animated placeholder bar. Respects reduced-motion via CSS. */
function SkeletonBar({ className = "" }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={`rounded-md bg-raised animate-pulse motion-reduce:animate-none ${className}`}
    />
  );
}

export function LoadingSkeleton({
  rows = 3,
  label = "Loading projects",
}: {
  rows?: number;
  label?: string;
}) {
  return (
    <div role="status" aria-label={label} className="space-y-3">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="rounded-md border border-line bg-surface p-4 space-y-2">
          <SkeletonBar className="h-5 w-2/3" />
          <SkeletonBar className="h-3 w-1/3" />
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

export function EmptyState({
  onCreateProject,
  creating = false,
}: {
  onCreateProject?: () => void;
  creating?: boolean;
}) {
  return (
    <div className="rounded-md border border-line bg-surface p-8 text-center">
      {/* Lantern icon: unicode approximation; real icon set can replace this */}
      <span className="text-4xl" aria-hidden="true">🏮</span>
      <p className="mt-4 font-display text-lg text-foreground">No projects yet</p>
      <p className="mt-1 text-sm text-muted">
        Start with a copy of the demo project to see how SLEUTH works.
      </p>
      {onCreateProject ? (
        <Button
          className="mt-6"
          onClick={onCreateProject}
          disabled={creating}
          aria-busy={creating}
        >
          {creating ? "Creating..." : "Create a project"}
        </Button>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Error state
// ---------------------------------------------------------------------------

export function ErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <div className="rounded-md border border-danger bg-surface p-6" role="alert">
      <p className="font-medium text-danger">Something went wrong</p>
      <p className="mt-1 text-sm text-muted">{message}</p>
      <Button variant="outline" size="sm" className="mt-4" onClick={onRetry}>
        Try again
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Processing state (used by workspace job polling; included here for re-use)
// ---------------------------------------------------------------------------

export function ProcessingState({ statusText }: { statusText: string }) {
  return (
    <div role="status" className="rounded-md border border-line bg-surface p-6 text-center">
      <p className="font-medium text-foreground">{statusText}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Generic wrapper: picks the right panel based on status
// ---------------------------------------------------------------------------

export type PanelStatus = "loading" | "empty" | "error" | "done";

export function StatePanel({
  status,
  errorMessage,
  onRetry,
  onCreateProject,
  creating = false,
  children,
}: {
  status: PanelStatus;
  errorMessage?: string;
  onRetry?: () => void;
  onCreateProject?: () => void;
  creating?: boolean;
  children?: ReactNode;
}) {
  if (status === "loading") return <LoadingSkeleton />;
  if (status === "error") {
    return (
      <ErrorState
        message={errorMessage ?? "An unexpected error occurred."}
        onRetry={onRetry ?? (() => undefined)}
      />
    );
  }
  if (status === "empty") return <EmptyState onCreateProject={onCreateProject} creating={creating} />;
  return <>{children}</>;
}
