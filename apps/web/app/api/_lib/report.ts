import { FINDING_LABELS, type CoverageState } from "@sleuth/contracts";
import type { ReportData } from "@sleuth/db/fixture";

/**
 * One model feeds both exports, so the CSV and the HTML cannot disagree.
 * It holds ids, the user's own script lines, checklist labels and counts. It never holds
 * transcripts, frames, signed URLs or keys (final-seal requirement 5.5).
 */
export interface ReportModel {
  title: string;
  banner: { status: "draft" | "sealed" | "broken"; text: string };
  /** The signer's raw user id, for audits only. Readable text never holds it (issue #96). */
  signerId: string | null;
  summary: { label: string; value: string }[];
  coverage: { item: string; state: CoverageState; stateLabel: string }[];
  findings: {
    spooky: string;
    plain: string;
    status: string;
    item: string;
    line: string;
    found: string;
    notFound: string;
    limits: string;
  }[];
  reshoots: { about: string; note: string; status: string }[];
  outsideProof: { line: string; hint: string; acknowledged: string }[];
  /** `reviewerId` is the raw id (its own CSV column); `reviewer` is the readable label. */
  decisions: { about: string; decision: string; reviewer: string; reviewerId: string; at: string }[];
  notes: string[];
}

const STATE_LABELS: Record<CoverageState, string> = {
  proven: "Proven: a person confirmed the evidence",
  needs_review: "Needs review: candidates nobody has decided on",
  outside_proof: "Needs outside proof: a person marked it, footage cannot prove it",
  reshoot: "Needs a reshoot",
  uncovered: "Uncovered: no usable evidence",
};

const HONESTY_NOTES = [
  "Matches in this report are candidates found by software. Only a person can confirm them.",
  "Confidence is a ranking, not proof.",
  "Footage cannot prove claims about security, compliance or guarantees. Those need proof from outside the video.",
  "Checks look at sampled frames and speech to text, so they can miss a quick action or a misheard word.",
];

/**
 * A person in words. An export is a file that can be passed on, so it never says "you": the owner
 * (the only one who may seal or review) is "the project owner", anyone else "a reviewer". The web
 * page uses the same words plus "you" (features/report/signer.ts).
 */
export function personLabel(userId: string, ownerId: string | null): string {
  return ownerId !== null && userId === ownerId ? "the project owner" : "a reviewer";
}

function lineFor(data: ReportData, segmentId: string | null): string {
  if (!segmentId) return "";
  return data.scriptVersion?.segments.find((s) => s.id === segmentId)?.text ?? "";
}

function itemFor(data: ReportData, id: string | null): string {
  if (!id) return "";
  return data.checklist.find((c) => c.id === id)?.label ?? "";
}

export function buildReportModel(data: ReportData): ReportModel {
  const { seal, coverage } = data;
  let banner: ReportModel["banner"];
  if (!seal) {
    banner = { status: "draft", text: "Draft: not signed off" };
  } else if (seal.status === "broken") {
    banner = {
      status: "broken",
      text: `Seal broken: evidence changed after sign-off. ${seal.brokenReason ?? ""}`.trim(),
    };
  } else {
    banner = {
      status: "sealed",
      text: `Sealed by ${personLabel(seal.sealedBy, data.project.ownerId)} at ${seal.sealedAt}`,
    };
  }

  const summary = [
    { label: "Project", value: data.project.name },
    { label: "Sign-off", value: banner.text },
    {
      label: "Checklist items proven",
      value: `${coverage.totals.proven} of ${coverage.items.length} (${coverage.provenPercent}%)`,
    },
    { label: "Needs review", value: String(coverage.totals.needs_review) },
    { label: "Needs outside proof", value: String(coverage.totals.outside_proof) },
    { label: "Needs a reshoot", value: String(coverage.totals.reshoot) },
    { label: "Uncovered", value: String(coverage.totals.uncovered) },
    { label: "Open reshoots", value: String(coverage.openReshootIds.length) },
  ];
  if (seal?.note) summary.push({ label: "Sign-off note", value: seal.note });

  const evidenceById = new Map(data.evidence.map((e) => [e.id, e]));
  return {
    title: data.project.name,
    banner,
    signerId: seal ? seal.sealedBy : null,
    summary,
    coverage: coverage.items.map((i) => ({
      item: itemFor(data, i.checklistItemId),
      state: i.state,
      stateLabel: STATE_LABELS[i.state],
    })),
    findings: data.findings.map((f) => ({
      spooky: FINDING_LABELS[f.type].spooky,
      plain: f.plainLabel,
      status: f.status,
      item: itemFor(data, f.checklistItemId),
      line: lineFor(data, f.scriptSegmentId),
      found: f.found,
      notFound: f.notFound,
      limits: f.limits,
    })),
    reshoots: data.reshoots.map((r) => ({
      about: itemFor(data, r.checklistItemId) || lineFor(data, r.scriptSegmentId),
      note: r.note,
      status: r.status,
    })),
    outsideProof: coverage.outsideProof.map((o) => ({
      line: lineFor(data, o.scriptSegmentId),
      hint: o.hint,
      acknowledged: o.acknowledged
        ? "yes, a person marked it"
        : "no, proposed by the software only",
    })),
    decisions: data.decisions.map((d) => ({
      about: lineFor(data, evidenceById.get(d.evidenceId)?.scriptSegmentId ?? null) || d.evidenceId,
      decision: d.decision,
      reviewer: personLabel(d.reviewerId, data.project.ownerId),
      reviewerId: d.reviewerId,
      at: d.createdAt,
    })),
    notes: HONESTY_NOTES,
  };
}

// ---- CSV ----

/** Cells starting with = + - @ (or a tab or CR) can run as formulas in spreadsheets. Prefix them. */
export function csvCell(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

const row = (cells: string[]) => cells.map(csvCell).join(",");

/** Sections separated by a blank line; each has a name row and a header row. */
export function buildCsv(data: ReportData): string {
  const m = buildReportModel(data);
  const lines: string[] = [];
  const section = (name: string, header: string[], rows: string[][]) => {
    if (lines.length > 0) lines.push("");
    lines.push(row([name]), row(header), ...rows.map(row));
  };
  section(
    "Summary",
    ["field", "value"],
    [
      ...m.summary.map((s) => [s.label, s.value]),
      // The raw id in its own row, labelled as an audit id, never inside a sentence.
      ...(m.signerId ? [["Signer id (audit)", m.signerId]] : []),
    ],
  );
  section(
    "Coverage",
    ["checklist_item", "state", "meaning"],
    m.coverage.map((c) => [c.item, c.state, c.stateLabel]),
  );
  section(
    "Findings",
    [
      "finding",
      "plain_label",
      "status",
      "checklist_item",
      "script_line",
      "found",
      "not_found",
      "limits",
    ],
    m.findings.map((f) => [
      f.spooky,
      f.plain,
      f.status,
      f.item,
      f.line,
      f.found,
      f.notFound,
      f.limits,
    ]),
  );
  section(
    "Open and done reshoots",
    ["about", "note", "status"],
    m.reshoots.map((r) => [r.about, r.note, r.status]),
  );
  section(
    "Needs outside proof",
    ["script_line", "kind_of_proof", "acknowledged_by_a_person"],
    m.outsideProof.map((o) => [o.line, o.hint, o.acknowledged]),
  );
  section(
    "Review decisions",
    ["about", "decision", "reviewer", "reviewer_id", "time"],
    m.decisions.map((d) => [d.about, d.decision, d.reviewer, d.reviewerId, d.at]),
  );
  section(
    "Notes",
    ["note"],
    m.notes.map((n) => [n]),
  );
  return `${lines.join("\r\n")}\r\n`;
}

// ---- HTML ----

export function htmlEscape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const PRINT_CSS = `
body{font-family:system-ui,Segoe UI,Arial,sans-serif;margin:2rem;color:#111;background:#fff;line-height:1.4}
h1{margin:0 0 .25rem}h2{margin:1.75rem 0 .5rem;font-size:1.15rem}
.banner{border:2px solid #111;padding:.5rem .75rem;margin:.75rem 0;font-weight:600}
.banner.broken{border-style:dashed}
table{border-collapse:collapse;width:100%;margin:.5rem 0}
th,td{border:1px solid #888;padding:.35rem .5rem;text-align:left;vertical-align:top}
th{background:#eee}small{color:#333}
tr{break-inside:avoid}h2{break-after:avoid}
@page{size:auto;margin:15mm}
@media print{body{margin:0}a{color:inherit;text-decoration:none}}
`;

/** Printable report. Every value is escaped. White background, no animation, rows do not split across pages. */
export function buildHtml(data: ReportData): string {
  const m = buildReportModel(data);
  const e = htmlEscape;
  const table = (head: string[], rows: string[][]) =>
    rows.length === 0
      ? "<p>None.</p>"
      : `<table><thead><tr>${head.map((h) => `<th scope="col">${e(h)}</th>`).join("")}</tr></thead><tbody>\n${rows
          .map((r) => `<tr>${r.map((c) => `<td>${e(c)}</td>`).join("")}</tr>`)
          .join("\n")}\n</tbody></table>`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${e(m.title)} - SLEUTH report</title>
<style>${PRINT_CSS}</style>
</head>
<body>
<h1>${e(m.title)}</h1>
<p class="banner ${m.banner.status}" role="status">${e(m.banner.text)}</p>
${m.signerId ? `<details><summary><small>Audit id</small></summary><small>${e(m.signerId)}</small></details>` : ""}
${m.notes.map((n) => `<p><small>${e(n)}</small></p>`).join("\n")}
<h2>Summary</h2>
${table(
  ["Field", "Value"],
  m.summary.map((s) => [s.label, s.value]),
)}
<h2>Coverage of the checklist</h2>
${table(
  ["Checklist item", "State"],
  m.coverage.map((c) => [c.item, c.stateLabel]),
)}
<h2>Findings (${m.findings.length})</h2>
${table(
  ["Finding", "Status", "About", "What was found, what was not, and the limits"],
  m.findings.map((f) => [
    `${f.spooky} (${f.plain})`,
    f.status,
    f.item || f.line,
    `${f.found} ${f.notFound} ${f.limits}`,
  ]),
)}
<h2>Reshoots (${m.reshoots.length})</h2>
${table(
  ["About", "Note", "Status"],
  m.reshoots.map((r) => [r.about, r.note, r.status]),
)}
<h2>Needs outside proof (${m.outsideProof.length})</h2>
${table(
  ["Script line", "Kind of proof", "Marked by a person"],
  m.outsideProof.map((o) => [o.line, o.hint, o.acknowledged]),
)}
<h2>Review decisions (${m.decisions.length})</h2>
${table(
  ["About", "Decision", "Reviewer", "Time"],
  m.decisions.map((d) => [d.about, d.decision, d.reviewer, d.at]),
)}
</body>
</html>
`;
}
