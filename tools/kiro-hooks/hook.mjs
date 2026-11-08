#!/usr/bin/env node
// Commands behind the hooks in .kiro/hooks/. Plain Node so it behaves the same in PowerShell, cmd and bash.
// Contract: exit 0 = fine (stdout is shown to the agent), anything else = failure (stderr is shown).
// Keep every step fast. Never run the end-to-end suite from here.
import { spawnSync } from "node:child_process";

const run = (command) =>
  spawnSync(command, {
    shell: true,
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024,
    env: { ...process.env, FORCE_COLOR: "0", NO_COLOR: "1" },
  });

function fail(title, result) {
  const body = `${result.stdout ?? ""}${result.stderr ?? ""}`.trim().split("\n").slice(-60).join("\n");
  console.error(`${title}\n${body}`);
  process.exit(1);
}

/** Run one command; stay silent on success, print the tail of the output on failure. */
function step(title, command) {
  const result = run(command);
  if (result.status !== 0) fail(`FAILED: ${title}`, result);
}

function changedFiles() {
  const tracked = run("git diff --name-only HEAD").stdout ?? "";
  const untracked = run("git ls-files --others --exclude-standard").stdout ?? "";
  return `${tracked}\n${untracked}`
    .split("\n")
    .map((f) => f.trim().replace(/\\/g, "/"))
    .filter(Boolean);
}

const [cmd, arg] = process.argv.slice(2);

switch (cmd) {
  // Tests (unit and property) of one package: `test domain`, `test evidence-engine`.
  case "test": {
    if (!/^[a-z-]+$/.test(arg ?? "")) {
      console.error("usage: hook.mjs test <package-folder-name>");
      process.exit(2);
    }
    step(`tests in packages/${arg}`, `pnpm exec vitest run packages/${arg} --reporter=dot`);
    console.log(`packages/${arg}: unit and property tests pass.`);
    break;
  }

  // Contract package changed: golden fixture, OpenAPI, then typecheck the whole workspace.
  case "contracts": {
    step("pnpm check:contracts", "pnpm check:contracts");
    step("pnpm typecheck", "pnpm typecheck");
    console.log(
      "Contracts check and workspace typecheck pass. Reminder: label the pull request `contract-change` and tick the box in the PR template.",
    );
    break;
  }

  // After a spec task: typecheck and test only the areas that changed.
  case "task-check": {
    const files = changedFiles();
    const areas = new Set();
    for (const f of files) {
      const m = /^(packages|apps)\/([^/]+)\//.exec(f);
      if (m) areas.add(`${m[1]}/${m[2]}`);
      if (f.startsWith("fixtures/golden/")) areas.add("contract");
    }
    if (areas.size === 0) {
      console.log("No package changes to check.");
      break;
    }
    for (const area of areas) {
      if (area === "contract") continue;
      const name = area.split("/")[1];
      step(`typecheck ${area}`, `pnpm --filter @sleuth/${name} typecheck`);
      step(`tests in ${area}`, `pnpm exec vitest run ${area} --reporter=dot`);
    }
    if (areas.has("contract") || areas.has("packages/contracts")) {
      step("pnpm check:contracts", "pnpm check:contracts");
    }
    console.log(`Checked: ${[...areas].join(", ")}. Typecheck and tests pass.`);
    break;
  }

  // Cheap, deterministic part of "Ghost hunt": where could AI output become `confirmed`?
  case "ghost-scan": {
    const diff = run("git diff HEAD -U0 -- *.ts *.tsx").stdout ?? "";
    const hits = [];
    let file = "";
    for (const line of diff.split("\n")) {
      if (line.startsWith("+++ b/")) file = line.slice(6);
      if (!line.startsWith("+") || line.startsWith("+++")) continue;
      if (/\.(test|spec)\.tsx?$/.test(file) || file.endsWith("packages/domain/src/review.ts")) continue;
      if (/status\s*[:=]\s*["']confirmed["']|["']confirmed["']\s+as\s|auto-?confirm/i.test(line)) {
        hits.push(`${file}: ${line.slice(1).trim()}`);
      }
    }
    if (hits.length === 0) {
      console.log("ghost-scan: no new code outside review.ts sets evidence to confirmed.");
    } else {
      console.log(
        `ghost-scan: ${hits.length} line(s) may confirm evidence outside applyReviewDecision. Check each needs a human decision:\n${hits.join("\n")}`,
      );
    }
    break;
  }

  default:
    console.error("usage: hook.mjs <test|contracts|task-check|ghost-scan> [arg]");
    process.exit(2);
}
