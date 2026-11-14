import { expect as baseExpect, test, type Page } from "@playwright/test";

// Dev mode compiles routes on first visit; give pages time to appear. Assertions are unchanged.
const expect = baseExpect.configure({ timeout: 30_000 });

// Issue #79: on a project page the nav gains a third link (Report). The right-hand chips must
// still fit on the same row, so the header keeps one height on every page from 1024 px.

const PAGES = [
  ["dashboard", "/"],
  ["workspace", "/projects/proofpay-demo"],
  ["report", "/projects/proofpay-demo/report"],
] as const;

async function openSettled(page: Page, path: string) {
  await page.goto(path);
  const header = page.getByTestId("site-header");
  // Wait for everything that changes the header's width: the real count and the reviewer line.
  await expect(header.getByTestId("open-findings-chip")).toBeVisible();
  await expect(header.getByTestId("identity-chip")).toContainText("Guest reviewer");
  await expect(header.getByRole("button", { name: /^Night wind/ })).toBeVisible();
}

async function measure(page: Page) {
  return page.evaluate(() => {
    const header = document.querySelector("[data-testid=site-header]") as HTMLElement;
    const tools = header.querySelector("[data-testid=header-tools]") as HTMLElement;
    const nav = header.querySelector("nav") as HTMLElement;
    const home = header.querySelector("a[aria-label='SLEUTH home']") as HTMLElement;
    const mid = (r: DOMRect) => r.top + r.height / 2;
    const t = tools.getBoundingClientRect();
    const n = nav.getBoundingClientRect();
    const h = home.getBoundingClientRect();
    return {
      height: Math.round(header.getBoundingClientRect().height),
      toolMids: Array.from(tools.children).map((c) => mid(c.getBoundingClientRect())),
      navMid: mid(n),
      toolsMid: mid(t),
      inOrder: h.right <= n.left && n.right <= t.left,
      sideScroll: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    };
  });
}

function expectOneRow(m: Awaited<ReturnType<typeof measure>>, where: string) {
  const spread = Math.max(...m.toolMids) - Math.min(...m.toolMids);
  expect(spread, `${where}: the chips share one row`).toBeLessThanOrEqual(2);
  expect(Math.abs(m.navMid - m.toolsMid), `${where}: nav and chips on one row`).toBeLessThanOrEqual(6);
  expect(m.inOrder, `${where}: wordmark, nav and chips side by side`).toBe(true);
  expect(m.sideScroll, `${where}: no side scroll`).toBe(false);
}

test.describe("header at 1440 px", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("is the same height on the dashboard and on a report page", async ({ page }) => {
    await openSettled(page, "/");
    const dashboard = await measure(page);
    await openSettled(page, "/projects/proofpay-demo/report");
    await expect(page.getByTestId("site-header").getByRole("link", { name: "Report" })).toBeVisible();
    const report = await measure(page);
    expect(report.height).toBe(dashboard.height);
    expectOneRow(dashboard, "dashboard");
    expectOneRow(report, "report");
  });
});

for (const width of [1024, 1280, 1440]) {
  test.describe(`header at ${width} px`, () => {
    test.use({ viewport: { width, height: 900 } });

    test("keeps one row and one height on the dashboard, a workspace and a report", async ({ page }) => {
      const heights: number[] = [];
      for (const [name, path] of PAGES) {
        await openSettled(page, path);
        const m = await measure(page);
        expectOneRow(m, `${name} at ${width} px`);
        heights.push(m.height);
      }
      expect(new Set(heights).size, `heights ${heights.join(", ")}`).toBe(1);
    });

    test("keeps one row on a report page with the Night wind on and its volume slider showing", async ({ page }) => {
      await openSettled(page, "/projects/proofpay-demo/report");
      const before = await measure(page);
      await page.getByRole("button", { name: "Night wind: off" }).click();
      await expect(page.getByLabel("Night wind volume")).toBeVisible();
      const after = await measure(page);
      expectOneRow(after, `report with Night wind on at ${width} px`);
      expect(after.height).toBe(before.height);
    });
  });
}

test.describe("header below 1024 px", () => {
  test.use({ viewport: { width: 375, height: 800 } });

  test("stacks on purpose with no side scroll", async ({ page }) => {
    await openSettled(page, "/projects/proofpay-demo/report");
    const m = await measure(page);
    expect(m.sideScroll).toBe(false);
    expect(m.inOrder).toBe(false);
  });
});
