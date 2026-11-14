import AxeBuilder from "@axe-core/playwright";
import { expect as baseExpect, test, type APIRequestContext, type Page } from "@playwright/test";

// Dev mode compiles routes on first visit; give pages time to appear. Assertions are unchanged.
const expect = baseExpect.configure({ timeout: 30_000 });

// Automated part of review-workspace task 14. Axe finds only part of WCAG; the manual
// Narrator or NVDA steps are in docs/accessibility.md. Run with --workers=1.

const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

async function seriousViolations(page: Page): Promise<string[]> {
  const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
  return results.violations
    .filter((v) => v.impact === "serious" || v.impact === "critical")
    .map((v) => `${v.id} (${v.impact}): ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`);
}

const line = (page: Page, n: number) => page.getByRole("button", { name: new RegExp(`^${n}\\.`) });
const marker = (page: Page, n: number) =>
  page.getByRole("button", { name: new RegExp(`^Evidence for line ${n},`) });
const lantern = (page: Page) => page.locator("section[aria-labelledby='lantern-heading']");

async function openCopy(page: Page, request: APIRequestContext) {
  const res = await request.post("/api/v1/projects", {
    data: { name: `A11y copy ${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, copyFromDemo: true },
  });
  expect(res.status()).toBe(201);
  const id = ((await res.json()) as { project: { id: string } }).project.id;
  await page.goto(`/projects/${id}`);
  await expect(line(page, 1)).toBeVisible();
}

for (const reducedMotion of ["no-preference", "reduce"] as const) {
  test.describe(`axe, motion ${reducedMotion}`, () => {
    test.use({ reducedMotion });

    test("the dashboard has no serious or critical issues", async ({ page }) => {
      await page.goto("/");
      await expect(page.getByText("Public demo, read-only")).toBeVisible();
      expect(await seriousViolations(page)).toEqual([]);
    });

    test("the demo workspace with the Lantern open has no serious or critical issues", async ({ page }) => {
      await page.goto("/projects/proofpay-demo");
      await marker(page, 5).click();
      await expect(lantern(page)).toContainText("Footage cannot prove this.");
      expect(await seriousViolations(page)).toEqual([]);
    });

    test("an editable copy with review actions, editors and upload has no serious or critical issues", async ({
      page,
      request,
    }) => {
      await openCopy(page, request);
      await line(page, 2).click();
      await lantern(page).getByRole("button", { name: "Needs reshoot" }).click();
      await expect(lantern(page).getByLabel("Reshoot note")).toBeVisible();
      expect(await seriousViolations(page)).toEqual([]);
    });
  });
}

test.describe("reduced motion", () => {
  test.use({ reducedMotion: "reduce" });

  test("turns off the fog, the skeleton pulse and any running animation", async ({ page }) => {
    await page.route("**/api/v1/projects/proofpay-demo", () => new Promise(() => undefined));
    await page.goto("/projects/proofpay-demo");
    await expect(page.getByRole("status", { name: "Loading project" })).toBeVisible();
    await expect(page.locator(".sleuth-fog")).toBeHidden();
    const running = await page.evaluate(() =>
      Array.from(document.querySelectorAll<HTMLElement>("*"))
        .filter((el) => {
          const cs = getComputedStyle(el);
          return cs.animationName !== "none" && cs.display !== "none" && cs.animationPlayState === "running";
        })
        .map((el) => el.className.toString().slice(0, 60)),
    );
    expect(running).toEqual([]);
  });
});

test.describe("contrast theme (forced colors)", () => {
  // Emulated here so it runs anywhere. A real Windows contrast theme (Night sky) found both
  // problems on 2026-11-13: the chosen marker and line looked like the rest, and the playhead
  // and range bars vanished because contrast themes drop author backgrounds.
  test.use({ forcedColors: "active" });

  test("keeps the chosen marker and line distinct and the playhead visible", async ({ page }) => {
    await page.goto("/projects/proofpay-demo");
    await expect(line(page, 1)).toBeVisible();
    await marker(page, 3).click();
    await expect(marker(page, 3)).toHaveAttribute("aria-pressed", "true");
    const borderStyle = (n: number, of: typeof marker) =>
      of(page, n).evaluate((el) => getComputedStyle(el).borderTopStyle);
    expect(await borderStyle(3, marker)).toBe("double");
    expect(await borderStyle(1, marker)).toBe("solid");
    expect(await borderStyle(3, line)).toBe("double");
    expect(await borderStyle(1, line)).toBe("solid");
    const playhead = await page.getByTestId("playhead").evaluate((el) => {
      const cs = getComputedStyle(el);
      return { width: parseFloat(cs.borderLeftWidth), color: cs.borderLeftColor, page: getComputedStyle(document.body).backgroundColor };
    });
    expect(playhead.width).toBeGreaterThan(0);
    expect(playhead.color).not.toBe(playhead.page);
  });
});

test("the main keyboard path works without a mouse", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("Public demo, read-only")).toBeVisible();

  // Skip link first, and it moves focus to the main content.
  await page.keyboard.press("Tab");
  const skip = page.getByRole("link", { name: "Skip to main content" });
  await expect(skip).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("#main-content")).toBeFocused();

  // Open the demo from the keyboard.
  await page.getByRole("link", { name: /Open demo/ }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { level: 1, name: /ProofPay demo/ })).toBeVisible();

  // Into the timeline with Tab, move with arrows, choose with Enter.
  await page.getByRole("slider", { name: "Clock position" }).focus();
  await page.keyboard.press("Tab");
  await expect(marker(page, 1)).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  await expect(marker(page, 3)).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(line(page, 3)).toBeFocused();
  await expect(page.getByText("11.0 s of 52.0 s")).toBeVisible();
  await expect(lantern(page).getByRole("heading", { name: "Evidence for line 3" })).toBeVisible();

  // Escape from the timeline goes back to the script.
  await marker(page, 3).focus();
  await page.keyboard.press("Escape");
  await expect(line(page, 3)).toBeFocused();

  // A line is chosen with the keyboard too.
  await line(page, 2).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByText("4.0 s of 52.0 s")).toBeVisible();

  // Every focused control shows a visible ring.
  const ring = await page.evaluate(() => {
    const cs = getComputedStyle(document.activeElement as Element);
    return { style: cs.outlineStyle, width: parseFloat(cs.outlineWidth) };
  });
  expect(ring.style).toBe("solid");
  expect(ring.width).toBeGreaterThanOrEqual(2);
});

test("review actions are reachable and usable from the keyboard on a copy", async ({ page, request }) => {
  await openCopy(page, request);
  await line(page, 2).focus();
  await page.keyboard.press("Enter");
  const confirm = lantern(page).getByRole("button", { name: "Confirm evidence" });
  await lantern(page).getByRole("button", { name: "Play this part" }).focus();
  await page.keyboard.press("Tab");
  await expect(confirm).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(lantern(page).getByText("Confirmed by a person.")).toBeVisible();
});

test("the 404 page is themed, has no serious or critical issues and links home", async ({ page }) => {
  const res = await page.goto("/this-page-does-not-exist");
  expect(res?.status()).toBe(404);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("This page vanished");
  expect(await seriousViolations(page)).toEqual([]);
  await page.getByRole("link", { name: "Back to your projects" }).click();
  await expect(page.getByText("Public demo, read-only")).toBeVisible();
});