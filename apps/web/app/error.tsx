"use client";

import Link from "next/link";

/** Shown when a page throws. It never prints the error text: that can hold internal details. */
export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main id="main-content" role="alert" className="mx-auto max-w-xl p-8 text-center">
      <p className="text-xs uppercase tracking-widest text-muted">Something went wrong</p>
      <h1 className="mt-2 font-display text-3xl text-foreground">
        This page <em>broke</em>
      </h1>
      <p className="mt-3 text-sm text-muted">
        Nothing you saved was lost. Try again. If it keeps happening, go back to your projects.
      </p>
      <div className="mt-6 flex justify-center gap-3">
        <button
          type="button"
          onClick={reset}
          className="inline-flex h-10 items-center rounded-md border border-primary bg-primary px-4 text-sm font-medium text-on-primary hover:bg-primary-strong"
        >
          Try again
        </button>
        <Link
          href="/"
          className="inline-flex h-10 items-center rounded-md border border-line-strong px-4 text-sm text-foreground hover:bg-raised"
        >
          Back to your projects
        </Link>
      </div>
    </main>
  );
}