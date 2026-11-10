import AxeBuilder from "@axe-core/playwright";
import { expect as baseExpect, test } from "@playwright/test";

// Dev mode compiles routes on first visit; give pages time to appear. Assertions are unchanged.
const expect = baseExpect.configure({ timeout: 30_000 });

// Final Seal task 7 on the real ProofPay demo in fixture mode. Run with --workers=1.

test("the demo report shows the draft banner, real coverage rows and findings, in the 4.1 order", async ({
  page,
  request,
}) => {
  const api = (await (await request.get("/api/v1/projects/proofpay-demo/coverage")).json()) as {
    coverage: { items: { checklistItemId: string; state: string }[]; provenPercent: number; totals: Record<string, number> };
    seal: unknown;
  };
  const findings = (await (await request.get("/api/v1/projects/proofpay-demo/findings")).json()) as {
    findings: { id: string }[];
  };
  expect(api.seal).toBeNull();
  expect(api.coverage.items.length).toBeGreaterThan(0);

  await page.goto("/projects/proofpay-demo/report");
  const banner = page.getByTestId("seal-banner");
  await expect(banner).toHaveText(/Draft: not signed off/);
  await expect(page.getByRole("heading", { level: 1, name: /ProofPay demo/ })).toBeVisible();

  // Coverage: one row per checklist item, states and totals as the API gives them.
  const rows = page.getByTestId("coverage-row");
  await expect(rows).toHaveCount(api.coverage.items.length);
  const shownStates = await rows.evaluateAll((trs) => trs.map((tr) => tr.querySelector("[data-state]")?.getAttribute("data-state")));
  expect([...shownStates].sort()).toEqual(api.coverage.items.map((i) => i.state).sort());
  await expect(page.getByTestId("coverage-proven")).toContainText(`(${api.coverage.provenPercent}%)`);

  // Findings: the real ones, each spooky label beside its plain label.
  await expect(page.getByTestId("report-finding")).toHaveCount(findings.findings.length);
  const findingsSection = page.getByRole("region", { name: "Findings" });
  await expect(findingsSection).toContainText("Ghost(No visual evidence)");
  await expect(findingsSection).toContainText("Phantom Dialogue(Script line not spoken)");

  // The rest of 4.1, in order.
  const headings = await page.getByRole("heading", { level: 2 }).allTextContents();
  expect(headings).toEqual([
    "Coverage",
    "Findings",
    "Reshoots",
    "Needs outside proof (footage cannot prove this)",
    "Limits of these checks",
    // Task 9 actions come after the 4.1 content.
    "Final Seal",
    "Export",
  ]);
  await expect(page.getByRole("region", { name: "Limits of these checks" })).toContainText(
    "Confidence is a ranking, not proof.",
  );
});

test("the report is reachable from the workspace", async ({ page }) => {
  await page.goto("/projects/proofpay-demo");
  await page.getByRole("link", { name: "Open the Final Seal report" }).click();
  await expect(page).toHaveURL(/\/projects\/proofpay-demo\/report$/);
  await expect(page.getByTestId("seal-banner")).toHaveText(/Draft: not signed off/);
});

test("an unknown project's report says not found", async ({ page }) => {
  await page.goto("/projects/does-not-exist/report");
  await expect(page.getByRole("heading", { name: "Project not found" })).toBeVisible();
});

test("the demo report has no serious or critical accessibility issues", async ({ page }) => {
  await page.goto("/projects/proofpay-demo/report");
  await expect(page.getByTestId("coverage-row").first()).toBeVisible();
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(serious.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
});
