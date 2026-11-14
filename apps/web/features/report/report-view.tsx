"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { FindingBadge } from "@/components/finding-badge";
import { RouteLoading } from "@/components/route-loading";
import { ErrorState } from "@/components/state-panel";
import type { ApiClient } from "@/lib/api-client";
import { CoverageTable } from "./coverage-table";
import { OutsideProofList } from "./outside-proof-list";
import { ReshootList } from "./reshoot-list";
import { ExportButtons } from "./export-buttons";
import { CloseIcon, FileIcon, WaxSealIcon } from "@/components/icons";
import { PanelCorners } from "@/components/ornaments";
import { HONESTY_NOTES, sealBanner } from "./labels";
import { SealPanel } from "./seal-panel";
import styles from "./report.module.css";
import { useReport, type ReportData, type SealResult } from "./use-report";

function Section({
  id,
  title,
  eyebrow,
  children,
}: {
  id: string;
  title: string;
  /** Decorative label above the heading; the heading carries the meaning. */
  eyebrow?: string;
  children: ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="panel p-5">
      <PanelCorners />
      {eyebrow ? (
        <p className="eyebrow mb-2" aria-hidden="true">
          {eyebrow}
        </p>
      ) : null}
      <h2 id={id} className="font-display text-2xl text-foreground">
        {title}
      </h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

/** An icon per status, so the banner never relies on colour alone. */
function BannerIcon({ status }: { status: "draft" | "sealed" | "broken" }) {
  if (status === "sealed") return <WaxSealIcon size={24} />;
  if (status === "broken") return <CloseIcon size={24} />;
  return <FileIcon size={24} />;
}

const BANNER_CLASS = {
  draft: styles.statusDraft,
  sealed: styles.statusSealed,
  broken: styles.statusBroken,
} as const;

function lineText(data: ReportData, segmentId: string | null): string | undefined {
  if (!segmentId) return undefined;
  const s = data.project.scriptVersion?.segments.find((x) => x.id === segmentId);
  return s ? `Line ${s.index + 1}: ${s.text}` : undefined;
}

function itemText(data: ReportData, id: string | null): string | undefined {
  if (!id) return undefined;
  return data.project.checklist.find((c) => c.id === id)?.label;
}

export interface ReportManage {
  canManage: boolean;
  updatingReshootId: string | undefined;
  reshootError: { reshootId: string; message: string } | undefined;
  onMarkDone: (reshootId: string) => void;
  onRequestReshoot: (checklistItemId: string, note: string) => Promise<boolean>;
  onSeal: (note: string) => Promise<SealResult>;
}

const READ_ONLY: ReportManage = {
  canManage: false,
  updatingReshootId: undefined,
  reshootError: undefined,
  onMarkDone: () => undefined,
  onRequestReshoot: async () => false,
  onSeal: async () => ({ kind: "ignored" }),
};

/** The report in the order of final-seal requirement 4.1. The owner can mark reshoots done. */
export function ReportBody({ data, manage = READ_ONLY }: { data: ReportData; manage?: ReportManage }) {
  const banner = sealBanner(data.seal);

  return (
    <div className="space-y-6">
      {/* Seal status first, so a draft or broken seal is the first thing anyone reads (4.2, 3.6). */}
      <div
        role="status"
        data-testid="seal-banner"
        data-status={banner.status}
        className={`panel border-2 p-4 ${BANNER_CLASS[banner.status]}`}
      >
        <p className="flex items-center gap-2 font-display text-2xl text-foreground">
          <span className={banner.status === "sealed" ? "text-gold" : banner.status === "broken" ? "text-danger" : "text-warn"}>
            <BannerIcon status={banner.status} />
          </span>
          {banner.title}
        </p>
        {banner.detail ? <p className="mt-1 text-sm text-muted">{banner.detail}</p> : null}
        {data.seal?.note ? <p className="mt-1 text-sm text-muted">Sign-off note: {data.seal.note}</p> : null}
      </div>

      {/* 4.1 order: project name, seal status, coverage, findings, open reshoots, outside proof, limits. */}
      <header className={styles.hero}>
        {/* The outlined word follows the real seal: SEALED only while an active seal holds. */}
        <p className={`outline-word ${styles.heroWord}`} aria-hidden="true" data-testid="seal-word">
          {banner.status === "sealed" ? "SEALED" : "UNSEALED"}
        </p>
        <div className={styles.heroBody}>
          <p className="text-sm">
            <Link
              className="text-primary-strong underline-offset-4 hover:underline"
              href={`/projects/${encodeURIComponent(data.project.project.id)}`}
            >
              Back to the workspace
            </Link>
          </p>
          <p className="eyebrow mt-4" aria-hidden="true">
            Chapter III · The verdict
          </p>
          <h1 className="mt-2 font-display text-4xl tracking-tight text-foreground sm:text-5xl">
            The final <em className="italic text-primary">seal</em>.
            <span className="mt-1 block text-xl text-muted sm:text-2xl">{data.project.project.name}</span>
          </h1>
          <p className="mt-2 text-sm text-muted">Final Seal report</p>
        </div>
      </header>

      {/* 3. Coverage summary and per-item states */}
      <Section id="report-coverage" title="Coverage" eyebrow="The ledger">
        <CoverageTable
          coverage={data.coverage}
          checklist={data.project.checklist}
          actions={
            manage.canManage
              ? {
                  updatingId: manage.updatingReshootId,
                  error: manage.reshootError,
                  onRequestReshoot: manage.onRequestReshoot,
                }
              : undefined
          }
        />
      </Section>

      {/* 4. Findings with spooky and plain labels */}
      <Section id="report-findings" title="Findings" eyebrow="The cabinet">
        {data.findings.length === 0 ? (
          <p className="text-sm text-muted">No findings. That does not mean every item is proven; see the coverage above.</p>
        ) : (
          <ul className="space-y-3">
            {data.findings.map((f) => {
              const about = [itemText(data, f.checklistItemId), lineText(data, f.scriptSegmentId)].filter(Boolean);
              return (
                <li key={f.id} className="panel-inset p-3 text-sm" data-testid="report-finding">
                  <div className="flex flex-wrap items-center gap-2">
                    <FindingBadge type={f.type} />
                    <span className="text-xs text-muted">{f.status === "open" ? "Open" : "Resolved"}</span>
                  </div>
                  {about.length > 0 ? <p className="mt-2 text-muted">About: {about.join(" · ")}</p> : null}
                  <dl className="mt-2 space-y-1">
                    <div>
                      <dt className="inline font-medium text-foreground">What was found: </dt>
                      <dd className="inline text-muted">{f.found}</dd>
                    </div>
                    <div>
                      <dt className="inline font-medium text-foreground">What was not found: </dt>
                      <dd className="inline text-muted">{f.notFound}</dd>
                    </div>
                    <div>
                      <dt className="inline font-medium text-foreground">Limits of this check: </dt>
                      <dd className="inline text-muted">{f.limits}</dd>
                    </div>
                  </dl>
                </li>
              );
            })}
          </ul>
        )}
      </Section>

      {/* 5. Reshoots: open first, then done. The owner can mark one done. */}
      <Section id="report-reshoots" title="Reshoots" eyebrow="Back to the set">
        <ReshootList
          reshoots={data.reshoots}
          checklist={data.project.checklist}
          segments={data.project.scriptVersion?.segments ?? []}
          canManage={manage.canManage}
          updatingId={manage.updatingReshootId}
          error={manage.reshootError}
          onMarkDone={manage.onMarkDone}
        />
      </Section>

      {/* 6. Outside-proof list */}
      <Section id="report-outside-proof" title="Needs outside proof (footage cannot prove this)" eyebrow="Beyond the frame">
        <OutsideProofList items={data.coverage.outsideProof} segments={data.project.scriptVersion?.segments ?? []} />
      </Section>

      {/* 7. Limits of the checks */}
      <Section id="report-limits" title="Limits of these checks" eyebrow="The small print">
        <ul className="list-disc space-y-1 pl-5 text-sm text-muted">
          {HONESTY_NOTES.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      </Section>

      {/* Actions after the content, so the person reads the report before signing (task 9). */}
      <SealPanel
        projectId={data.project.project.id}
        seal={data.seal}
        blockers={data.blockers}
        canManage={manage.canManage}
        onSeal={manage.onSeal}
      />
      <ExportButtons projectId={data.project.project.id} />
    </div>
  );
}

export function ReportView({ projectId, client }: { projectId: string; client?: ApiClient }) {
  const report = useReport(projectId, client);

  if (report.status === "loading") {
    return (
      <RouteLoading label="Loading report" layout="report" />
    );
  }
  if (report.status === "not_found") {
    return (
      <div className="mx-auto max-w-3xl px-6 py-10">
        <div role="alert" className="rounded-md border border-line bg-surface p-6">
          <h1 className="font-display text-2xl">Project not found</h1>
          <p className="mt-2 text-sm text-muted">This project does not exist, or you do not have access to it.</p>
          <p className="mt-4 text-sm">
            <Link className="text-primary-strong underline-offset-4 hover:underline" href="/">
              Back to dashboard
            </Link>
          </p>
        </div>
      </div>
    );
  }
  if (report.status === "error" || !report.data) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-10">
        <ErrorState message={report.errorMessage ?? "The report could not be loaded."} onRetry={report.reload} />
      </div>
    );
  }
  return (
    <div className="mx-auto max-w-4xl px-6 py-10">
      <ReportBody
        data={report.data}
        manage={{
          canManage: report.canManage,
          updatingReshootId: report.updatingReshootId,
          reshootError: report.reshootError,
          onMarkDone: (id) => void report.updateReshoot(id, "done"),
          onRequestReshoot: report.requestReshoot,
          onSeal: report.seal,
        }}
      />
    </div>
  );
}
