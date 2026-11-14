import { expect as baseExpect, test } from "@playwright/test";

// Dev mode compiles each route on its first visit, so the first waits can be slow on a busy machine.
// A longer wait only gives the page time to appear; the assertions are unchanged.
const expect = baseExpect.configure({ timeout: 30_000 });

test("visitor sees the shell, skip link and the public demo", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("banner").getByRole("link", { name: "SLEUTH home" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Site navigation" })).toBeVisible();
  await expect(page.getByText("Public demo, read-only")).toBeVisible();
  await expect(page.getByRole("link", { name: /Open demo/ })).toBeVisible();
});

test("skip link is the first tab stop and targets the main content", async ({ page }) => {
  await page.goto("/");
  await page.keyboard.press("Tab");
  const skip = page.getByRole("link", { name: "Skip to main content" });
  await expect(skip).toBeFocused();
  await expect(skip).toHaveAttribute("href", "#main-content");
});

test("the Open demo link points at the demo project page", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("link", { name: /Open demo/ })).toHaveAttribute(
    "href",
    "/projects/proofpay-demo",
  );
});

test("opening the demo loads the real demo workspace", async ({ page }) => {
  // With all workers starting at once, this is the first visit to the workspace page and its
  // three API routes, so dev mode compiles them here. Give the whole test more time.
  test.setTimeout(90_000);
  await page.goto("/");
  await page.getByRole("link", { name: /Open demo/ }).click();
  await expect(page).toHaveURL(/\/projects\/proofpay-demo$/);
  // The first visit compiles the page in dev mode, which can take longer than the default.
  await expect(page.getByRole("heading", { level: 1, name: /ProofPay demo/ })).toBeVisible({
    timeout: 30_000,
  });
  // Content from the fixture, not a placeholder: the first script line and the counts.
  await expect(
    // Scoped to the script list: the script editor textarea holds the same text.
    page.locator("section[aria-labelledby='script-heading']").getByText("Welcome to ProofPay, the invoicing tool for freelancers."),
  ).toBeVisible();
  await expect(page.getByTestId("workspace-counts")).toHaveText(
    "4 evidence candidates, 4 findings (4 open)",
  );
});





// Requirement 1.2: name, open findings and last change, demo first then newest change.
// Run with --workers=1: the fixture store lives in the dev server's memory.
test("the list follows the API order and shows Last change from updatedAt", async ({ page, request }) => {
  const make = async (name: string) => {
    const res = await request.post("/api/v1/projects", { data: { name, copyFromDemo: true } });
    expect(res.status()).toBe(201);
    return ((await res.json()) as { project: { id: string } }).project.id;
  };
  const stamp = `${Date.now()}`;
  const first = await make(`Order A ${stamp}`);
  await make(`Order B ${stamp}`);
  // A real change to the first copy moves it to the top of the non-demo projects.
  const saved = await request.post(`/api/v1/projects/${first}/checklist`, {
    data: { items: [{ label: "Show the invoice total" }] },
  });
  expect(saved.status()).toBe(201);

  const api = (await (await request.get("/api/v1/projects")).json()) as {
    projects: { id: string; name: string; isDemo: boolean; updatedAt: string }[];
  };
  expect(api.projects[0]?.isDemo).toBe(true);
  expect(api.projects[1]?.id).toBe(first);

  await page.goto("/");
  const rows = page.getByRole("region", { name: "Projects" }).getByRole("listitem");
  await expect(rows).toHaveCount(api.projects.length);
  const shown = await rows.evaluateAll((items) =>
    items.map((li) => ({
      name: li.querySelector("a")?.textContent ?? "",
      time: li.querySelector("time")?.getAttribute("datetime") ?? "",
      text: li.textContent ?? "",
    })),
  );
  expect(shown.map((r) => r.name)).toEqual(api.projects.map((p) => p.name));
  expect(shown.map((r) => r.time)).toEqual(api.projects.map((p) => p.updatedAt));
  for (const row of shown) {
    const iso = new Date(row.time).toISOString();
    expect(row.text).toContain(`Last change ${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC`);
    expect(row.text).toMatch(/open finding|Open findings unavailable|Counting open findings/);
  }
});

test("the hero clue card opens its line in the demo workspace", async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto("/");
  const clue = page.getByTestId("clue-card");
  await expect(clue).toHaveAttribute("href", /^\/projects\/proofpay-demo\?line=/);
  await clue.click();
  await expect(page).toHaveURL(/\/projects\/proofpay-demo\?line=/);
  await expect(page.locator("section[aria-labelledby='lantern-heading']")).toContainText(/Evidence for line \d/);
});
