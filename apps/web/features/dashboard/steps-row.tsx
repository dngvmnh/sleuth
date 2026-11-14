import Link from "next/link";
import type { ReactNode } from "react";
import { PanelCorners } from "@/components/ornaments";

/** Small original vignettes, one per step. Decorative; the caption carries the meaning. */
function Vignette({ children }: { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 120 72"
      className="h-20 w-full"
      fill="none"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

/** A scroll with a quill: the script and checklist. */
function ScrollArt() {
  return (
    <Vignette>
      <path d="M30 14H86A6 6 0 0 1 86 26H34V58H90" className="stroke-line-strong" />
      <path d="M30 14A6 6 0 0 0 30 26H34M90 58A6 6 0 0 0 90 46H86V26" className="stroke-line-strong" />
      <path d="M42 34H76M42 41H72M42 48H64" className="stroke-muted" />
      <path d="M98 8C88 16 80 30 76 44L80 42C86 32 94 20 98 8Z" className="stroke-gold" />
    </Vignette>
  );
}

/** A film can and a strip rising out of it: the upload. */
function FilmCanArt() {
  return (
    <Vignette>
      <ellipse cx="60" cy="56" rx="26" ry="8" className="stroke-line-strong" />
      <path d="M34 56V48C34 43 86 43 86 48V56" className="stroke-line-strong" />
      <path d="M54 44V10H66V44" className="stroke-gold" />
      <path d="M57 16H63M57 24H63M57 32H63" className="stroke-gold" />
      <path d="M48 14 60 4 72 14" className="stroke-primary" />
    </Vignette>
  );
}

/** A wax seal with a ribbon: the Final Seal. */
function SealArt() {
  return (
    <Vignette>
      <path d="M50 46 42 66 52 60 56 68 60 48M70 46 78 66 68 60 64 68 60 48" className="stroke-line-strong" />
      <circle cx="60" cy="32" r="20" className="stroke-gold" />
      <circle cx="60" cy="32" r="13" className="stroke-gold" strokeDasharray="2 3" />
      <path d="M53 32 58 37 67 27" className="stroke-primary" />
    </Vignette>
  );
}

interface Step {
  numeral: string;
  title: string;
  caption: string;
  href: (demoId: string) => string;
  art: () => ReactNode;
}

const STEPS: Step[] = [
  {
    numeral: "I",
    title: "Write what you promise",
    caption: "The script and the checklist: what the demo must say and show.",
    href: (id) => `/projects/${encodeURIComponent(id)}`,
    art: ScrollArt,
  },
  {
    numeral: "II",
    title: "Upload the cut",
    caption: "One video, up to 3 minutes. The check matches it line by line.",
    href: (id) => `/projects/${encodeURIComponent(id)}`,
    art: FilmCanArt,
  },
  {
    numeral: "III",
    title: "Press the seal",
    caption: "When a person has checked everything, the report gets the Final Seal.",
    href: (id) => `/projects/${encodeURIComponent(id)}/report`,
    art: SealArt,
  },
];

/** "A little further into the cut": the three steps, each linked into the demo. */
export function StepsRow({ demoId }: { demoId: string | null }) {
  return (
    <section aria-labelledby="steps-heading" className="pb-4">
      <h2 id="steps-heading" className="font-display text-3xl text-foreground">
        A little further <em className="italic text-primary">into the cut</em>.
      </h2>
      <ol className="mt-6 grid gap-4 md:grid-cols-3" role="list">
        {STEPS.map((step) => {
          const Art = step.art;
          const body = (
            <>
              <PanelCorners />
              <Art />
              <span className="mt-3 block font-display text-xl text-foreground">
                <span className="text-gold">{step.numeral}</span> · {step.title}
              </span>
              <span className="mt-1 block text-sm text-muted">{step.caption}</span>
            </>
          );
          return (
            <li key={step.numeral}>
              {demoId ? (
                <Link href={step.href(demoId)} className="panel panel-lift block h-full p-5">
                  {body}
                </Link>
              ) : (
                <div className="panel block h-full p-5">{body}</div>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
