import AxeBuilder from "@axe-core/playwright";
import { expect as baseExpect, test, type Page } from "@playwright/test";

// Dev mode compiles routes on first visit; give pages time to appear. Assertions are unchanged.
const expect = baseExpect.configure({ timeout: 30_000 });

// Final Seal task 10: the whole flow through the UI on a fresh editable copy, fixture mode.
// The sign-off itself is done with the keyboard. The API is read only to cross-check.
// Run with --workers=1: the fixture store lives in the dev server's memory.

const WCAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

const line = (page: Page, n: number) => page.getByRole("button", { name: new RegExp(`^${n}\\.`) });
const lantern = (page: Page) => page.locator("section[aria-labelledby='lantern-heading']");
const sealPanel = (page: Page) => page.locator("section[aria-labelledby='seal-heading']");

async function axe(page: Page) {
  const r = await new AxeBuilder({ page }).withTags(WCAG).analyze();
  return {
    serious: r.violations
      .filter((v) => v.impact === "serious" || v.impact === "critical")
      .map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`),
    other: r.violations.filter((v) => v.impact !== "serious" && v.impact !== "critical").map((v) => `${v.id}:${v.impact}`),
    incomplete: r.incomplete.flatMap((v) =>
      v.nodes.map((n) => `${v.id} | ${n.target.join(" ")} | ${(n.any[0]?.message ?? "").slice(0, 80)}`),
    ),
  };
}

/** Press Tab until `target` has focus. Fails if it takes more than `max` presses. */
async function tabTo(page: Page, target: ReturnType<Page["getByRole"]>, max = 250) {
  for (let i = 0; i < max; i++) {
    if (await target.evaluate((el) => el === document.activeElement)) return i;
    await page.keyboard.press("Tab");
  }
  throw new Error("Tab never reached the target");
}

test("copy, review, reshoot the Ghost item, seal with the keyboard, then an edit breaks the seal", async ({
  page,
  request,
}) => {
  test.setTimeout(180_000);
  const axeLog: Record<string, Awaited<ReturnType<typeof axe>>> = {};

  // 1. Make an editable copy of the demo through the UI.
  await page.goto("/projects/proofpay-demo");
  await expect(line(page, 1)).toBeVisible();
  await page.getByRole("button", { name: "Make an editable copy" }).click();
  await expect(page).toHaveURL(/\/projects\/(?!proofpay-demo)[^/]+$/);
  const id = new URL(page.url()).pathname.split("/").pop() ?? "";
  await expect(page.getByRole("heading", { level: 1, name: /^Copy of ProofPay demo/ })).toBeVisible();

  // 2. Review every evidence candidate in the Lantern.
  for (const n of [1, 2, 3]) {
    await line(page, n).click();
    await lantern(page).getByRole("button", { name: "Confirm evidence" }).click();
    await expect(lantern(page).getByText("Confirmed by a person.")).toBeVisible();
  }
  // Line 5 is a security claim footage cannot prove: a person marks it as needing outside proof.
  await line(page, 5).click();
  await lantern(page).getByRole("button", { name: "Needs outside proof" }).click();
  await expect(page.getByText("Evidence for line 5 marked as needing outside proof.")).toBeAttached();
  const evidence = (await (await request.get(`/api/v1/projects/${id}/evidence`)).json()) as {
    evidence: { status: string }[];
  };
  expect(evidence.evidence.filter((e) => e.status === "candidate")).toEqual([]);

  // 3. On the report, ask for a reshoot of the Ghost (uncovered) checklist item.
  await page.getByRole("link", { name: "Open the Final Seal report" }).click();
  await expect(page).toHaveURL(new RegExp(`/projects/${id}/report$`));
  const ghostRow = page.getByTestId("coverage-row").filter({ has: page.locator("[data-state='uncovered']") });
  await expect(ghostRow).toHaveCount(1);
  const ghostLabel = ((await ghostRow.locator("td").nth(1).textContent()) ?? "").trim();
  expect(ghostLabel).toBe("Export the invoice as a PDF");
  await ghostRow.getByRole("button", { name: `Ask for a reshoot: ${ghostLabel}` }).click();
  await page.getByLabel(`What to film again for “${ghostLabel}”`).fill("Film the Export click and the PDF opening.");
  await page.getByRole("button", { name: "Create reshoot task" }).click();
  const reshootRow = page.getByTestId("coverage-row").filter({ hasText: ghostLabel });
  await expect(reshootRow.locator("[data-state]")).toHaveAttribute("data-state", "reshoot");

  // Nothing blocks the seal now; open reshoot and outside proof are still shown (3.3).
  await expect(sealPanel(page).getByText("Nothing blocks the Final Seal.")).toBeVisible();
  const openReshoots = page.getByRole("list", { name: "Open reshoots" });
  await expect(openReshoots).toContainText("Film the Export click and the PDF opening.");
  await expect(openReshoots).toContainText(`Checklist item: ${ghostLabel}`);
  const outside = page.getByTestId("outside-proof");
  await expect(outside).toHaveCount(1);
  await expect(outside).toHaveAttribute("data-acknowledged", "true");
  await expect(outside).toContainText("All customer data is encrypted end to end.");

  axeLog["report, seal button enabled"] = await axe(page);
  expect(axeLog["report, seal button enabled"].serious).toEqual([]);

  // 4. Sign off with the keyboard only.
  const apply = sealPanel(page).getByRole("button", { name: "Apply the Final Seal" });
  await expect(apply).toBeEnabled();
  await page.locator("body").evaluate((b) => (b as HTMLElement).focus());
  await page.keyboard.press("Tab"); // start of the tab order (skip link)
  const presses = await tabTo(page, apply);
  expect(presses).toBeGreaterThan(0);
  await page.keyboard.press("Enter");
  const note = sealPanel(page).getByLabel("Note (optional)");
  await expect(note).toBeFocused();
  await page.keyboard.type("Reviewed every line by hand.");

  axeLog["report, confirm step open"] = await axe(page);
  expect(axeLog["report, confirm step open"].serious).toEqual([]);

  await page.keyboard.press("Tab");
  await expect(sealPanel(page).getByRole("button", { name: "Sign and seal" })).toBeFocused();
  const sealed = page.waitForResponse((r) => r.url().endsWith(`/projects/${id}/seal`) && r.request().method() === "POST");
  await page.keyboard.press("Enter");
  const res = await sealed;
  expect(res.status()).toBe(201);
  expect(JSON.parse(res.request().postData() ?? "{}")).toEqual({ note: "Reviewed every line by hand." });

  const confirmation = page.getByRole("group", { name: "Final Seal applied" });
  await expect(confirmation).toBeFocused();
  await expect(confirmation).toContainText("Note: Reviewed every line by hand.");
  const live = sealPanel(page).getByRole("status");
  await expect(live).toHaveAttribute("aria-live", "polite");
  await expect(live).toHaveText("The Final Seal was applied. The report is now signed off.");
  await expect(page.getByTestId("seal-banner")).toHaveAttribute("data-status", "sealed");

  axeLog["report, after seal"] = await axe(page);
  expect(axeLog["report, after seal"].serious).toEqual([]);

  // The seal kept the open reshoot and the outside-proof line (API cross-check, 3.3).
  const afterSeal = (await (await request.get(`/api/v1/projects/${id}/coverage`)).json()) as {
    seal: { status: string; note: string; coverage: { openReshootIds: string[]; outsideProof: unknown[] } };
  };
  expect(afterSeal.seal.status).toBe("active");
  expect(afterSeal.seal.note).toBe("Reviewed every line by hand.");
  expect(afterSeal.seal.coverage.openReshootIds.length).toBe(1);
  expect(afterSeal.seal.coverage.outsideProof.length).toBe(1);
  await expect(page.getByRole("list", { name: "Open reshoots" })).toContainText("Film the Export click and the PDF opening.");
  await expect(page.getByTestId("outside-proof")).toBeVisible();

  // 5. Edit one sentence in the workspace script editor so its evidence goes stale.
  await page.getByRole("link", { name: "Back to the workspace" }).click();
  const field = page.getByLabel("Script text. Each sentence becomes one numbered line.");
  await expect(field).toBeVisible();
  const text = await field.inputValue();
  await field.fill(text.replace("First, click New Invoice to start a draft.", "Start by opening the billing screen."));
  await page.getByRole("button", { name: "Save script" }).click();
  await expect(page.getByTestId("stale-summary")).toContainText("now out of date");

  // 6. Back on the report, the seal is broken.
  await page.getByRole("link", { name: "Open the Final Seal report" }).click();
  const banner = page.getByTestId("seal-banner");
  await expect(banner).toHaveAttribute("data-status", "broken");
  await expect(banner).toContainText("Seal broken: evidence changed after sign-off");
  const broken = (await (await request.get(`/api/v1/projects/${id}/coverage`)).json()) as { seal: { status: string } };
  expect(broken.seal.status).toBe("broken");

  axeLog["report, broken seal"] = await axe(page);
  expect(axeLog["report, broken seal"].serious).toEqual([]);

  // Keep the full axe result in the test output for the accessibility doc.
  await test.info().attach("axe-summary", { body: JSON.stringify(axeLog, null, 2), contentType: "application/json" });
  console.log(`AXE_SUMMARY ${JSON.stringify(axeLog)}`);
});
