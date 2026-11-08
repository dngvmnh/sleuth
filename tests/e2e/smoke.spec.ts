import { expect, test } from "@playwright/test";

test("opens the demo project without signing in", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: "SLEUTH" })).toBeVisible();
  await expect(page.getByRole("link", { name: /ProofPay demo/ })).toBeVisible();
  await expect(page.getByText("Public demo, read-only")).toBeVisible();
});

test("shows every spooky label beside its plain-English label", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("Ghost")).toBeVisible();
  await expect(page.getByText("(No visual evidence)")).toBeVisible();
  await expect(page.getByText("(Footage cannot prove this)")).toBeVisible();
});

test("serves the demo evidence through the API", async ({ request }) => {
  const res = await request.get("/api/v1/projects/proofpay-demo/evidence");
  expect(res.status()).toBe(200);
  const body = (await res.json()) as { evidence: { status: string }[] };
  expect(body.evidence.length).toBeGreaterThan(0);
  expect(body.evidence.some((e) => e.status === "confirmed")).toBe(false);
});
