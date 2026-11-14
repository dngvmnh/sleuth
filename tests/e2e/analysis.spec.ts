import { expect as baseExpect, test, type APIRequestContext, type Page } from "@playwright/test";

// Dev mode compiles routes on first visit; give pages time to appear. Assertions are unchanged.
const expect = baseExpect.configure({ timeout: 30_000 });

// Run with --workers=1. This uses the real fixture API. The web app runs no worker, so a
// job it creates stays `queued`: these tests check what the real API gives, and the
// running, succeeded and failed paths are covered by component tests with fake timers.

const panel = (page: Page) => page.locator("section[aria-labelledby='analysis-heading']");

/**
 * Each test acts as its own fixture user. The daily analysis limit (5 per user per UTC day)
 * is counted per user for the life of the dev server, and Playwright reuses a running server
 * locally. With the shared default user, the 6th analysis since the server started got 429
 * and these tests failed on the third run against the same server.
 */
async function openCopy(page: Page, request: APIRequestContext): Promise<{ id: string; headers: Record<string, string> }> {
  const headers = { "x-fixture-user": `e2e-analysis-${Date.now()}-${Math.random().toString(36).slice(2, 7)}` };
  await page.setExtraHTTPHeaders(headers);
  const res = await request.post("/api/v1/projects", {
    headers,
    data: { name: `Analysis copy ${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, copyFromDemo: true },
  });
  expect(res.status()).toBe(201);
  const id = ((await res.json()) as { project: { id: string } }).project.id;
  await page.goto(`/projects/${id}`);
  await expect(panel(page).getByRole("button", { name: "Run analysis" })).toBeVisible();
  return { id, headers };
}

test("Run analysis queues a real job and polls it every 2 seconds, one check at a time", async ({ page, request }) => {
  const { id, headers } = await openCopy(page, request);
  const checks: number[] = [];
  let inFlight = 0;
  let overlap = false;
  page.on("request", (r) => {
    if (/\/jobs\/[^/]+$/.test(r.url())) {
      checks.push(Date.now());
      inFlight += 1;
      if (inFlight > 1) overlap = true;
    }
  });
  page.on("requestfinished", (r) => {
    if (/\/jobs\/[^/]+$/.test(r.url())) inFlight -= 1;
  });

  const started = page.waitForResponse((r) => r.url().endsWith("/analysis") && r.request().method() === "POST");
  await panel(page).getByRole("button", { name: "Run analysis" }).click();
  const res = await started;
  expect(res.status()).toBe(202);
  const job = ((await res.json()) as { job: { id: string; status: string } }).job;
  expect(job.status).toBe("queued");

  await expect(page.getByTestId("job-processing")).toContainText(
    "Queued. Analysis starts within about 10 to 15 minutes. Attempt 0 of 3.",
  );
  await expect.poll(() => checks.length, { timeout: 15_000 }).toBeGreaterThanOrEqual(3);
  const gaps = checks.slice(1).map((t, i) => t - (checks[i] ?? t));
  for (const gap of gaps) expect(gap).toBeGreaterThanOrEqual(1900);
  expect(overlap).toBe(false);

  // The UI shows the real state the server reports: still queued.
  const fromApi = await request.get(`/api/v1/projects/${id}/jobs/${job.id}`, { headers });
  expect(((await fromApi.json()) as { job: { status: string } }).job.status).toBe("queued");
  await expect(page.getByTestId("job-processing")).toContainText("Queued. Analysis starts within about 10 to 15 minutes.");
});

test("leaving the workspace stops the polling", async ({ page, request }) => {
  await openCopy(page, request);
  let checks = 0;
  page.on("request", (r) => {
    if (/\/jobs\/[^/]+$/.test(r.url())) checks += 1;
  });
  await panel(page).getByRole("button", { name: "Run analysis" }).click();
  await expect.poll(() => checks, { timeout: 15_000 }).toBeGreaterThanOrEqual(1);
  await page.getByRole("link", { name: "Back to dashboard" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "SLEUTH" })).toBeVisible();
  const after = checks;
  await page.waitForTimeout(5000);
  expect(checks).toBe(after);
});

test("the demo cannot start an analysis", async ({ page }) => {
  await page.goto("/projects/proofpay-demo");
  await expect(panel(page)).toContainText("The demo is read-only. Make an editable copy to run an analysis.");
  await expect(panel(page).getByRole("button", { name: "Run analysis" })).toHaveCount(0);
});
