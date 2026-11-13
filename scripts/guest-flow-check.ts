/**
 * Guest sign-in check for a running Sleuth web app in Supabase mode (brief 004, step 1).
 * Drives a real browser with Playwright and prints PASS or FAIL per check, plus the id of the one
 * project it creates. It prints no cookie, token, key or URL with a token in it.
 *
 *   pnpm tsx scripts/guest-flow-check.ts http://localhost:3100 <clip.mp4>
 *   pnpm tsx scripts/guest-flow-check.ts https://sleuth-eight.vercel.app <clip.mp4>
 *
 * The clip must be our own footage, a few seconds long (make one with scripts/make-check-clip.ps1).
 * The browser reads its real length, so no stub is involved.
 * The server under test decides which Supabase project is used. Run it against sleuth-dev first.
 * The project it makes is named by the app (not by this script), so delete it by the printed id.
 */
import { existsSync } from "node:fs";
import { basename } from "node:path";
import { chromium, type BrowserContext, type Page } from "@playwright/test";

const BASE = (process.argv[2] ?? "").replace(/\/$/, "");
const CLIP = process.argv[3] ?? "";
if (
  !/^https?:\/\/[A-Za-z0-9.-]+(:\d+)?$/.test(BASE) ||
  !/\.(mp4|webm)$/i.test(CLIP) ||
  !existsSync(CLIP)
) {
  console.log(
    "FAIL  usage: pnpm tsx scripts/guest-flow-check.ts <base url> <path to our own .mp4 or .webm clip>",
  );
  process.exit(1);
}

let failed = 0;
function check(name: string, ok: boolean, detail = ""): void {
  if (!ok) failed += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` (${detail})` : ""}`);
}

const projectLinks = (page: Page) => page.locator("a[href^='/projects/']");

async function projectIds(page: Page): Promise<string[]> {
  const hrefs = await projectLinks(page).evaluateAll((els) =>
    els.map((e) => e.getAttribute("href") ?? ""),
  );
  return [...new Set(hrefs.map((h) => decodeURIComponent(h.replace("/projects/", ""))))];
}

async function main(): Promise<void> {
  const browser = await chromium.launch();
  const open: BrowserContext[] = [];
  try {
    const ctxA = await browser.newContext();
    open.push(ctxA);
    const a = await ctxA.newPage();

    // 1. Signed out: the demo is listed and the create button is there.
    await a.goto(`${BASE}/`);
    const create = a.getByRole("button", {
      name: /^(Create a project|Starting a guest session|Creating)/,
    });
    await create.waitFor({ timeout: 30_000 });
    const before = await projectIds(a);
    check(
      "signed out: dashboard lists exactly the public demo",
      before.length === 1,
      `${before.length} project(s)`,
    );
    const note = await a.getByText(/guest session in this browser only/).count();
    check("signed out: the guest-session note is shown", note > 0);

    // 2. Press create: guest label, then a new project. The label is short-lived, so it is
    // watched every animation frame from before the click.
    const sawLabel = a
      .waitForFunction(
        () =>
          Array.from(document.querySelectorAll("button")).some((b) =>
            b.textContent?.includes("Starting a guest session"),
          ),
        undefined,
        { polling: "raf", timeout: 30_000 },
      )
      .then(() => true)
      .catch(() => false);
    await a.getByRole("button", { name: "Create a project" }).click();
    const grew = await a
      .waitForFunction(
        (n) =>
          new Set(
            Array.from(document.querySelectorAll("a[href^='/projects/']")).map((e) =>
              e.getAttribute("href"),
            ),
          ).size > n,
        before.length,
        { timeout: 30_000 },
      )
      .then(() => true)
      .catch(() => false);
    check('create: the button showed "Starting a guest session..."', await sawLabel);
    // Next.js keeps an empty role="alert" route announcer on every page; only an alert with text counts.
    const alerts = (await a.getByRole("alert").allTextContents()).filter((s) => s.trim() !== "");
    check(
      "create: no error alert",
      alerts.length === 0,
      alerts.length ? "an alert is showing" : "",
    );
    if (!grew) check("create: the project list grew within 30 s", false);
    const after = await projectIds(a);
    const created = after.filter((id) => !before.includes(id));
    check("create: one new project is listed", created.length === 1, `${created.length} new`);
    const projectId = created[0];
    if (!projectId) throw new Error("no project was created");
    console.log(`      test project id: ${projectId}  (delete this one row by id)`);

    // 3. Reload: the cookie reached the server, so the project is still listed.
    await a.reload();
    await create.waitFor({ timeout: 30_000 });
    const reloaded = await projectIds(a);
    check("reload: the project is still listed", reloaded.includes(projectId));

    // 4. A second private browser context must not see it.
    const ctxB = await browser.newContext();
    open.push(ctxB);
    const b = await ctxB.newPage();
    await b.goto(`${BASE}/`);
    await b
      .getByRole("button", { name: /^(Create a project|Starting a guest session|Creating)/ })
      .waitFor({
        timeout: 30_000,
      });
    const other = await projectIds(b);
    check(
      "second browser: does not see the project",
      !other.includes(projectId),
      `${other.length} project(s)`,
    );
    await b.goto(`${BASE}/projects/${encodeURIComponent(projectId)}`);
    // The page loads on the client, so wait for its answer before reading it.
    const notFound = await b
      .getByText("Project not found")
      .waitFor({ timeout: 30_000 })
      .then(() => true)
      .catch(() => false);
    const leaked = await b.locator("section[aria-labelledby='upload-heading']").count();
    check(
      "second browser: opening it by address shows Project not found",
      notFound && leaked === 0,
    );

    // 5. Upload in the new project: a text file is refused, a small video is accepted.
    await a.goto(`${BASE}/projects/${encodeURIComponent(projectId)}`);
    const upload = a.locator("section[aria-labelledby='upload-heading']");
    await upload.getByLabel("Choose a video file").waitFor({ timeout: 30_000 });
    let uploadAsked = false;
    a.on("request", (r) => {
      if (r.url().includes("/upload-url") && r.method() === "POST") uploadAsked = true;
    });
    await upload.getByLabel("Choose a video file").setInputFiles({
      name: "notes.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("not a video"),
    });
    const refusal = await upload
      .getByRole("alert")
      .textContent({ timeout: 15_000 })
      .catch(() => null);
    check("upload: a text file is refused", !!refusal && /not a video|not allowed/i.test(refusal));
    check("upload: the refused file asked the server for nothing", !uploadAsked);

    const saved = a.waitForResponse(
      (r) => r.url().includes("/upload-url") && r.request().method() === "POST",
    );
    await upload.getByLabel("Choose a video file").setInputFiles(CLIP);
    const res = await saved.catch(() => null);
    check(
      "upload: the server issued an upload address (201)",
      res?.status() === 201,
      String(res?.status() ?? "none"),
    );
    const done = await upload
      .getByText(/Video version \d+ saved\./)
      .waitFor({ timeout: 60_000 })
      .then(() => true)
      .catch(() => false);
    check(`upload: our clip ${basename(CLIP)} is accepted and saved`, done);
    const fixtureNote = await upload.getByText(/Fixture mode has no storage/).count();
    check("upload: the bytes really went to storage (not fixture mode)", fixtureNote === 0);
  } finally {
    for (const c of open) await c.close().catch(() => undefined);
    await browser.close();
  }
  console.log(failed === 0 ? "ALL CHECKS PASSED" : `${failed} CHECK(S) FAILED`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e: unknown) => {
  // A browser error message can hold a URL, so only the error name is printed.
  console.log("FAIL  script error: " + (e instanceof Error ? e.name : "unknown"));
  process.exit(1);
});
