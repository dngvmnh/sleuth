import { expect as baseExpect, test } from "@playwright/test";

// Dev mode compiles each route on its first visit, so the first waits can be slow on a busy machine.
// A longer wait only gives the page time to appear; the assertions are unchanged.
const expect = baseExpect.configure({ timeout: 30_000 });

test("the demo workspace shows every script line, the regions and the no-video panel", async ({ page }) => {
  await page.goto("/projects/proofpay-demo");
  await expect(page.getByRole("heading", { level: 1, name: /ProofPay demo/ })).toBeVisible();
  for (const line of [
    "First, click New Invoice to start a draft.",
    "All customer data is encrypted end to end.",
    "Thanks for watching.",
  ]) {
    // Scoped to the script list: the script editor textarea holds the same text.
    await expect(page.locator("section[aria-labelledby='script-heading']").getByText(line)).toBeVisible();
  }
  await expect(page.getByRole("heading", { name: "No playable video file" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Timeline" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Evidence Lantern" })).toBeVisible();
  await expect(page.locator("video")).toHaveCount(0);
});

test("the simulated clock moves only after Play and stops on Pause", async ({ page }) => {
  await page.goto("/projects/proofpay-demo");
  await expect(page.getByText("0.0 s of 52.0 s")).toBeVisible();
  await page.getByRole("button", { name: "Play simulated clock" }).click();
  await expect(page.getByText("0.0 s of 52.0 s")).toHaveCount(0);
  await page.getByRole("button", { name: "Pause simulated clock" }).click();
  const frozen = await page.getByText(/ s of 52\.0 s/).textContent();
  await page.waitForTimeout(600);
  await expect(page.getByText(/ s of 52\.0 s/)).toHaveText(frozen ?? "");
});

test("an unknown project shows a not-found message", async ({ page }) => {
  await page.goto("/projects/does-not-exist");
  await expect(page.getByRole("heading", { name: "Project not found" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Back to dashboard" })).toBeVisible();
});

test("a failed load shows an error and Try again loads the project", async ({ page }) => {
  let fail = true;
  await page.route("**/api/v1/projects/proofpay-demo", async (route) => {
    if (fail) {
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: { code: "boom", message: "Server down" } }),
      });
    } else {
      await route.continue();
    }
  });
  await page.goto("/projects/proofpay-demo");
  await expect(page.locator("main").getByRole("alert")).toContainText("Server down");
  fail = false;
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByRole("heading", { level: 1, name: /ProofPay demo/ })).toBeVisible();
});

test("a claims-map room selects its line, moves the clock and opens the Lantern", async ({ page }) => {
  await page.goto("/projects/proofpay-demo");
  const map = page.getByTestId("claims-map");
  await expect(map.getByRole("button", { name: /^Line 1,/i })).toBeVisible();
  await map.getByRole("button", { name: /^Line 3, candidate waiting/i }).click();
  await expect(page.getByText("11.0 s of 52.0 s")).toBeVisible();
  await expect(page.locator("section[aria-labelledby='lantern-heading']")).toContainText("Evidence for line 3");
  await expect(map.getByRole("button", { name: /^Line 3,/i })).toHaveAttribute("aria-pressed", "true");
  // Checklist rooms follow the same rules, one room per item.
  await expect(map.getByRole("button", { name: /^Checklist item \d+,/i })).toHaveCount(5);
});
