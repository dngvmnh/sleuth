import { describe, expect, it } from "vitest";
import { createFixtureStore, type ReportData } from "@sleuth/db/fixture";
import { buildCsv, buildHtml, buildReportModel } from "./report";

async function demo(): Promise<ReportData> {
  return createFixtureStore().getReportData({ userId: null }, "proofpay-demo");
}

describe("report model", () => {
  it("is a draft when there is no seal", async () => {
    const m = buildReportModel(await demo());
    expect(m.banner).toEqual({ status: "draft", text: "Draft: not signed off" });
  });

  it("shows a sealed report with who signed and when", async () => {
    const data = await demo();
    const m = buildReportModel({
      ...data,
      seal: {
        id: "s",
        projectId: "p",
        sealedBy: "user-9",
        sealedAt: "2026-11-08T10:00:00.000Z",
        scriptVersionId: "sv",
        assetVersionId: "av",
        coverage: data.coverage,
        note: "Looks right",
        status: "active",
        brokenAt: null,
        brokenReason: null,
      },
    });
    expect(m.banner.status).toBe("sealed");
    expect(m.banner.text).toContain("user-9");
    expect(m.summary.find((s) => s.label === "Sign-off note")?.value).toBe("Looks right");
  });

  it("says plainly that a seal is broken", async () => {
    const data = await demo();
    const m = buildReportModel({
      ...data,
      seal: {
        id: "s",
        projectId: "p",
        sealedBy: "user-9",
        sealedAt: "2026-11-08T10:00:00.000Z",
        scriptVersionId: "sv",
        assetVersionId: "av",
        coverage: data.coverage,
        note: null,
        status: "broken",
        brokenAt: "2026-11-08T11:00:00.000Z",
        brokenReason: "Evidence changed after sign-off: the script was edited.",
      },
    });
    expect(m.banner.status).toBe("broken");
    expect(m.banner.text).toMatch(/^Seal broken: evidence changed after sign-off/);
  });

  it("states the honesty notes: candidates, ranking not proof, outside proof, sampling limits", async () => {
    const m = buildReportModel(await demo());
    const text = m.notes.join(" ");
    expect(text).toMatch(/candidates/);
    expect(text).toMatch(/ranking, not proof/);
    expect(text).toMatch(/outside the video/);
    expect(text).toMatch(/sampled frames/);
  });

  it("shows no invented numbers: only counts taken from the coverage", async () => {
    const data = await demo();
    const m = buildReportModel(data);
    expect(m.summary.find((s) => s.label === "Checklist items proven")?.value).toBe(
      `${data.coverage.totals.proven} of ${data.coverage.items.length} (${data.coverage.provenPercent}%)`,
    );
  });
});

describe("exports contain every required section", () => {
  it("CSV", async () => {
    const csv = buildCsv(await demo());
    for (const name of [
      "Summary",
      "Coverage",
      "Findings",
      "Open and done reshoots",
      "Needs outside proof",
      "Review decisions",
      "Notes",
    ]) {
      expect(csv).toContain(`${name}\r\n`);
    }
    expect(csv).toContain("Draft: not signed off");
    expect(csv).toContain("Phantom Dialogue,Script line not spoken");
  });

  it("HTML, with print rules and no dark background or animation", async () => {
    const html = buildHtml(await demo());
    for (const h of [
      "Summary",
      "Coverage of the checklist",
      "Findings",
      "Reshoots",
      "Needs outside proof",
      "Review decisions",
    ]) {
      expect(html).toContain(`<h2>${h}`);
    }
    expect(html).toContain("@media print");
    expect(html).toContain("@page");
    expect(html).toContain("break-inside:avoid");
    expect(html).not.toMatch(/animation|@keyframes|background:#0|background:#1/);
    expect(html).toContain("Draft: not signed off");
  });

  it("contain no transcript text, frame descriptions or signed URLs", async () => {
    const { loadGoldenFixture } = await import("@sleuth/db/fixture");
    const fx = loadGoldenFixture();
    const data = await demo();
    const both = buildCsv(data) + buildHtml(data);
    expect(both).not.toMatch(/fixture:\/\/|https?:\/\/|token=|apikey/i);
    for (const t of fx.transcript)
      if (!fx.script.text.includes(t.text)) expect(both).not.toContain(t.text);
    for (const f of fx.frames) expect(both).not.toContain(f.description);
  });
});
