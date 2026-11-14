import { expect as baseExpect, test } from "@playwright/test";

// Dev mode compiles each route on its first visit, so the first waits can be slow on a busy machine.
// A longer wait only gives the page time to appear; the assertions are unchanged.
const expect = baseExpect.configure({ timeout: 30_000 });

test("opens the demo project without signing in", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: /^The cut is haunted/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /^ProofPay demo/ })).toBeVisible();
  await expect(page.getByText("Public demo, read-only")).toBeVisible();
});

test("shows every spooky label beside its plain-English label", async ({ page }) => {
  await page.goto("/");
  const cabinet = page.getByRole("radiogroup", { name: "Finding types" });
  await expect(cabinet.getByRole("radio", { name: /^Ghost/ })).toBeVisible();
  await expect(cabinet.getByText("(No visual evidence)")).toBeVisible();
  await expect(cabinet.getByText("(Footage cannot prove this)")).toBeVisible();
});

test("serves the demo evidence through the API", async ({ request }) => {
  const res = await request.get("/api/v1/projects/proofpay-demo/evidence");
  expect(res.status()).toBe(200);
  const body = (await res.json()) as { evidence: { status: string }[] };
  expect(body.evidence.length).toBeGreaterThan(0);
  expect(body.evidence.some((e) => e.status === "confirmed")).toBe(false);
});
