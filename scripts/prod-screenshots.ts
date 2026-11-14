/**
 * Screenshots of the live site for the submission (issue #81). Signed out, no credentials.
 *
 *   pnpm exec playwright install chromium        # once
 *   pnpm tsx scripts/prod-screenshots.ts
 *   pnpm tsx scripts/prod-screenshots.ts --project <id>   # also that project's report (the sealed one)
 *
 * Captures at 1440x900 and 375x812: the dashboard hero, the findings cabinet, the demo workspace
 * with the claims map, the Lantern open on line 3, the demo report (draft) and the 404 page.
 * Files go to docs/submission/screenshots/production/ and their paths are printed.
 * Playwright shoots the page only, so no browser URL bar is ever in a picture.
 * PROD_SITE_URL overrides the site (https only).
 */
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { chromium, type Page } from "@playwright/test";

export const VIEWPORTS = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "mobile", width: 375, height: 812 },
] as const;

export const OUT_DIR = join("docs", "submission", "screenshots", "production");

/** `--project <id>`: a project id is letters, digits, `-` and `_` only. Anything else is refused. */
export function parseProjectArg(argv: readonly string[]): string | null | "invalid" {
  const at = argv.indexOf("--project");
  if (at < 0) return null;
  const id = argv[at + 1] ?? "";
  return /^[A-Za-z0-9_-]{1,100}$/.test(id) ? id : "invalid";
}

/** Only https sites, so the script cannot be pointed at a local or plain-http address by mistake. */
export function siteOf(env: Record<string, string | undefined>): string | null {
  const site = (env.PROD_SITE_URL ?? "https://sleuth-eight.vercel.app").trim().replace(/\/$/, "");
  return /^https:\/\/[a-z0-9.-]+$/i.test(site) ? site : null;
}

export function fileName(shot: string, viewport: string): string {
  return join(OUT_DIR, `${shot}-${viewport}.png`);
}

const WAIT = 60_000;

async function settle(page: Page): Promise<void> {
  // Let fonts and the real counts arrive; the grain, fog and mist are still images or slow drifts.
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(800);
}

async function shoot(page: Page, shot: string, viewport: string, saved: string[]): Promise<void> {
  const path = fileName(shot, viewport);
  await page.screenshot({ path });
  saved.push(path);
  console.log(`saved ${path}`);
}

async function main(): Promise<void> {
  const site = siteOf(process.env);
  if (!site) throw new Error("PROD_SITE_URL must be an https address");
  const project = parseProjectArg(process.argv.slice(2));
  if (project === "invalid") throw new Error("--project needs a project id (letters, digits, - and _)");
  mkdirSync(OUT_DIR, { recursive: true });

  const res = await fetch(`${site}/api/v1/projects`);
  const demo = ((await res.json()) as { projects: { id: string; isDemo: boolean }[] }).projects.find((p) => p.isDemo);
  if (!demo) throw new Error("the site lists no public demo");
  const demoPath = `/projects/${encodeURIComponent(demo.id)}`;

  const browser = await chromium.launch();
  const saved: string[] = [];
  try {
    for (const vp of VIEWPORTS) {
      // A fresh context per size: signed out, no stored Night wind choice.
      const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
      const page = await context.newPage();

      await page.goto(`${site}/`);
      await page.getByTestId("hero-coverage").waitFor({ timeout: WAIT });
      await page.getByTestId("clue-card").waitFor({ timeout: WAIT }).catch(() => undefined);
      await settle(page);
      await shoot(page, "dashboard-hero", vp.name, saved);

      await page.locator("#findings-guide").scrollIntoViewIfNeeded();
      await page.getByRole("radiogroup", { name: "Finding types" }).waitFor({ timeout: WAIT });
      await page.evaluate(() => document.getElementById("findings-guide")?.scrollIntoView({ block: "start" }));
      await settle(page);
      await shoot(page, "findings-cabinet", vp.name, saved);

      await page.goto(`${site}${demoPath}`);
      const map = page.getByTestId("claims-map");
      await map.waitFor({ timeout: WAIT });
      await page.evaluate(() => document.querySelector("[data-testid=claims-map]")?.scrollIntoView({ block: "start" }));
      await settle(page);
      await shoot(page, "workspace-claims-map", vp.name, saved);

      await map.getByRole("button", { name: /^Line 3\s*,/i }).click();
      await page.locator("#lantern-heading").filter({ hasText: "line 3" }).waitFor({ timeout: WAIT });
      await page.evaluate(() =>
        document.querySelector("[data-testid=lantern-panel]")?.scrollIntoView({ block: "start" }),
      );
      await settle(page);
      await shoot(page, "workspace-lantern-line-3", vp.name, saved);

      await page.goto(`${site}${demoPath}/report`);
      await page.getByTestId("seal-banner").waitFor({ timeout: WAIT });
      await settle(page);
      await shoot(page, "report-draft", vp.name, saved);

      await page.goto(`${site}/no-such-room-${vp.name}`);
      await page.getByRole("heading", { level: 1 }).waitFor({ timeout: WAIT });
      await settle(page);
      await shoot(page, "not-found", vp.name, saved);

      if (project) {
        await page.goto(`${site}/projects/${encodeURIComponent(project)}/report`);
        await page.getByTestId("seal-banner").waitFor({ timeout: WAIT });
        await settle(page);
        await shoot(page, `report-${project}`, vp.name, saved);
      }
      await context.close();
    }
  } finally {
    await browser.close();
  }
  console.log(`${saved.length} screenshots in ${OUT_DIR}`);
}

// Run only as a script, so the unit test can import the helpers.
if (process.argv[1] && /prod-screenshots\.ts$/.test(process.argv[1])) {
  main().catch((e: unknown) => {
    console.log(`FAIL  ${e instanceof Error ? e.message : "unknown error"}`);
    process.exit(1);
  });
}
