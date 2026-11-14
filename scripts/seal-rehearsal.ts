/**
 * Seal rehearsal on production (issue #81): make one project, analyse our own evidence clip,
 * review every candidate through the review API, then apply the Final Seal. It gives Đăng a
 * sealed report to capture. Team-account mode only.
 *
 * How to run (your own shell; the script never loads `.env.local`):
 *
 *   $env:PROD_SUPABASE_URL = Read-Host "Production Project URL"
 *   $env:PROD_SUPABASE_ANON_KEY = Read-Host "Production anon key"
 *   $env:PROD_E2E_EMAIL = Read-Host "Team account email"
 *   $sec = Read-Host "Team account password" -AsSecureString
 *   $env:PROD_E2E_PASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec))
 *   pnpm tsx scripts/seal-rehearsal.ts <evidence clip.mp4> --dry-run   # prints the plan only
 *   pnpm tsx scripts/seal-rehearsal.ts <evidence clip.mp4>
 *   Remove-Item Env:PROD_SUPABASE_URL, Env:PROD_SUPABASE_ANON_KEY, Env:PROD_E2E_EMAIL, Env:PROD_E2E_PASSWORD
 *
 * The clip comes from scripts/make-evidence-clip.ps1; its script and checklist are in
 * scripts/evidence-clip.json. The worker is started the same way as in prod-e2e.ts: the API
 * dispatches it and the script prints the dispatch word, then waits (SEAL_REHEARSAL_WAIT_MIN,
 * default 15, at most 30).
 *
 * Safety:
 * - Prints ids, counts and the report URL only: never a token, a key, an email, a signed URL,
 *   transcript text or evidence text.
 * - Writes only to a project named zz-seal-<random>, which it creates and checks by name before
 *   every write. Delete it afterwards: docs/deploy-plan.md, "Seal rehearsal".
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { signInModeOf } from "./prod-e2e";

type Json = Record<string, any> | null; // eslint-disable-line @typescript-eslint/no-explicit-any

// ---- pure decision logic (unit tested in seal-rehearsal.test.ts) ----

export interface EvidenceLike {
  id: string;
  status: string;
  scriptSegmentId: string;
  segmentHash: string;
  confidence: string;
}

export interface SegmentLike {
  id: string;
  index: number;
  hash: string;
}

export type RehearsalDecision = "confirm" | "reject" | "needs_outside_proof";

export interface PlannedReview {
  evidenceId: string;
  /** 1-based script line, or null when the evidence points at no current line. */
  line: number | null;
  decision: RehearsalDecision;
  reason: string;
}

export const NAME_PREFIX = "zz-seal-";
const NAME_PATTERN = /^zz-seal-[a-z0-9]{6,}$/;

/** The only project names this script may write to. */
export function isRehearsalName(name: unknown): boolean {
  return typeof name === "string" && NAME_PATTERN.test(name);
}

export function rehearsalName(random: () => number = Math.random): string {
  const part = Array.from({ length: 8 }, () => "abcdefghijklmnopqrstuvwxyz0123456789"[Math.floor(random() * 36)]).join(
    "",
  );
  return `${NAME_PREFIX}${part}`;
}

/**
 * A candidate "matches its line" when it points at a current script line, was found for that
 * line's current text (same hash), and the engine ranked it medium or high. A low match is a
 * guess, so the rehearsal rejects it rather than signing it off.
 */
export function matchesItsLine(evidence: EvidenceLike, segments: readonly SegmentLike[]): boolean {
  const segment = segments.find((s) => s.id === evidence.scriptSegmentId);
  return (
    !!segment &&
    segment.hash === evidence.segmentHash &&
    (evidence.confidence === "high" || evidence.confidence === "medium")
  );
}

/**
 * One decision per undecided item, the way a careful person would on our own clip:
 * - candidate that matches its line: confirm
 * - any other candidate: reject
 * - stale evidence: reject (that is how a person dismisses it, so it stops blocking the seal)
 * - an outside-proof proposal: acknowledge it as needing outside proof
 * Evidence a person already decided is left alone.
 */
export function planReviews(evidence: readonly EvidenceLike[], segments: readonly SegmentLike[]): PlannedReview[] {
  const lineOf = (e: EvidenceLike) => {
    const s = segments.find((x) => x.id === e.scriptSegmentId);
    return s ? s.index + 1 : null;
  };
  const out: PlannedReview[] = [];
  for (const e of evidence) {
    if (e.status === "candidate") {
      const ok = matchesItsLine(e, segments);
      out.push({
        evidenceId: e.id,
        line: lineOf(e),
        decision: ok ? "confirm" : "reject",
        reason: ok ? `matches its line (${e.confidence})` : "does not match its line",
      });
    } else if (e.status === "stale") {
      out.push({ evidenceId: e.id, line: lineOf(e), decision: "reject", reason: "out of date" });
    } else if (e.status === "needs_outside_proof") {
      out.push({ evidenceId: e.id, line: lineOf(e), decision: "needs_outside_proof", reason: "footage cannot prove it" });
    }
  }
  return out;
}

export interface CoverageItemLike {
  checklistItemId: string;
  state: string;
}

/**
 * Reshoot requests, only when the seal rules need them: the seal is blocked by
 * `uncovered_items`, and only for the items that are uncovered. An open reshoot does not block
 * the seal (packages/domain/src/seal.ts), so this is the honest way to seal a project with a
 * step the clip does not show.
 */
export function planReshoots(blockers: readonly string[], items: readonly CoverageItemLike[]): string[] {
  if (!blockers.includes("uncovered_items")) return [];
  return items.filter((i) => i.state === "uncovered").map((i) => i.checklistItemId);
}

export interface Args {
  clip: string;
  dryRun: boolean;
}

export function parseArgs(argv: readonly string[]): Args {
  const rest = argv.filter((a) => a !== "--dry-run");
  return { clip: rest[0] ?? "", dryRun: argv.includes("--dry-run") };
}

// ---- the run ----

const SITE = (process.env.PROD_SITE_URL ?? "https://sleuth-eight.vercel.app").replace(/\/$/, "");
const RAW_SB_URL = process.env.PROD_SUPABASE_URL?.trim().replace(/\/$/, "");
const SB_URL = RAW_SB_URL && /^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(RAW_SB_URL) ? RAW_SB_URL : undefined;
const SB_KEY = process.env.PROD_SUPABASE_ANON_KEY?.trim();
const WAIT_MIN = Math.min(30, Math.max(1, Number(process.env.SEAL_REHEARSAL_WAIT_MIN ?? 15) || 15));

interface ClipPlan {
  script: string[];
  checklist: string[];
}

function loadClipPlan(): ClipPlan {
  const raw = JSON.parse(readFileSync(fileURLToPath(new URL("./evidence-clip.json", import.meta.url)), "utf8")) as ClipPlan;
  return { script: raw.script, checklist: raw.checklist };
}

async function api(method: string, path: string, token: string, body?: unknown) {
  const res = await fetch(`${SITE}/api/v1${path}`, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json: Json;
  try {
    json = JSON.parse(text) as Json;
  } catch {
    json = null;
  }
  return { status: res.status, json, headers: res.headers };
}

function clipDurationMs(path: string): number {
  const out = execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path], {
    encoding: "utf8",
  });
  return Math.round(Number(out.trim()) * 1000);
}

function fail(message: string): never {
  console.log(`FAIL  ${message}`);
  process.exit(1);
}

function printPlan(args: Args, plan: ClipPlan, name: string): void {
  console.log("PLAN (dry run: nothing is sent)");
  console.log(`  site: ${SITE}`);
  console.log(`  credentials: Project URL ${SB_URL ? "set" : "missing"}, anon key ${SB_KEY ? "set" : "missing"}, team account ${signInModeOf(process.env).mode === "team" ? "set" : "missing"} (values not shown)`);
  console.log(`  clip: ${existsSync(args.clip) ? "found" : "MISSING"} (${args.clip || "no path given"})`);
  console.log(`  1. sign in as the team account`);
  console.log(`  2. create project ${name}`);
  console.log(`  3. set a ${plan.script.length}-line script and a ${plan.checklist.length}-item checklist (scripts/evidence-clip.json)`);
  console.log(`  4. upload the clip, start the analysis, print the worker dispatch word, wait up to ${WAIT_MIN} minutes`);
  console.log("  5. review every undecided item: confirm candidates that match their line (medium or high, current text),");
  console.log("     reject the rest and any stale evidence, acknowledge outside-proof proposals");
  console.log("  6. try the Final Seal; if uncovered checklist items block it, request a reshoot for each of them and try again");
  console.log("  7. print the project id, the report URL, and the seal id or the blockers");
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const plan = loadClipPlan();
  const name = rehearsalName();
  if (args.dryRun) {
    printPlan(args, plan, name);
    return;
  }

  if (!SB_URL || !SB_KEY) fail("PROD_SUPABASE_URL (https://<ref>.supabase.co) and PROD_SUPABASE_ANON_KEY must be set (values not shown)");
  const signIn = signInModeOf(process.env);
  if (signIn.mode !== "team") fail("team-account mode only: set both PROD_E2E_EMAIL and PROD_E2E_PASSWORD (values not shown)");
  if (!/\.(mp4|webm)$/i.test(args.clip) || !existsSync(args.clip)) fail("usage: pnpm tsx scripts/seal-rehearsal.ts <evidence clip .mp4> [--dry-run]");

  const auth = await fetch(`${SB_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: SB_KEY as string, "content-type": "application/json" },
    body: JSON.stringify({ email: signIn.email, password: signIn.password }),
  });
  const token: string | undefined = ((await auth.json().catch(() => null)) as Json)?.access_token;
  if (!auth.ok || !token) fail(`sign in as the team account (${auth.status})`);
  const t = token as string;
  console.log("PASS  signed in as the team account");

  const created = await api("POST", "/projects", t, { name });
  const pid: string | undefined = created.json?.project?.id;
  if (created.status !== 201 || !pid) fail(`create the project (${created.status})`);
  const P = `/projects/${encodeURIComponent(pid as string)}`;
  console.log(`PASS  created ${name}`);
  console.log(`      project id: ${pid}`);

  /** Every write goes through this: it re-reads the project and refuses any other name. */
  const guard = async () => {
    const got = await api("GET", P, t);
    if (got.status !== 200 || !isRehearsalName(got.json?.project?.name)) fail("the project is not a zz-seal-* project; stopping");
  };

  await guard();
  const script = await api("POST", `${P}/scripts`, t, { text: plan.script.join("\n") });
  const segments: SegmentLike[] = script.json?.scriptVersion?.segments ?? [];
  if (script.status !== 201) fail(`set the script (${script.status})`);
  const checklist = await api("POST", `${P}/checklist`, t, { items: plan.checklist.map((label) => ({ label })) });
  if (checklist.status !== 201) fail(`set the checklist (${checklist.status})`);
  console.log(`PASS  script ${segments.length} lines, checklist ${(checklist.json?.items ?? []).length} items`);

  await guard();
  const bytes = readFileSync(args.clip);
  const mimeType = args.clip.toLowerCase().endsWith(".webm") ? "video/webm" : "video/mp4";
  const durationMs = clipDurationMs(args.clip);
  const up = await api("POST", `${P}/assets/upload-url`, t, {
    fileName: `zz-seal-clip${mimeType === "video/webm" ? ".webm" : ".mp4"}`,
    mimeType,
    sizeBytes: statSync(args.clip).size,
    durationMs,
  });
  const uploadUrl: string | undefined = up.json?.uploadUrl;
  if (up.status !== 201 || !uploadUrl) fail(`upload URL (${up.status})`);
  const form = new FormData();
  form.append("cacheControl", "3600");
  form.append("", new Blob([new Uint8Array(bytes)], { type: mimeType }));
  const put = await fetch(uploadUrl as string, { method: "PUT", body: form });
  await put.arrayBuffer().catch(() => undefined);
  if (put.status < 200 || put.status >= 300) fail(`upload the clip (${put.status})`);
  console.log(`PASS  clip uploaded (${bytes.length} bytes, ${durationMs} ms)`);

  await guard();
  const start = await api("POST", `${P}/analysis`, t, {});
  const jobId: string | undefined = start.json?.job?.id;
  if (start.status !== 202 || !jobId) fail(`start the analysis (${start.status})`);
  console.log(`PASS  analysis queued, job id ${jobId}`);
  console.log(`      worker dispatch: ${start.headers.get("x-sleuth-worker-dispatch") ?? "no header"}`);
  console.log(`      waiting up to ${WAIT_MIN} minutes`);
  const deadline = Date.now() + WAIT_MIN * 60_000;
  let status = String(start.json?.job?.status);
  while (Date.now() < deadline && (status === "queued" || status === "running")) {
    await new Promise((r) => setTimeout(r, 15_000));
    const g = await api("GET", `${P}/jobs/${encodeURIComponent(jobId as string)}`, t);
    const next = String(g.json?.job?.status ?? "unknown");
    if (next !== status) console.log(`      job is ${next}`);
    status = next;
  }
  if (status !== "succeeded") fail(`the analysis did not succeed in time (${status})`);
  console.log("PASS  analysis succeeded");

  const ev = await api("GET", `${P}/evidence`, t);
  const evidence: EvidenceLike[] = ev.json?.evidence ?? [];
  const reviews = planReviews(evidence, segments);
  console.log(`      ${evidence.length} evidence items, ${reviews.length} to decide`);
  for (const r of reviews) {
    await guard();
    const res = await api("PATCH", `/evidence/${encodeURIComponent(r.evidenceId)}/review`, t, {
      decision: r.decision,
      note: `zz-seal rehearsal: ${r.reason}`,
    });
    console.log(`${res.status === 200 ? "PASS" : "FAIL"}  line ${r.line ?? "?"}: ${r.decision} (${r.reason}) ${res.status}`);
  }

  const trySeal = async () => {
    await guard();
    return api("POST", `${P}/seal`, t, { note: "zz-seal rehearsal: reviewed by the team account" });
  };
  let seal = await trySeal();
  if (seal.status !== 201) {
    const blockers: string[] = seal.json?.error?.details?.blockers ?? [];
    const cov = await api("GET", `${P}/coverage`, t);
    const toReshoot = planReshoots(blockers, cov.json?.coverage?.items ?? []);
    for (const checklistItemId of toReshoot) {
      await guard();
      const rs = await api("POST", `${P}/reshoots`, t, {
        note: "zz-seal rehearsal: the clip does not show this step; film it",
        checklistItemId,
      });
      console.log(`${rs.status === 201 ? "PASS" : "FAIL"}  reshoot requested for an uncovered checklist item ${rs.status}`);
    }
    if (toReshoot.length > 0) seal = await trySeal();
  }

  console.log(`      report: ${SITE}/projects/${encodeURIComponent(pid as string)}/report`);
  if (seal.status === 201) {
    console.log(`PASS  SEALED, seal id ${seal.json?.seal?.id}`);
  } else {
    const blockers: string[] = seal.json?.error?.details?.blockers ?? [];
    console.log(`FAIL  not sealed (${seal.status}), blockers: ${blockers.join(", ") || "none given"}`);
    process.exitCode = 1;
  }
  console.log(`      delete it afterwards: docs/deploy-plan.md, "Seal rehearsal" (project id ${pid})`);
}

// Run only as a script, so the unit test can import the decision logic without any network call.
if (process.argv[1] && /seal-rehearsal\.ts$/.test(process.argv[1])) {
  main().catch((e: unknown) => {
    // An error message can hold a URL or a token, so only the error name is printed.
    console.log(`FAIL  script error (${e instanceof Error ? e.name : "unknown"})`);
    process.exit(1);
  });
}
