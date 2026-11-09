/// <reference lib="dom" />
import { expect as baseExpect, test, type APIRequestContext, type Page } from "@playwright/test";

// Dev mode compiles routes on first visit; give pages time to appear. Assertions are unchanged.
const expect = baseExpect.configure({ timeout: 30_000 });

// Fixture data (see the golden demo): lines 1, 2, 3 and 5 have evidence; 4 and 6 have none.
// Run with --workers=1: the fixture store lives in the dev server's memory.

const line = (page: Page, n: number) => page.getByRole("button", { name: new RegExp(`^${n}\\.`) });
const lantern = (page: Page) => page.locator("section[aria-labelledby='lantern-heading']");

/** An editable copy owned by the default fixture user, the same user the browser acts as. */
async function makeCopy(request: APIRequestContext): Promise<string> {
  const res = await request.post("/api/v1/projects", {
    data: { name: `Review copy ${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, copyFromDemo: true },
  });
  expect(res.status()).toBe(201);
  const body = (await res.json()) as { project: { id: string } };
  return body.project.id;
}

async function openCopy(page: Page, request: APIRequestContext): Promise<string> {
  const id = await makeCopy(request);
  await page.goto(`/projects/${id}`);
  await expect(line(page, 1)).toBeVisible();
  return id;
}

test("confirm one item and reject another on an editable copy", async ({ page, request }) => {
  await openCopy(page, request);

  await line(page, 2).click();
  await expect(lantern(page).getByText("A candidate. A person has not reviewed it yet.")).toBeVisible();
  await lantern(page).getByRole("button", { name: "Confirm evidence" }).click();
  await expect(lantern(page).getByText("Confirmed by a person.")).toBeVisible();
  await expect(line(page, 2)).toContainText("Covered (A person confirmed the evidence)");

  await line(page, 3).click();
  await lantern(page).getByRole("button", { name: "Reject" }).click();
  await expect(lantern(page).getByText("Rejected by a person.")).toBeVisible();
  // A rejected candidate no longer counts as evidence for the line.
  await expect(line(page, 3)).toContainText("Ghost (No visual evidence)");
  await expect(page.getByRole("button", { name: /^Evidence for line 3,/ })).toHaveCount(0);

  // The confirmed one is still confirmed after a reload: the server kept it.
  await page.reload();
  await line(page, 2).click();
  await expect(lantern(page).getByText("Confirmed by a person.")).toBeVisible();
});

test("a refusal from the server is shown word for word and nothing changes", async ({ page, request }) => {
  const id = await openCopy(page, request);
  await line(page, 1).click();
  await expect(lantern(page).getByRole("button", { name: "Confirm evidence" })).toBeEnabled();

  // Change line 1 behind the page's back, so its evidence is stale on the server only.
  const script = await request.get(`/api/v1/projects/${id}`);
  const current = ((await script.json()) as { scriptVersion: { text: string } }).scriptVersion.text;
  const edited = current.replace("Welcome to ProofPay, the invoicing tool for freelancers.", "Hello and welcome to a totally different tool.");
  expect(edited).not.toBe(current);
  const saved = await request.post(`/api/v1/projects/${id}/scripts`, { data: { text: edited } });
  expect(saved.status()).toBe(201);

  await lantern(page).getByRole("button", { name: "Confirm evidence" }).click();
  await expect(lantern(page).getByRole("alert")).toHaveText("Decision refused: stale_needs_reanalysis.");
  // The screen still shows the candidate; the refused decision changed nothing.
  await expect(lantern(page).getByText("A candidate. A person has not reviewed it yet.")).toBeVisible();
  await expect(lantern(page).getByText("Confirmed by a person.")).toHaveCount(0);
});

test("Needs reshoot asks for a note and creates a reshoot task", async ({ page, request }) => {
  await openCopy(page, request);
  await line(page, 3).click();
  await lantern(page).getByRole("button", { name: "Needs reshoot" }).click();
  await expect(lantern(page).getByRole("button", { name: "Create reshoot task" })).toBeDisabled();
  await lantern(page).getByLabel("Reshoot note").fill("Show the amount field before typing.");

  const reshoot = page.waitForResponse((r) => r.url().includes("/reshoots") && r.request().method() === "POST");
  await lantern(page).getByRole("button", { name: "Create reshoot task" }).click();
  const response = await reshoot;
  expect(response.status()).toBe(201);
  const created = (await response.json()) as { reshoot: { note: string; scriptSegmentId: string | null } };
  expect(created.reshoot.note).toBe("Show the amount field before typing.");
  expect(created.reshoot.scriptSegmentId).toBe("seg-3");
  await expect(lantern(page).getByText("A person asked for a reshoot.")).toBeVisible();
});

test("the demo project offers no review actions and says why", async ({ page }) => {
  await page.goto("/projects/proofpay-demo");
  await expect(line(page, 2)).toBeVisible();
  await line(page, 2).click();
  for (const name of ["Confirm evidence", "Reject", "Needs reshoot", "Needs outside proof"]) {
    await expect(lantern(page).getByRole("button", { name })).toBeDisabled();
  }
  await expect(lantern(page)).toContainText("The demo project is read-only. Make an editable copy to review evidence.");
});

test("there is no control that confirms many items at once", async ({ page, request }) => {
  await openCopy(page, request);
  await line(page, 2).click();
  await expect(page.getByRole("button", { name: /confirm/i })).toHaveCount(1);
  // Script line 5 starts with "All customer data", so match whole action phrases, not the word "all".
  await expect(
    page.getByRole("button", { name: /bulk|select all|confirm all|confirm every|all items/i }),
  ).toHaveCount(0);
  await expect(page.getByRole("checkbox")).toHaveCount(0);
});
