import { FINDING_LABELS } from "@sleuth/contracts";
import type { ReportData } from "@sleuth/db/fixture";

/** Cells starting with = + - @ can run as formulas in spreadsheets. Prefix them. */
function csvCell(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function htmlEscape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function lineFor(data: ReportData, segmentId: string | null): string {
  if (!segmentId) return "";
  return data.scriptVersion?.segments.find((s) => s.id === segmentId)?.text ?? "";
}

function itemFor(data: ReportData, id: string | null): string {
  if (!id) return "";
  return data.checklist.find((c) => c.id === id)?.label ?? "";
}

/** One row per finding. Both the haunted name and the plain-English name are included. */
export function buildCsv(data: ReportData): string {
  const header = [
    "finding",
    "plain_label",
    "status",
    "checklist_item",
    "script_line",
    "found",
    "not_found",
    "limits",
  ];
  const rows = data.findings.map((f) =>
    [
      FINDING_LABELS[f.type].spooky,
      f.plainLabel,
      f.status,
      itemFor(data, f.checklistItemId),
      lineFor(data, f.scriptSegmentId),
      f.found,
      f.notFound,
      f.limits,
    ]
      .map(csvCell)
      .join(","),
  );
  return `${[header.join(","), ...rows].join("\r\n")}\r\n`;
}

/** Printable report. Every value is escaped. Nothing here is signed off yet (Final Seal comes later). */
export function buildHtml(data: ReportData): string {
  const e = htmlEscape;
  const findings = data.findings
    .map(
      (f) => `<tr>
<td>${e(FINDING_LABELS[f.type].spooky)}<br><small>${e(f.plainLabel)}</small></td>
<td>${e(f.status)}</td>
<td>${e(itemFor(data, f.checklistItemId) || lineFor(data, f.scriptSegmentId))}</td>
<td>${e(f.found)}<br>${e(f.notFound)}<br><small>${e(f.limits)}</small></td>
</tr>`,
    )
    .join("\n");
  const evidence = data.evidence
    .map(
      (v) => `<tr>
<td>${e(lineFor(data, v.scriptSegmentId))}</td>
<td>${e(v.status)}</td>
<td>${e(v.confidence)}</td>
<td>${v.startMs} to ${v.endMs} ms</td>
</tr>`,
    )
    .join("\n");
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${e(data.project.name)} - SLEUTH report</title>
<style>
body{font-family:system-ui,sans-serif;margin:2rem;color:#111}
table{border-collapse:collapse;width:100%;margin:1rem 0}
th,td{border:1px solid #bbb;padding:.4rem;text-align:left;vertical-align:top}
small{color:#444}
@media print{body{margin:0}}
</style>
</head>
<body>
<h1>${e(data.project.name)}</h1>
<p>Matches below are candidates found by software. Only a person can confirm them. This report has not been signed off.</p>
<h2>Findings (${data.findings.length})</h2>
<table><thead><tr><th>Finding</th><th>Status</th><th>About</th><th>Details</th></tr></thead><tbody>
${findings}
</tbody></table>
<h2>Evidence candidates (${data.evidence.length})</h2>
<table><thead><tr><th>Script line</th><th>Status</th><th>Confidence (a ranking, not proof)</th><th>Time</th></tr></thead><tbody>
${evidence}
</tbody></table>
</body>
</html>
`;
}
