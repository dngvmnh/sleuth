"use client";

import Link from "next/link";
import { PanelCorners } from "@/components/ornaments";

/** Shown when a page throws. It never prints the error text: that can hold internal details. */
export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main id="main-content" role="alert" className="mx-auto max-w-xl px-4 py-16 sm:px-6">
      <div className="panel p-8 text-center">
        <PanelCorners />
        <p className="eyebrow justify-center">Something went wrong</p>
        <h1 className="mt-3 font-display text-4xl text-foreground">
          Something <em className="italic text-primary">creaked</em>.
        </h1>
        <p className="mt-3 text-muted">This page could not load. Nothing you saved was lost.</p>
        <p className="mt-1 text-sm text-muted">Try again. If it keeps happening, go back to the dashboard.</p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <button
            type="button"
            onClick={reset}
            className="sleuth-flicker inline-flex min-h-11 items-center rounded-[2px] bg-primary px-5 text-sm font-semibold text-on-primary hover:bg-primary-strong"
          >
            Try again
          </button>
          <Link
            href="/"
            className="inline-flex min-h-11 items-center rounded-[2px] border border-line-strong px-5 text-sm text-foreground hover:bg-raised"
          >
            Back to the dashboard
          </Link>
        </div>
      </div>
    </main>
  );
}
