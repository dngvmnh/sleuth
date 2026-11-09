import { expect as baseExpect, test, type APIRequestContext, type Page } from "@playwright/test";

// Dev mode compiles routes on first visit; give pages time to appear. Assertions are unchanged.
const expect = baseExpect.configure({ timeout: 30_000 });

// Run with --workers=1: the fixture store lives in the dev server's memory.

const line = (page: Page, n: number) => page.getByRole("button", { name: new RegExp(`^${n}\\.`) });
const scriptField = (page: Page) => page.getByLabel("Script text. Each sentence becomes one numbered line.");

async function openCopy(page: Page, request: APIRequestContext): Promise<string> {
  const res = await request.post("/api/v1/projects", {
    data: { name: `Editor copy ${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, copyFromDemo: true },
  });
  expect(res.status()).toBe(201);
  const id = ((await res.json()) as { project: { id: string } }).project.id;
  await page.goto(`/projects/${id}`);
  await expect(line(page, 1)).toBeVisible();
  return id;
}

test("editing one sentence marks only that line's evidence out of date", async ({ page, request }) => {
  await openCopy(page, request);
  const field = scriptField(page);
  const text = await field.inputValue();
  await field.fill(
    text.replace(
      "Enter the client name and the amount of 1,250 dollars.",
      "Type the customer and an amount of 900 euros.",
    ),
  );
  await page.getByRole("button", { name: "Save script" }).click();

  const changed = page.getByRole("list", { name: "Changed lines" });
  await expect(changed).toHaveText("Line 3 changed: Type the customer and an amount of 900 euros.");
  await expect(page.getByTestId("stale-summary")).toHaveText(
    "1 evidence candidate is now out of date (Poltergeist, Evidence out of date).",
  );

  // The script list shows the new text, and only line 3 changed state.
  await expect(line(page, 3)).toContainText("Type the customer and an amount of 900 euros.");
  await expect(line(page, 3)).toContainText("Poltergeist (Evidence out of date)");
  for (const n of [1, 2]) await expect(line(page, n)).toContainText("Cursed Frame (Needs human check)");
  await expect(line(page, 5)).toContainText("Needs Outside Proof (Footage cannot prove this)");
});

test("a punctuation-only edit says no evidence affected", async ({ page, request }) => {
  await openCopy(page, request);
  const field = scriptField(page);
  const text = await field.inputValue();
  const edited = text.replace("First, click New Invoice to start a draft.", "First click New Invoice to start a draft!");
  expect(edited).not.toBe(text);
  await field.fill(edited);
  await page.getByRole("button", { name: "Save script" }).click();
  await expect(page.getByTestId("stale-summary")).toHaveText("No evidence affected.");
  await expect(line(page, 2)).toContainText("Cursed Frame (Needs human check)");
});

test("the checklist can be added to, reordered and trimmed, and saves the whole list", async ({ page, request }) => {
  const id = await openCopy(page, request);
  const items = page.getByRole("list", { name: "Checklist items" }).getByRole("listitem");
  const before = await items.count();
  expect(before).toBeGreaterThan(1);
  const first = (await items.nth(0).locator("span").nth(1).textContent()) ?? "";
  const second = (await items.nth(1).locator("span").nth(1).textContent()) ?? "";

  await page.getByLabel("New item").fill("Show the invoice total");
  await page.getByRole("button", { name: "Add item" }).click();
  await page.getByRole("button", { name: `Move "${second}" up` }).click();
  await page.getByRole("button", { name: `Remove "${first}"` }).click();
  await page.getByRole("button", { name: "Save checklist" }).click();
  await expect(page.getByText(`Checklist saved with ${before} items.`)).toBeVisible();

  // The server kept the list in this order.
  const res = await request.get(`/api/v1/projects/${id}`);
  const saved = ((await res.json()) as { checklist: { label: string; position: number }[] }).checklist
    .sort((a, b) => a.position - b.position)
    .map((c) => c.label);
  expect(saved[0]).toBe(second);
  expect(saved).not.toContain(first);
  expect(saved.at(-1)).toBe("Show the invoice total");
  expect(saved).toHaveLength(before);
});

test("the demo editors are read-only and Make an editable copy opens an editable project", async ({ page }) => {
  await page.goto("/projects/proofpay-demo");
  await expect(line(page, 1)).toBeVisible();
  await expect(scriptField(page)).toHaveAttribute("readonly", "");
  await expect(page.getByRole("button", { name: "Save script" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Save checklist" })).toHaveCount(0);
  await page.getByRole("button", { name: "Make an editable copy" }).click();
  await expect(page).toHaveURL(/\/projects\/(?!proofpay-demo)[^/]+$/);
  await expect(page.getByRole("heading", { level: 1, name: "Copy of ProofPay demo (public example)" })).toBeVisible();
  await expect(scriptField(page)).not.toHaveAttribute("readonly", "");
  await expect(page.getByRole("button", { name: "Save checklist" })).toBeVisible();
});
