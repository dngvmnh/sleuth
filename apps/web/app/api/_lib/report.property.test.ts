import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { createFixtureStore, type ReportData } from "@sleuth/db/fixture";
import { buildCsv, buildHtml, buildReportModel, csvCell, htmlEscape } from "./report";

/** Minimal RFC 4180 reader, enough to read back what buildCsv writes. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\r" && text[i + 1] === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      i++;
    } else cell += ch;
  }
  return rows;
}

const neutralised = (s: string) => (/^[=+\-@\t\r]/.test(s) ? `'${s}` : s);
const FORMULA_START = /^[=+\-@\t\r]/;

async function demo(): Promise<ReportData> {
  return createFixtureStore().getReportData({ userId: null }, "proofpay-demo");
}

/** The demo report with hostile text in every place a person can type. */
function withText(data: ReportData, text: string): ReportData {
  return {
    ...data,
    project: { ...data.project, name: text },
    checklist: data.checklist.map((c) => ({ ...c, label: text })),
    findings: data.findings.map((f) => ({ ...f, found: text, notFound: text, limits: text })),
    reshoots: [
      {
        id: "r1",
        projectId: data.project.id,
        checklistItemId: null,
        scriptSegmentId: null,
        findingId: null,
        note: text,
        status: "open",
        createdAt: "2026-11-08T00:00:00.000Z",
      },
    ],
    seal: {
      id: "seal-1",
      projectId: data.project.id,
      sealedBy: "user-1",
      sealedAt: "2026-11-08T00:00:00.000Z",
      scriptVersionId: "sv-1",
      assetVersionId: "av-1",
      coverage: data.coverage,
      note: text,
      status: "active",
      brokenAt: null,
      brokenReason: null,
    },
  };
}

describe("csvCell [final-seal 5.3]", () => {
  it("prefixes every cell that starts with = + - @ tab or CR, and reads back unchanged otherwise", () => {
    fc.assert(
      fc.property(
        fc.array(fc.string({ maxLength: 40 }), { minLength: 1, maxLength: 6 }),
        (cells) => {
          const [parsed] = parseCsv(`${cells.map(csvCell).join(",")}\r\n`);
          expect(parsed).toEqual(cells.map(neutralised));
          for (const c of parsed ?? []) expect(FORMULA_START.test(c)).toBe(false);
        },
      ),
      { numRuns: 300 },
    );
  });

  it("neutralises each dangerous first character", () => {
    for (const first of ["=", "+", "-", "@", "\t", "\r"]) {
      expect(csvCell(`${first}SUM(1)`).replace(/^"/, "").startsWith("'")).toBe(true);
    }
  });

  it("leaves ordinary text alone", () => {
    expect(csvCell("Click Export.")).toBe("Click Export.");
    expect(csvCell("a, b")).toBe('"a, b"');
  });
});

describe("htmlEscape [final-seal 5.3]", () => {
  it("leaves no raw < > quote in the output, and & only as part of an entity", () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 80 }), (s) => {
        const out = htmlEscape(s);
        expect(out).not.toMatch(/[<>"']/);
        expect(out.replace(/&(amp|lt|gt|quot|#39);/g, "")).not.toContain("&");
      }),
      { numRuns: 300 },
    );
  });

  it("can be reversed exactly, so nothing is lost", () => {
    const decode = (s: string) =>
      s
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&amp;/g, "&");
    fc.assert(
      fc.property(fc.string({ maxLength: 80 }), (s) => {
        expect(decode(htmlEscape(s))).toBe(s);
      }),
    );
  });
});

describe("whole reports", () => {
  it("never lets typed text become markup in the HTML export", async () => {
    const data = await demo();
    await fc.assert(
      fc.asyncProperty(
        fc.stringMatching(/^[a-z]{1,8}$/),
        fc.stringMatching(/^[a-z ]{0,12}$/),
        async (tag, inner) => {
          const hostile = `<${tag} onload="x()">${inner}</${tag}>`;
          const html = buildHtml(withText(data, hostile));
          expect(html).not.toContain(`<${tag} onload`);
          expect(html).toContain(htmlEscape(hostile));
        },
      ),
      { numRuns: 60 },
    );
  });

  it("never leaves a formula-looking cell in the CSV export", async () => {
    const data = await demo();
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom("=", "+", "-", "@"),
        fc.string({ maxLength: 20 }),
        async (first, rest) => {
          const rows = parseCsv(buildCsv(withText(data, `${first}${rest}`)));
          const cells = rows.flat();
          expect(cells.some((c) => c.startsWith(`'${first}`))).toBe(true);
          for (const c of cells) expect(FORMULA_START.test(c)).toBe(false);
        },
      ),
      { numRuns: 60 },
    );
  });

  it("keeps CSV and HTML consistent with the model: same findings, same banner", async () => {
    const data = await demo();
    const model = buildReportModel(data);
    const csv = parseCsv(buildCsv(data));
    const start = csv.findIndex((r) => r[0] === "Findings");
    const header = csv[start + 1] ?? [];
    expect(header[0]).toBe("finding");
    const findingRows = csv
      .slice(start + 2)
      .filter((r, i, all) => all.slice(0, i).every((p) => p.length > 0) && r.length > 1);
    expect(findingRows.slice(0, model.findings.length).map((r) => r[0])).toEqual(
      model.findings.map((f) => f.spooky),
    );
    expect(csv.some((r) => r[1] === model.banner.text)).toBe(true);
    expect(buildHtml(data)).toContain(htmlEscape(model.banner.text));
  });
});
