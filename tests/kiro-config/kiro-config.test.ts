import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { z } from "zod";

/**
 * Checks our hook, agent and MCP files against the formats we built them for (Kiro IDE 1.x:
 * v1 hook JSON, Markdown agents, mcp.json). It cannot prove the IDE loads them: open the
 * Agent Hooks panel and the agent selector once to confirm.
 */

const root = join(__dirname, "..", "..");
const read = (p: string) => readFileSync(join(root, p), "utf8");

const TRIGGERS = [
  "UserPromptSubmit",
  "Stop",
  "SessionStart",
  "PreToolUse",
  "PostToolUse",
  "PostFileCreate",
  "PostFileSave",
  "PostFileDelete",
  "PreTaskExec",
  "PostTaskExec",
] as const;

const HookFile = z.object({
  version: z.literal("v1"),
  hooks: z
    .array(
      z.object({
        name: z.string().min(1),
        description: z.string().optional(),
        trigger: z.enum(TRIGGERS),
        matcher: z.string().optional(),
        action: z.discriminatedUnion("type", [
          z.object({ type: z.literal("command"), command: z.string().min(1) }),
          z.object({ type: z.literal("agent"), prompt: z.string().min(20) }),
        ]),
        timeout: z.number().int().nonnegative().optional(),
        enabled: z.boolean().optional(),
      }),
    )
    .min(1),
});

describe(".kiro/hooks", () => {
  const files = readdirSync(join(root, ".kiro", "hooks")).filter((f) => f.endsWith(".json"));

  it("has the four automations we promised", () => {
    const names = files.flatMap((f) =>
      HookFile.parse(JSON.parse(read(`.kiro/hooks/${f}`))).hooks.map((h) => h.name),
    );
    expect(names.join("|")).toMatch(/Domain tests/);
    expect(names.join("|")).toMatch(/Evidence engine tests/);
    expect(names.join("|")).toMatch(/Contracts check/);
    expect(names.join("|")).toMatch(/spec task/);
  });

  it.each(files)("%s matches the v1 hook format", (f) => {
    const parsed = HookFile.parse(JSON.parse(read(`.kiro/hooks/${f}`)));
    for (const h of parsed.hooks) {
      const { matcher } = h;
      if (matcher) expect(() => new RegExp(matcher)).not.toThrow();
      if (h.trigger === "PostFileSave") expect(h.matcher).toBeDefined();
      if (h.action.type === "command") {
        const script = /tools\/kiro-hooks\/[\w.-]+/.exec(h.action.command)?.[0];
        if (script) expect(existsSync(join(root, script))).toBe(true);
      }
    }
  });

  it("file matchers select the right packages on Windows and Unix paths", () => {
    const hooks = HookFile.parse(JSON.parse(read(".kiro/hooks/package-tests-on-save.json"))).hooks;
    const domain = new RegExp(hooks[0]?.matcher ?? "");
    expect(domain.test("packages/domain/src/segment.ts")).toBe(true);
    expect(domain.test("packages\\domain\\src\\segment.ts")).toBe(true);
    expect(domain.test("packages/db/src/schema.ts")).toBe(false);
  });

  it("never runs the end-to-end suite", () => {
    for (const f of files) expect(read(`.kiro/hooks/${f}`)).not.toMatch(/test:e2e|playwright/i);
  });
});

function frontmatter(text: string): { data: Record<string, unknown>; body: string } {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/.exec(text);
  if (!m) throw new Error("no frontmatter");
  return { data: parseSimpleYaml(m[1] ?? ""), body: m[2] ?? "" };
}

/** Enough YAML for our agent files: scalars, flow lists, and the permissions.rules block. */
function parseSimpleYaml(src: string): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const rules: { capability?: string; match?: string[]; effect?: string }[] = [];
  let inRules = false;
  for (const raw of src.split(/\r?\n/)) {
    const line = raw.replace(/\s+#.*$/, "");
    if (line.trim() === "" || line.trim().startsWith("#")) continue;
    if (/^permissions:/.test(line) || /^\s+rules:/.test(line)) {
      inRules = true;
      continue;
    }
    if (inRules) {
      const item = /^\s+- capability:\s*(\S+)/.exec(line);
      if (item) rules.push({ capability: item[1] });
      const match = /^\s+match:\s*(\[.*\])/.exec(line);
      if (match)
        (rules[rules.length - 1] as { match?: string[] }).match = JSON.parse(match[1] ?? "[]");
      const effect = /^\s+effect:\s*(\S+)/.exec(line);
      if (effect) (rules[rules.length - 1] as { effect?: string }).effect = effect[1];
      if (/^\S/.test(line)) inRules = false;
      else continue;
    }
    const kv = /^(\w+):\s*(.*)$/.exec(line);
    if (!kv) continue;
    const value = kv[2] ?? "";
    out[kv[1] as string] = value.startsWith("[")
      ? JSON.parse(value.replace(/(\w+)/g, '"$1"'))
      : value.replace(/^"|"$/g, "");
  }
  out.rules = rules;
  return out;
}

describe(".kiro/agents", () => {
  const agents = ["frontend-builder", "backend-builder", "media-builder", "qa-reviewer"];

  it.each(agents)("%s has valid frontmatter and a prompt", (name) => {
    const { data, body } = frontmatter(read(`.kiro/agents/${name}.md`));
    expect(data.name).toBe(name);
    expect(String(data.description).length).toBeGreaterThan(20);
    const tools = z.array(z.enum(["read", "write", "shell", "web"])).parse(data.tools);
    expect(tools.length).toBeGreaterThan(0);
    expect(body.length).toBeGreaterThan(200);
    for (const r of data.rules as { capability: string; effect: string }[]) {
      expect(["fs_read", "fs_write", "shell", "web_fetch", "mcp"]).toContain(r.capability);
      expect(["allow", "ask", "deny"]).toContain(r.effect);
    }
  });

  it("qa-reviewer is read-only: no write tool and writes denied", () => {
    const { data } = frontmatter(read(".kiro/agents/qa-reviewer.md"));
    expect(data.tools).not.toContain("write");
    const rules = data.rules as { capability: string; effect: string; match?: string[] }[];
    expect(
      rules.some(
        (r) => r.capability === "fs_write" && r.effect === "deny" && r.match?.includes("**"),
      ),
    ).toBe(true);
  });

  it("each builder may write only its own area and is denied the others", () => {
    const rulesOf = (n: string) =>
      frontmatter(read(`.kiro/agents/${n}.md`)).data.rules as {
        capability: string;
        effect: string;
        match: string[];
      }[];
    const allowed = (n: string) =>
      rulesOf(n)
        .filter((r) => r.effect === "allow")
        .flatMap((r) => r.match);
    const denied = (n: string) =>
      rulesOf(n)
        .filter((r) => r.effect === "deny")
        .flatMap((r) => r.match);
    expect(allowed("backend-builder")).toContain("packages/domain/**");
    expect(denied("backend-builder")).toContain("apps/worker/**");
    expect(allowed("media-builder")).toContain("packages/evidence-engine/**");
    expect(denied("media-builder")).toContain("packages/domain/**");
    expect(allowed("frontend-builder")).toContain("tests/e2e/**");
    expect(denied("frontend-builder")).toContain("apps/web/app/api/**");
    for (const n of ["frontend-builder", "backend-builder", "media-builder"]) {
      expect(allowed(n).filter((p) => denied(n).includes(p))).toEqual([]);
    }
  });
});

describe(".kiro/settings/mcp.json", () => {
  const config = z
    .object({
      mcpServers: z.record(
        z.string(),
        z.object({
          command: z.string().optional(),
          args: z.array(z.string()).optional(),
          url: z.string().optional(),
          headers: z.record(z.string(), z.string()).optional(),
          env: z.record(z.string(), z.string()).optional(),
          disabled: z.boolean(),
        }),
      ),
    })
    .parse(JSON.parse(read(".kiro/settings/mcp.json")));

  it("suggests Supabase, Playwright and GitHub, all disabled by default", () => {
    expect(Object.keys(config.mcpServers).sort()).toEqual(["github", "playwright", "supabase"]);
    expect(Object.values(config.mcpServers).every((s) => s.disabled)).toBe(true);
  });

  it("contains no secrets, only placeholders and variable references", () => {
    const text = read(".kiro/settings/mcp.json");
    expect(text).not.toMatch(/ghp_|github_pat_|sbp_|sk-|eyJ[A-Za-z0-9]/);
    for (const s of Object.values(config.mcpServers)) {
      for (const v of Object.values({ ...s.env, ...s.headers })) expect(v).toMatch(/\$\{[A-Z_]+\}/);
    }
  });

  it("pins package versions", () => {
    for (const s of Object.values(config.mcpServers)) {
      for (const a of s.args ?? []) if (a.startsWith("@")) expect(a).toMatch(/@\d+\.\d+\.\d+$/);
    }
  });
});
