import { FINDING_LABELS } from "@sleuth/contracts";
import type { Labels, LabelledType } from "./schema";

export type Row = LabelledType | "unscripted" | "reordered";
export const ROWS: readonly Row[] = [
  "ghost",
  "phantom_dialogue",
  "cursed_frame",
  "needs_outside_proof",
  "unscripted",
  "reordered",
];

export interface ProducedFinding {
  type: LabelledType;
  /** From 1. Every type except `ghost`. */
  scriptLine?: number;
  /** From 1. `ghost` only. */
  checklistItem?: number;
}

export interface ProducedAnalysis {
  findings: ProducedFinding[];
  /** Spoken segments no script line uses. */
  unscripted: { startMs: number; endMs: number }[];
  /** Script lines (from 1) spoken out of the script's order. */
  reordered: number[];
}

export interface Counts {
  /** Labelled and found. */
  right: number;
  /** Found but not labelled. */
  extra: number;
  /** Labelled but not found. */
  missed: number;
}

export interface Disagreement {
  clip: string;
  row: Row;
  kind: "missed" | "extra";
  target: string;
}

export interface ClipScore {
  clip: string;
  counts: Record<Row, Counts>;
  disagreements: Disagreement[];
}

/** An unscripted sentence counts as found when a leftover spoken segment lies this close to it. */
export const UNSCRIPTED_TOLERANCE_MS = 1500;

const emptyCounts = (): Record<Row, Counts> =>
  Object.fromEntries(ROWS.map((r) => [r, { right: 0, extra: 0, missed: 0 }])) as Record<
    Row,
    Counts
  >;

const targetOf = (f: {
  scriptLine?: number | undefined;
  checklistItem?: number | undefined;
}): string =>
  f.checklistItem !== undefined
    ? `checklist item ${f.checklistItem}`
    : `script line ${f.scriptLine}`;

const keyOf = (
  type: LabelledType,
  f: { scriptLine?: number | undefined; checklistItem?: number | undefined },
): string => `${type}|${targetOf(f)}`;

/** Compares what a person labelled with what the analysis produced for one clip. */
export function scoreClip(clip: string, labels: Labels, produced: ProducedAnalysis): ClipScore {
  const counts = emptyCounts();
  const disagreements: Disagreement[] = [];
  const note = (row: Row, kind: "missed" | "extra", target: string) => {
    counts[row][kind === "missed" ? "missed" : "extra"] += 1;
    disagreements.push({ clip, row, kind, target });
  };

  const expected = new Map(labels.findings.map((f) => [keyOf(f.type, f), f]));
  const found = new Map(produced.findings.map((f) => [keyOf(f.type, f), f]));
  for (const [key, f] of expected) {
    if (found.has(key)) counts[f.type].right += 1;
    else note(f.type, "missed", targetOf(f));
  }
  for (const [key, f] of found) if (!expected.has(key)) note(f.type, "extra", targetOf(f));

  // Unscripted sentences: match each labelled time to one leftover spoken segment.
  const free = produced.unscripted.map((u) => ({ ...u, used: false }));
  for (const { atMs } of labels.unscripted) {
    const distance = (u: { startMs: number; endMs: number }) =>
      atMs < u.startMs ? u.startMs - atMs : atMs > u.endMs ? atMs - u.endMs : 0;
    let best: (typeof free)[number] | undefined;
    for (const u of free) {
      if (u.used || distance(u) > UNSCRIPTED_TOLERANCE_MS) continue;
      if (!best || distance(u) < distance(best)) best = u;
    }
    if (best) {
      best.used = true;
      counts.unscripted.right += 1;
    } else note("unscripted", "missed", `a sentence at ${atMs} ms`);
  }
  for (const u of free)
    if (!u.used) note("unscripted", "extra", `a spoken segment at ${u.startMs}-${u.endMs} ms`);

  const wanted = new Set(labels.reordered);
  const got = new Set(produced.reordered);
  for (const line of wanted) {
    if (got.has(line)) counts.reordered.right += 1;
    else note("reordered", "missed", `script line ${line}`);
  }
  for (const line of got) if (!wanted.has(line)) note("reordered", "extra", `script line ${line}`);

  return { clip, counts, disagreements };
}

export interface RowSummary extends Counts {
  /** right / (right + extra); null when nothing was found. */
  precision: number | null;
  /** right / (right + missed); null when nothing was labelled. */
  recall: number | null;
}

export function summarise(scores: readonly ClipScore[]): Record<Row, RowSummary> {
  const out = {} as Record<Row, RowSummary>;
  for (const row of ROWS) {
    const total = { right: 0, extra: 0, missed: 0 };
    for (const s of scores) {
      total.right += s.counts[row].right;
      total.extra += s.counts[row].extra;
      total.missed += s.counts[row].missed;
    }
    const found = total.right + total.extra;
    const labelled = total.right + total.missed;
    out[row] = {
      ...total,
      precision: found === 0 ? null : total.right / found,
      recall: labelled === 0 ? null : total.right / labelled,
    };
  }
  return out;
}

export function rowName(row: Row): string {
  if (row === "unscripted") return "Unscripted line (spoken, not in the script)";
  if (row === "reordered") return "Reordered line (spoken out of order)";
  const label = FINDING_LABELS[row];
  return `${label.spooky} (${label.plain})`;
}

const ratio = (n: number, of: number): string =>
  of === 0 ? "n/a" : `${Math.round((n / of) * 100)}% (${n}/${of})`;

export interface ReportInput {
  providers: string;
  clipsRun: string[];
  /** Clips found on disk but not run, with the reason. */
  skipped: { clip: string; reason: string }[];
  scores: readonly ClipScore[];
}

/** The text `pnpm eval` prints. Every number in it comes from `scoreClip`; nothing is estimated. */
export function formatReport(input: ReportInput): string {
  const summary = summarise(input.scores);
  const lines: string[] = [];
  lines.push(
    `SLEUTH evaluation | providers: ${input.providers} | clips run: ${input.clipsRun.length}`,
  );
  lines.push(`Clips: ${input.clipsRun.join(", ") || "none"}`);
  if (input.providers === "mock")
    lines.push(
      "Mock providers feed hand-written transcript and frames through the real matching code. " +
        "These numbers test the plumbing and the matching logic. They say nothing about speech or vision quality.",
    );
  for (const s of input.skipped) lines.push(`Skipped ${s.clip}: ${s.reason}`);
  lines.push("");
  lines.push("| Type | Labelled | Found | Right | Precision | Recall |");
  lines.push("|---|---|---|---|---|---|");
  for (const row of ROWS) {
    const r = summary[row];
    lines.push(
      `| ${rowName(row)} | ${r.right + r.missed} | ${r.right + r.extra} | ${r.right} | ${ratio(r.right, r.right + r.extra)} | ${ratio(r.right, r.right + r.missed)} |`,
    );
  }
  const all = input.scores.flatMap((s) => s.disagreements);
  lines.push("");
  lines.push(`Disagreements: ${all.length}`);
  for (const d of all)
    lines.push(
      `- ${d.clip}: ${rowName(d.row)}: ${d.kind === "missed" ? "labelled but not found" : "found but not labelled"} at ${d.target}`,
    );
  return lines.join("\n");
}
