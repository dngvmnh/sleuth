"use client";

import Link from "next/link";
import { FINDING_LABELS } from "@sleuth/contracts";
import { ArrowUpRightIcon, FINDING_ICONS } from "@/components/icons";
import { GroundMist, LanternCursor, OrnamentDivider, PanelCorners } from "@/components/ornaments";
import type { ApiClient } from "@/lib/api-client";
import { HeroArt } from "./hero-art";
import { StepsRow } from "./steps-row";
import { formatClock, useDemoSnapshot, type DemoClue } from "./use-demo-snapshot";

const pad2 = (n: number) => String(n).padStart(2, "0");

/** `/projects/{id}`, with `?line=` so the workspace opens on that line. */
export function clueHref(demoId: string, clue: DemoClue): string {
  const base = `/projects/${encodeURIComponent(demoId)}`;
  return clue.segmentId ? `${base}?line=${encodeURIComponent(clue.segmentId)}` : base;
}

function ClueCard({ demoId, clue }: { demoId: string; clue: DemoClue }) {
  const label = FINDING_LABELS[clue.type];
  const Icon = FINDING_ICONS[clue.type];
  const where = [clue.line ? `Line ${clue.line}` : null, clue.startMs !== null ? formatClock(clue.startMs) : null]
    .filter(Boolean)
    .join(" · ");
  return (
    <Link
      href={clueHref(demoId, clue)}
      data-testid="clue-card"
      className="panel panel-lift relative block max-w-xs bg-surface p-4 sm:absolute sm:bottom-6 sm:left-0"
    >
      <PanelCorners />
      <span className="eyebrow">A clue from the demo</span>
      <span className="mt-2 flex items-center gap-2 text-sm font-semibold text-foreground">
        <Icon size={18} className="text-primary" />
        {label.spooky} · {label.plain}
      </span>
      {where ? <span className="mt-1 block text-xs text-muted tabular-nums">{where}</span> : null}
      <span className="mt-1 block truncate text-sm text-muted">{clue.excerpt}</span>
      <span className="sr-only"> Open it in the demo workspace.</span>
    </Link>
  );
}

/**
 * Dashboard hero, "The screening room", and the three-steps row under it. Numbers and the
 * clue come from the real demo through the API; anything that fails to load is not shown.
 */
export function DashboardHero({ client }: { client?: ApiClient }) {
  const snapshot = useDemoSnapshot(client);
  const demoHref = snapshot.demoId ? `/projects/${encodeURIComponent(snapshot.demoId)}` : null;
  const proven = snapshot.proven;

  return (
    <>
      <section
        aria-labelledby="hero-heading"
        className="relative overflow-hidden border-b border-line"
        data-testid="dashboard-hero"
      >
        <LanternCursor />
        <GroundMist />
        <div className="relative mx-auto grid max-w-6xl gap-10 px-4 py-12 sm:px-6 lg:grid-cols-2 lg:items-center lg:py-16">
          <div className="relative">
            <span
              className="outline-word absolute -top-6 left-0 text-[clamp(4rem,14vw,10rem)] opacity-30"
              aria-hidden="true"
            >
              Haunted
            </span>
            <p className="eyebrow relative">Chapter I · The screening room</p>
            <h1 id="hero-heading" className="relative mt-3 font-display text-5xl tracking-tight text-foreground sm:text-6xl">
              The cut is <em className="italic text-primary">haunted</em>.
            </h1>
            <p className="relative mt-4 max-w-xl text-muted">
              SLEUTH checks a demo video against its script and checklist. Every match is a candidate. Only a person
              confirms it.
            </p>
            <div className="relative mt-6 flex flex-wrap gap-3">
              {demoHref ? (
                <Link
                  href={demoHref}
                  className="sleuth-flicker inline-flex min-h-11 items-center gap-2 rounded-[2px] bg-primary px-5 py-2.5 text-sm font-semibold text-on-primary hover:bg-primary-strong"
                >
                  Open the public demo
                  <ArrowUpRightIcon size={16} />
                </Link>
              ) : null}
              <Link
                href="/#projects"
                className="inline-flex min-h-11 items-center rounded-[2px] border border-line-strong px-5 py-2.5 text-sm text-foreground hover:bg-raised"
              >
                Start a project
              </Link>
            </div>
            {proven ? (
              <div className="relative mt-6 max-w-sm" data-testid="hero-coverage">
                <p className="text-sm text-muted">
                  <span className="font-display text-2xl text-foreground tabular-nums">
                    {pad2(proven.done)} / {pad2(proven.total)}
                  </span>{" "}
                  · checklist items proven in the demo
                </p>
                <div className="mt-2 h-1 w-full bg-line" aria-hidden="true">
                  <div className="h-1 bg-gold" style={{ width: `${Math.round((proven.done / proven.total) * 100)}%` }} />
                </div>
              </div>
            ) : null}
          </div>

          <div className="relative">
            <HeroArt className="h-auto w-full max-w-xl justify-self-center" />
            {snapshot.clue && snapshot.demoId ? <ClueCard demoId={snapshot.demoId} clue={snapshot.clue} /> : null}
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <OrnamentDivider className="my-10" />
        <StepsRow demoId={snapshot.demoId} />
      </div>
    </>
  );
}
