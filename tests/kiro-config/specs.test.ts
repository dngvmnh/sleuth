import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Checks the structure of .kiro/specs: three files per spec, every task has an owner, files and
 * a "done when", every cited requirement exists, and each task only touches files its owner may edit.
 */

const root = join(__dirname, "..", "..");
const SPECS = ["ingestion", "evidence-analysis", "change-impact", "review-workspace", "final-seal"];

const OWNERS = {
  Đăng: [
    "packages/contracts/",
    "packages/domain/",
    "packages/db/",
    "apps/web/app/api/",
    "fixtures/golden/",
    "scripts/",
  ],
  Đạt: [
    "apps/web/app/(workspace)/",
    "apps/web/app/layout.tsx",
    "apps/web/components/",
    "apps/web/features/",
    "apps/web/styles/",
    "apps/web/lib/",
    "tests/e2e/",
  ],
  "Phạm Quốc Bảo": [
    "apps/worker/",
    "packages/media/",
    "packages/evidence-engine/",
    "tests/evaluation/",
  ],
} as const;
type Owner = keyof typeof OWNERS;

/** Files anyone may list: docs, root configs, tests of the task's own area are checked above. */
const SHARED = [
  /^docs\//,
  /^package\.json$/,
  /^vitest\.config\.ts$/,
  /^\.gitignore$/,
  /^\.env\.example$/,
  /^\.github\//,
  /^apps\/web\/package\.json$/,
  /^packages\/[^/]+\/package\.json$/,
  /^tests\/evaluation\/clips\//,
];

function ownerOf(label: string): Owner {
  if (label.startsWith("Đăng")) return "Đăng";
  if (label.startsWith("Đạt")) return "Đạt";
  if (label.startsWith("Phạm Quốc Bảo") || label.startsWith("Bảo")) return "Phạm Quốc Bảo";
  throw new Error(`unknown owner: ${label}`);
}

interface Task {
  id: number;
  title: string;
  owner: Owner;
  files: string[];
  hasDone: boolean;
  requirements: string[];
}

/** Tasks write `a/b/x.ts`, `x.test.ts` meaning the same folder. Bare names resolve to the last folder seen. */
function resolveFiles(listed: string[]): string[] {
  let dir = "";
  return listed.map((f) => {
    if (f.includes("/")) {
      dir = f.slice(0, f.lastIndexOf("/") + 1);
      return f;
    }
    return dir + f;
  });
}

function parseTasks(spec: string): Task[] {
  const text = readFileSync(join(root, ".kiro", "specs", spec, "tasks.md"), "utf8");
  const blocks = text.split(/\n(?=- \[[ x]\] \d+\. )/).slice(1);
  return blocks.map((b) => {
    const head = /^- \[[ x]\] (\d+)\. (.+)$/m.exec(b);
    const ownerLine = /^\s+- Owner: (.+)$/m.exec(b)?.[1] ?? "";
    const filesLine = /^\s+- Files: (.+)$/m.exec(b)?.[1] ?? "";
    const reqLine = /^\s+- Requirements: (.+)$/m.exec(b)?.[1] ?? "";
    return {
      id: Number(head?.[1]),
      title: head?.[2] ?? "",
      owner: ownerOf(ownerLine),
      files: resolveFiles([...filesLine.matchAll(/`([^`]+)`/g)].map((m) => m[1] ?? "")),
      hasDone: /^\s+- Done when: .+/m.test(b),
      requirements: [...reqLine.matchAll(/\b(\d+\.\d+)\b/g)].map((m) => m[1] ?? ""),
    };
  });
}

function requirementIds(spec: string): Set<string> {
  const text = readFileSync(join(root, ".kiro", "specs", spec, "requirements.md"), "utf8");
  return new Set([...text.matchAll(/^(\d+\.\d+) /gm)].map((m) => m[1] ?? ""));
}

describe.each(SPECS)("spec %s", (spec) => {
  it("has requirements, design and tasks", () => {
    for (const f of ["requirements.md", "design.md", "tasks.md"]) {
      expect(existsSync(join(root, ".kiro", "specs", spec, f))).toBe(true);
    }
  });

  it("uses EARS-style criteria and marks property-tested ones", () => {
    const text = readFileSync(join(root, ".kiro", "specs", spec, "requirements.md"), "utf8");
    expect(requirementIds(spec).size).toBeGreaterThan(10);
    expect(text).toMatch(/\[PBT/);
    expect(text).toMatch(
      /\bTHE (SYSTEM|WORKER|REPOSITORY|EXPORTS|REPORT|PRINTABLE HTML|TEAM|HARNESS)\b.*\bSHALL\b|\bSHALL\b/,
    );
  });

  const tasks = parseTasks(spec);

  it("has numbered tasks with owner, files and a done condition", () => {
    expect(tasks.length).toBeGreaterThanOrEqual(5);
    tasks.forEach((t, i) => {
      expect(t.id, `${spec} task order`).toBe(i + 1);
      expect(t.files.length, `${spec} task ${t.id} files`).toBeGreaterThan(0);
      expect(t.hasDone, `${spec} task ${t.id} done when`).toBe(true);
    });
  });

  it("cites only requirements that exist", () => {
    const ids = requirementIds(spec);
    for (const t of tasks)
      for (const r of t.requirements)
        expect(ids.has(r), `${spec} task ${t.id} cites ${r}`).toBe(true);
  });

  it("only lists files its owner may edit", () => {
    for (const t of tasks) {
      for (const f of t.files) {
        const own = OWNERS[t.owner].some((p) => f.startsWith(p));
        const shared = SHARED.some((re) => re.test(f));
        expect(own || shared, `${spec} task ${t.id} (${t.owner}) lists ${f}`).toBe(true);
      }
    }
  });
});

describe("every spec task is accounted for in the team plan", () => {
  const plan = readFileSync(join(root, "docs", "team-plan.md"), "utf8");
  it("names each developer and the first pull requests", () => {
    expect(plan).toContain("@phatdat220707");
    expect(plan).toContain("@baofrovn");
    expect(plan).toContain("@dngvmnh");
    expect(plan).toContain("feat/domain-segment-state");
    expect(plan).toContain("feat/media-ffmpeg-probe");
    expect(plan).toContain("feat/web-test-tooling");
  });

  it("only schedules tasks that exist", () => {
    for (const m of plan.matchAll(
      /\| (ingestion|evidence-analysis|change-impact|review-workspace|final-seal) (\d+) \|/g,
    )) {
      const spec = m[1] as string;
      const id = Number(m[2]);
      expect(
        parseTasks(spec).some((t) => t.id === id),
        `${spec} ${id}`,
      ).toBe(true);
    }
    expect(readdirSync(join(root, ".kiro", "specs")).sort()).toEqual([...SPECS].sort());
  });
});
