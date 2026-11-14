"use client";

import { Button } from "@/components/ui/button";

/**
 * CSV and printable HTML from the existing export endpoints, and a Print button that prints
 * this page. The print styles in `globals.css` give a light page with no animation.
 */
export function ExportButtons({ projectId, print = () => window.print() }: { projectId: string; print?: () => void }) {
  const base = `/api/v1/projects/${encodeURIComponent(projectId)}`;
  const link =
    "inline-flex h-8 items-center rounded-md border border-line-strong px-3 text-sm text-foreground hover:bg-raised";
  return (
    <section aria-labelledby="export-heading" className="rounded-md border border-line bg-surface p-4 print:hidden">
      <h2 id="export-heading" className="font-display text-xl text-foreground">
        Export
      </h2>
      <p className="mt-1 text-sm text-muted">
        The exports hold the same report: seal status, coverage, findings, reshoots and outside proof. They never hold
        transcripts, frames or links to the video.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <a className={link} href={`${base}/report.csv`} download>
          Download CSV
        </a>
        <a className={link} href={`${base}/report.html`} target="_blank" rel="noopener">
          Open printable HTML
        </a>
        <Button size="sm" variant="outline" onClick={print}>
          Print
        </Button>
      </div>
    </section>
  );
}
