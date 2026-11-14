import { expect as baseExpect, test, type APIRequestContext, type Page } from "@playwright/test";

// Dev mode compiles routes on first visit; give pages time to appear. Assertions are unchanged.
const expect = baseExpect.configure({ timeout: 30_000 });

// Final Seal task 9 on an editable copy, fixture mode. Run with --workers=1.
// The broad e2e suite, axe and the keyboard-only pass belong to task 10.

const panel = (page: Page) => page.locator("section[aria-labelledby='seal-heading']");

async function makeCopy(request: APIRequestContext): Promise<string> {
  const made = await request.post("/api/v1/projects", {
    data: { name: `Seal copy ${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, copyFromDemo: true },
  });
  expect(made.status()).toBe(201);
  return ((await made.json()) as { project: { id: string } }).project.id;
}

/**
 * Review everything a person must review before sealing, through the same API the UI uses:
 * confirm the candidates, mark the security claim as needing outside proof, and ask for a
 * reshoot for the item that has no footage.
 */
async function reviewEverything(request: APIRequestContext, id: string) {
  const ev = (await (await request.get(`/api/v1/projects/${id}/evidence`)).json()) as {
    evidence: { id: string; status: string }[];
  };
  for (const e of ev.evidence) {
    const decision = e.status === "needs_outside_proof" ? "needs_outside_proof" : "confirm";
    const res = await request.patch(`/api/v1/evidence/${e.id}/review`, { data: { decision } });
    expect(res.status()).toBe(200);
  }
  const cov = (await (await request.get(`/api/v1/projects/${id}/coverage`)).json()) as {
    coverage: { items: { checklistItemId: string; state: string }[] };
  };
  for (const item of cov.coverage.items.filter((i) => i.state === "uncovered")) {
    const res = await request.post(`/api/v1/projects/${id}/reshoots`, {
      data: { note: "Film this step.", checklistItemId: item.checklistItemId },
    });
    expect(res.status()).toBe(201);
  }
  const after = (await (await request.get(`/api/v1/projects/${id}/coverage`)).json()) as { blockers: string[] };
  expect(after.blockers).toEqual([]);
}

test("blockers keep the seal button disabled with a reason for each", async ({ page, request }) => {
  const id = await makeCopy(request);
  const api = (await (await request.get(`/api/v1/projects/${id}/coverage`)).json()) as { blockers: string[] };
  expect(api.blockers.length).toBeGreaterThan(0);

  await page.goto(`/projects/${id}/report`);
  await expect(panel(page).getByRole("button", { name: "Apply the Final Seal" })).toBeDisabled();
  // Step 18 of docs/accessibility.md: the button is described by the blocker sentences themselves.
  await expect(panel(page).getByRole("button", { name: "Apply the Final Seal" })).toHaveAccessibleDescription(
    /^The Final Seal is not available yet: \S.*\.$/,
  );
  await expect(panel(page).getByRole("button", { name: "Apply the Final Seal" })).not.toHaveAccessibleDescription(
    /What blocks the Final Seal|Open the workspace/,
  );
  const list = panel(page).getByRole("list", { name: "What blocks the Final Seal" });
  await expect(list.locator("li")).toHaveCount(api.blockers.length);
  const shown = await list.locator("li").evaluateAll((lis) => lis.map((li) => li.getAttribute("data-blocker")));
  expect(shown).toEqual(api.blockers);
  await expect(list).toContainText("Some evidence candidates are still undecided.");
});

test("after everything is reviewed the seal succeeds, then a sentence edit breaks it", async ({ page, request }) => {
  const id = await makeCopy(request);
  await reviewEverything(request, id);

  await page.goto(`/projects/${id}/report`);
  await expect(page.getByTestId("seal-banner")).toHaveText(/Draft: not signed off/);
  await panel(page).getByRole("button", { name: "Apply the Final Seal" }).click();
  await expect(panel(page)).toContainText("You are signing that you reviewed these items.");
  // No wax seal before the server answers.
  await expect(page.getByTestId("seal-confirmation")).toHaveCount(0);
  await panel(page).getByLabel("Note (optional)").fill("Checked every step by hand.");

  const sealed = page.waitForResponse((r) => r.url().endsWith(`/projects/${id}/seal`) && r.request().method() === "POST");
  await panel(page).getByRole("button", { name: "Sign and seal" }).click();
  const res = await sealed;
  expect(res.status()).toBe(201);
  expect(JSON.parse(res.request().postData() ?? "{}")).toEqual({ note: "Checked every step by hand." });

  await expect(page.getByTestId("seal-confirmation")).toContainText("Final Seal applied");
  await expect(panel(page).getByRole("status")).toHaveText("The Final Seal was applied. The report is now signed off.");
  // The banner comes from the reloaded API state.
  await expect(page.getByTestId("seal-banner")).toHaveAttribute("data-status", "sealed");
  await expect(page.getByTestId("seal-banner")).toContainText("Sign-off note: Checked every step by hand.");
  await expect(panel(page).getByRole("button", { name: "Apply the Final Seal" })).toHaveCount(0);

  // Edit one sentence so its evidence goes stale; the server breaks the seal.
  const detail = (await (await request.get(`/api/v1/projects/${id}`)).json()) as { scriptVersion: { text: string } };
  const edited = detail.scriptVersion.text.replace(
    "First, click New Invoice to start a draft.",
    "Start by opening the billing screen.",
  );
  expect(edited).not.toBe(detail.scriptVersion.text);
  const saved = await request.post(`/api/v1/projects/${id}/scripts`, { data: { text: edited } });
  expect(saved.status()).toBe(201);

  await page.reload();
  const banner = page.getByTestId("seal-banner");
  await expect(banner).toHaveAttribute("data-status", "broken");
  await expect(banner).toContainText("Seal broken: evidence changed after sign-off");
  const cov = (await (await request.get(`/api/v1/projects/${id}/coverage`)).json()) as {
    seal: { status: string } | null;
    blockers: string[];
  };
  expect(cov.seal?.status).toBe("broken");
  // Sealing again is offered only through the blockers the server now reports.
  await expect(panel(page).getByRole("button", { name: "Apply the Final Seal" })).toBeDisabled();
  await expect(panel(page).getByRole("list", { name: "What blocks the Final Seal" })).toContainText(
    "Some evidence is out of date",
  );
});

test("a 409 after the confirm step shows the new blockers", async ({ page, request }) => {
  const id = await makeCopy(request);
  await reviewEverything(request, id);
  await page.goto(`/projects/${id}/report`);
  await panel(page).getByRole("button", { name: "Apply the Final Seal" }).click();

  // Something changes on the server while the confirm step is open.
  const ev = (await (await request.get(`/api/v1/projects/${id}`)).json()) as { scriptVersion: { text: string } };
  await request.post(`/api/v1/projects/${id}/scripts`, {
    data: { text: ev.scriptVersion.text.replace("First, click New Invoice to start a draft.", "Open billing first.") },
  });

  await panel(page).getByRole("button", { name: "Sign and seal" }).click();
  await expect(panel(page).getByRole("alert")).toContainText("The project cannot be sealed yet.");
  await expect(page.getByTestId("seal-confirmation")).toHaveCount(0);
  await expect(panel(page).getByRole("list", { name: "What blocks the Final Seal" })).toContainText(
    "Some evidence is out of date",
  );
  await expect(panel(page).getByRole("button", { name: "Apply the Final Seal" })).toBeDisabled();
});

test("the demo has no seal action and its exports download", async ({ page, request }) => {
  await page.goto("/projects/proofpay-demo/report");
  await expect(page.getByTestId("coverage-row").first()).toBeVisible();
  await expect(panel(page).getByRole("button", { name: "Apply the Final Seal" })).toHaveCount(0);
  await expect(panel(page)).toContainText("The public demo cannot be sealed.");

  const csvHref = await page.getByRole("link", { name: "Download CSV" }).getAttribute("href");
  const htmlHref = await page.getByRole("link", { name: "Open printable HTML" }).getAttribute("href");
  expect(csvHref).toBe("/api/v1/projects/proofpay-demo/report.csv");
  expect(htmlHref).toBe("/api/v1/projects/proofpay-demo/report.html");
  const csv = await request.get(csvHref!);
  expect(csv.status()).toBe(200);
  expect(csv.headers()["content-type"]).toContain("text/csv");
  expect(await csv.text()).toContain("Draft: not signed off");
  const html = await request.get(htmlHref!);
  expect(html.status()).toBe(200);
  expect(html.headers()["content-type"]).toContain("text/html");
});

async function printChecks(page: Page) {
  await page.emulateMedia({ media: "print" });
  return page.evaluate(() => {
    const body = getComputedStyle(document.body);
    const running = Array.from(document.querySelectorAll<HTMLElement>("*")).filter((el) => {
      const cs = getComputedStyle(el);
      return cs.display !== "none" && cs.animationName !== "none";
    }).length;
    const rows = Array.from(document.querySelectorAll("tr")).map((tr) => getComputedStyle(tr).breakInside);
    const fog = document.querySelector(".sleuth-fog");
    const header = document.querySelector("body header");
    return {
      bg: body.backgroundColor,
      color: body.color,
      running,
      rows,
      fogShown: fog ? getComputedStyle(fog).display !== "none" : false,
      siteHeaderShown: header ? getComputedStyle(header).display !== "none" : false,
      tooWide: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    };
  });
}

for (const format of ["A4", "Letter"] as const) {
  test(`the printable HTML export prints light, still and unsplit on ${format}`, async ({ page, request }) => {
    const html = await (await request.get("/api/v1/projects/proofpay-demo/report.html")).text();
    // A4 is about 794 px wide at 96 dpi; Letter about 816 px. Check at the narrower printable width.
    await page.setViewportSize({ width: format === "A4" ? 718 : 740, height: 1000 });
    await page.setContent(html);
    const r = await printChecks(page);
    expect(r.bg).toBe("rgb(255, 255, 255)");
    expect(r.running).toBe(0);
    expect(r.rows.length).toBeGreaterThan(0);
    expect(new Set(r.rows)).toEqual(new Set(["avoid"]));
    expect(r.tooWide).toBe(false);
    const pdf = await page.pdf({ format, printBackground: true });
    expect(pdf.byteLength).toBeGreaterThan(1000);
  });

  test(`the report page printed with Print is light, still and unsplit on ${format}`, async ({ page }) => {
    await page.goto("/projects/proofpay-demo/report");
    await expect(page.getByTestId("coverage-row").first()).toBeVisible();
    // The Print button calls window.print(); check it is wired, then check the print styles it uses.
    await page.evaluate(() => {
      (window as unknown as { __printed: number }).__printed = 0;
      window.print = () => {
        (window as unknown as { __printed: number }).__printed += 1;
      };
    });
    await page.getByRole("button", { name: "Print" }).click();
    expect(await page.evaluate(() => (window as unknown as { __printed: number }).__printed)).toBe(1);

    await page.setViewportSize({ width: format === "A4" ? 718 : 740, height: 1000 });
    const r = await printChecks(page);
    expect(r.bg).toBe("rgb(255, 255, 255)");
    expect(r.color).toBe("rgb(17, 17, 17)");
    expect(r.running).toBe(0);
    expect(r.fogShown).toBe(false);
    expect(r.siteHeaderShown).toBe(false);
    expect(new Set(r.rows)).toEqual(new Set(["avoid"]));
    expect(r.tooWide).toBe(false);
    await expect(page.getByRole("button", { name: "Print" })).toBeHidden();
    await expect(page.getByTestId("seal-banner")).toBeVisible();
    const pdf = await page.pdf({ format, printBackground: true });
    expect(pdf.byteLength).toBeGreaterThan(1000);
  });
}
