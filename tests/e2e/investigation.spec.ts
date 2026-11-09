import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

// The demo fixture: 6 script lines, 52 s clock. Lines 1, 2, 3 and 5 have evidence
// (1 to 5 s, 4 to 10 s, 11 to 18 s, 30 to 35 s); lines 4 and 6 have none.

const line = (page: Page, n: number) => page.getByRole("button", { name: new RegExp(`^${n}\\.`) });
const marker = (page: Page, n: number) =>
  page.getByRole("button", { name: new RegExp(`^Evidence for line ${n},`) });
const clock = (page: Page) => page.getByText(/ s of 52\.0 s$/);
const lantern = (page: Page) => page.locator("section[aria-labelledby='lantern-heading']");

async function openDemo(page: Page) {
  await page.goto("/");
  await page.getByRole("link", { name: /Open demo/ }).click();
  // The first visit compiles the page in dev mode, which can take longer than the default.
  await expect(page.getByRole("heading", { level: 1, name: /ProofPay demo/ })).toBeVisible({
    timeout: 30_000,
  });
}

test("open demo, choose a line: the clock goes to its evidence and the Lantern shows it", async ({ page }) => {
  await openDemo(page);
  await expect(clock(page)).toHaveText("0.0 s of 52.0 s");
  await line(page, 2).click();
  await expect(clock(page)).toHaveText("4.0 s of 52.0 s");
  await expect(lantern(page).getByRole("heading", { name: "Evidence for line 2" })).toBeVisible();
  await expect(lantern(page)).toContainText("First, click New Invoice to start a draft.");
  await expect(lantern(page)).toContainText("Spoken at 0:06-0:10");
  await expect(lantern(page)).toContainText("Confidence: high. A ranking, not proof.");
  await expect(lantern(page)).toContainText("Cursed Frame");
  await expect(lantern(page)).toContainText("(Needs human check)");
  await expect(lantern(page)).toContainText("Time range: 4 s to 10 s");
  // It is a candidate: nothing on the page says a person confirmed it.
  await expect(lantern(page)).not.toContainText(/confirmed/i);
});

test("a line without evidence says so, shows its recorded finding and does not move the clock", async ({ page }) => {
  await openDemo(page);
  await line(page, 2).click();
  await expect(clock(page)).toHaveText("4.0 s of 52.0 s");
  await line(page, 4).click();
  await expect(clock(page)).toHaveText("4.0 s of 52.0 s");
  await expect(lantern(page).getByRole("heading", { name: "Line 4: no evidence" })).toBeVisible();
  await expect(lantern(page)).toContainText("Phantom Dialogue");
  await expect(lantern(page)).toContainText("(Script line not spoken)");
  await expect(lantern(page)).toContainText(
    "No spoken sentence in the transcript covers enough of its words.",
  );
});

test("the timeline toolbar is reached with Tab and moved with the arrow keys", async ({ page }) => {
  await openDemo(page);
  await page.getByRole("slider", { name: "Clock position" }).focus();
  await page.keyboard.press("Tab");
  await expect(marker(page, 1)).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await expect(marker(page, 2)).toBeFocused();
  await page.keyboard.press("ArrowLeft");
  await expect(marker(page, 1)).toBeFocused();
  await page.keyboard.press("End");
  await expect(marker(page, 5)).toBeFocused();
  await page.keyboard.press("Home");
  await expect(marker(page, 1)).toBeFocused();
  // Roving tab stop: Tab leaves the toolbar instead of visiting every marker.
  await page.keyboard.press("Tab");
  await expect(page.getByRole("toolbar", { name: "Evidence markers" }).locator(":focus")).toHaveCount(0);
});

test("Enter on a marker selects its line, moves the clock, focuses the line and fills the Lantern", async ({ page }) => {
  await openDemo(page);
  await marker(page, 3).focus();
  await page.keyboard.press("Enter");
  await expect(clock(page)).toHaveText("11.0 s of 52.0 s");
  await expect(line(page, 3)).toBeFocused();
  await expect(line(page, 3)).toBeInViewport();
  await expect(line(page, 3)).toHaveAttribute("aria-pressed", "true");
  await expect(lantern(page).getByRole("heading", { name: "Evidence for line 3" })).toBeVisible();
});

test("a marker that footage cannot prove says so in the Lantern", async ({ page }) => {
  await openDemo(page);
  await marker(page, 5).click();
  await expect(clock(page)).toHaveText("30.0 s of 52.0 s");
  await expect(lantern(page)).toContainText("Footage cannot prove this.");
  await expect(lantern(page)).toContainText("Needs a document, certificate or other proof from outside the video.");
  await expect(lantern(page)).toContainText("Needs Outside Proof");
});

test("Escape on a marker returns focus to the script", async ({ page }) => {
  await openDemo(page);
  await line(page, 2).click();
  await marker(page, 1).focus();
  await page.keyboard.press("Escape");
  await expect(line(page, 2)).toBeFocused();
});

test("playing highlights the line whose evidence holds the time and the playhead moves with it", async ({ page }) => {
  await openDemo(page);
  await page.getByRole("slider", { name: "Clock position" }).evaluate((el: HTMLInputElement) => {
    // Move the clock the way a user dragging the slider would.
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    set?.call(el, "11000");
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await expect(clock(page)).toHaveText("11.0 s of 52.0 s");
  const before = await page.getByTestId("playhead").evaluate((el) => (el as HTMLElement).style.left);
  await page.getByRole("button", { name: "Play simulated clock" }).click();
  await expect(line(page, 3)).toHaveAttribute("aria-current", "true");
  await expect(line(page, 3)).toContainText("Playing now");
  // 11.0 s is already inside line 3, so wait for the clock to move before pausing.
  await expect(clock(page)).not.toHaveText("11.0 s of 52.0 s");
  await page.getByRole("button", { name: "Pause simulated clock" }).click();
  const after = await page.getByTestId("playhead").evaluate((el) => (el as HTMLElement).style.left);
  expect(parseFloat(after)).toBeGreaterThan(parseFloat(before));
});

test("Play this part runs the clock through the part and stops at its end", async ({ page }) => {
  await openDemo(page);
  await line(page, 1).click(); // evidence 1 to 5 s
  await expect(clock(page)).toHaveText("1.0 s of 52.0 s");
  await lantern(page).getByRole("button", { name: "Play this part" }).click();
  await expect(page.getByRole("button", { name: "Pause simulated clock" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Play simulated clock" })).toBeVisible({ timeout: 10_000 });
  await expect(clock(page)).toHaveText("5.0 s of 52.0 s");
});

test("reduced motion hides the fog on the workspace", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openDemo(page);
  await expect(page.locator(".sleuth-fog")).toBeHidden();
});

test("the workspace has no serious or critical accessibility violations", async ({ page }) => {
  await openDemo(page);
  await line(page, 2).click();
  const results = await new AxeBuilder({ page }).analyze();
  const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(serious.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
});
