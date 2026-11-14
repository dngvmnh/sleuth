/**
 * First real job on production (brief 004, step 3). One user runs the whole path through the
 * public API: create, script, checklist, upload our own clip, analyse, review, edit one sentence,
 * seal, export. Prints PASS, FAIL or SKIP per step, counts and ids only. It never prints a token,
 * a key, a URL, an email, transcript text or evidence text.
 *
 * How to run (your own shell; the script never loads `.env.local`, so it cannot hit dev by mistake):
 *
 *   Guest mode (anonymous sign-in; the worker runs it speech only, decision D-4):
 *     $env:PROD_SUPABASE_URL = Read-Host "Production Project URL"
 *     $env:PROD_SUPABASE_ANON_KEY = Read-Host "Production anon key"
 *     pnpm tsx scripts/prod-e2e.ts <path to our own clip.mp4>
 *     Remove-Item Env:PROD_SUPABASE_URL, Env:PROD_SUPABASE_ANON_KEY
 *
 *   Team-account mode (a real Supabase Auth user; frames go to Gemini only if its user id is in
 *   the VIDEO_ANALYSIS_OWNER_IDS repository variable). Set the two above, plus:
 *     $env:PROD_E2E_EMAIL = Read-Host "Team account email"
 *     $sec = Read-Host "Team account password" -AsSecureString
 *     $env:PROD_E2E_PASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec))
 *     pnpm tsx scripts/prod-e2e.ts <path to our own clip.mp4>
 *     Remove-Item Env:PROD_E2E_EMAIL, Env:PROD_E2E_PASSWORD
 *   Both must be set, or neither. The email is never printed.
 *
 *   After the job: "speech-only findings: n of total" shows which mode really ran.
 *
 * The clip must be our own footage. Guest mode: scripts/make-check-clip.ps1. Team-account run (steps 7 and 8 need real evidence):`n * scripts/make-evidence-clip.ps1, whose script and checklist are in scripts/evidence-clip.json. The worker is NOT
 * started here: after "analysis queued" the script waits (default 10 minutes, PROD_E2E_WAIT_MIN
 * up to 30) while you run the read-only queue check and start the worker workflow by hand.
 * It makes one project named zz-test-e2e-<random>; delete it afterwards by the printed id.
 *
 * Queue check before the worker runs (Supabase, sleuth-prod, SQL Editor; read-only). Start the
 * worker only when the one row is this script's project and it has queued = 1, running = 0,
 * because the worker workflow sends frames to Gemini (decision D-4: never a visitor's video).
 *
 *   select j.project_id, p.name, p.owner_id,
 *          count(*) filter (where j.status = 'queued')  as queued,
 *          count(*) filter (where j.status = 'running') as running
 *   from processing_jobs j join projects p on p.id = j.project_id
 *   where j.status in ('queued', 'running')
 *   group by j.project_id, p.name, p.owner_id;
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";

const SITE = (process.env.PROD_SITE_URL ?? "https://sleuth-eight.vercel.app").replace(/\/$/, "");
const RAW_SB_URL = process.env.PROD_SUPABASE_URL?.trim().replace(/\/$/, "");
const SB_URL =
  RAW_SB_URL && /^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(RAW_SB_URL) ? RAW_SB_URL : undefined;
const SB_KEY = process.env.PROD_SUPABASE_ANON_KEY?.trim();
const CLIP = process.argv[2] ?? "";
const WAIT_MIN = Math.min(30, Math.max(1, Number(process.env.PROD_E2E_WAIT_MIN ?? 10) || 10));

// The clip from scripts/make-check-clip.ps1 says: "Open the project and click Export report.
// The report downloads as a CSV file." The script and checklist follow it.
const SCRIPT_V1 = [
  "Open the project.",
  "Click Export report.",
  "The report downloads as a CSV file.",
];
/** A real change of meaning for each line, used when that line is the one edited in step 8. */
const REWORDED = [
  "Open the settings page.",
  "Click the Export report button.",
  "The report downloads as a PDF file.",
];
const CHECKLIST = ["Export the report", "Show the CSV download"];

type Json = Record<string, any> | null; // eslint-disable-line @typescript-eslint/no-explicit-any

/** The text the worker puts in every finding's limits on a speech-only run (evidence-engine). */
export const SPEECH_ONLY_MARK = "Checked by speech only";

export type SignInMode =
  | { mode: "guest" }
  | { mode: "team"; email: string; password: string }
  | { mode: "error"; message: string };

/** Guest unless both PROD_E2E_EMAIL and PROD_E2E_PASSWORD are set. One alone is an error. */
export function signInModeOf(env: Record<string, string | undefined>): SignInMode {
  const email = env.PROD_E2E_EMAIL?.trim() ?? "";
  const password = env.PROD_E2E_PASSWORD ?? "";
  if (email === "" && password === "") return { mode: "guest" };
  if (email === "" || password === "") {
    return {
      mode: "error",
      message:
        "set both PROD_E2E_EMAIL and PROD_E2E_PASSWORD for the team account, or neither for a guest",
    };
  }
  return { mode: "team", email, password };
}

/** "n of total" findings whose limits say the run was speech only. */
export function speechOnlyCount(findings: { limits?: unknown }[]): string {
  const n = findings.filter(
    (f) => typeof f.limits === "string" && f.limits.includes(SPEECH_ONLY_MARK),
  ).length;
  return `${n} of ${findings.length}`;
}
let failed = 0;
let firstFailure: string | null = null;
function check(step: string, ok: boolean, detail = ""): boolean {
  if (!ok) {
    failed += 1;
    firstFailure ??= step;
  }
  console.log(`${ok ? "PASS" : "FAIL"}  ${step}${detail ? ` (${detail})` : ""}`);
  return ok;
}
let skipped = 0;
function skip(step: string, why: string): void {
  skipped += 1;
  console.log(`SKIP  ${step} (${why})`);
}
function counts<T>(items: T[], key: (t: T) => string): string {
  const by: Record<string, number> = {};
  for (const i of items) by[key(i)] = (by[key(i)] ?? 0) + 1;
  return Object.entries(by)
    .sort()
    .map(([k, n]) => `${k} ${n}`)
    .join(", ");
}

async function api(
  method: string,
  path: string,
  token: string,
  body?: unknown,
): Promise<{ status: number; json: Json; text: string; headers: Headers }> {
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
  return { status: res.status, json, text, headers: res.headers };
}

/** The clip's length in ms, read with ffprobe (installed with FFmpeg). */
function clipDurationMs(path: string): number {
  const out = execFileSync(
    "ffprobe",
    ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path],
    { encoding: "utf8" },
  );
  return Math.round(Number(out.trim()) * 1000);
}

async function main(): Promise<void> {
  if (!SB_URL || !SB_KEY) {
    console.log(
      "FAIL  PROD_SUPABASE_URL (https://<ref>.supabase.co) and PROD_SUPABASE_ANON_KEY must be set (values not shown)",
    );
    process.exit(1);
  }
  if (!/\.(mp4|webm)$/i.test(CLIP) || !existsSync(CLIP)) {
    console.log("FAIL  usage: pnpm tsx scripts/prod-e2e.ts <path to our own .mp4 or .webm clip>");
    process.exit(1);
  }

  // Step 1: sign in, as a guest or as the team account.
  const signIn = signInModeOf(process.env);
  if (signIn.mode === "error") {
    check("1 sign in", false, signIn.message);
    return;
  }
  const signup =
    signIn.mode === "team"
      ? await fetch(`${SB_URL}/auth/v1/token?grant_type=password`, {
          method: "POST",
          headers: { apikey: SB_KEY, "content-type": "application/json" },
          body: JSON.stringify({ email: signIn.email, password: signIn.password }),
        })
      : await fetch(`${SB_URL}/auth/v1/signup`, {
          method: "POST",
          headers: { apikey: SB_KEY, "content-type": "application/json" },
          body: JSON.stringify({ data: {} }),
        });
  const session = (await signup.json().catch(() => null)) as Json;
  const token: string | undefined = session?.access_token;
  const stepOne =
    signIn.mode === "team" ? "1 signed in as the team account" : "1 sign in anonymously";
  if (!check(stepOne, signup.ok && !!token, String(signup.status))) return;
  const t = token as string;

  // Step 2: create a project.
  const name = `zz-test-e2e-${Math.random().toString(36).slice(2, 8)}`;
  const created = await api("POST", "/projects", t, { name });
  const pid: string | undefined = created.json?.project?.id;
  if (!check("2 create a project", created.status === 201 && !!pid, String(created.status))) return;
  console.log(`      test project id: ${pid}  (name ${name}; delete this one row by id)`);
  const P = `/projects/${encodeURIComponent(pid as string)}`;

  // Step 3: script (3 lines) and checklist (2 items).
  const script = await api("POST", `${P}/scripts`, t, { text: SCRIPT_V1.join("\n") });
  const segments: { id: string; index: number }[] = script.json?.scriptVersion?.segments ?? [];
  check(
    "3a set a 3-line script",
    script.status === 201 && segments.length === 3,
    `${segments.length} lines`,
  );
  const checklist = await api("POST", `${P}/checklist`, t, {
    items: CHECKLIST.map((label) => ({ label })),
  });
  check(
    "3b set a 2-item checklist",
    checklist.status === 201 && (checklist.json?.items ?? []).length === 2,
    String(checklist.status),
  );

  // Step 4: upload our own clip through the signed URL.
  const bytes = readFileSync(CLIP);
  const mimeType = CLIP.toLowerCase().endsWith(".webm") ? "video/webm" : "video/mp4";
  const durationMs = clipDurationMs(CLIP);
  const up = await api("POST", `${P}/assets/upload-url`, t, {
    fileName: "zz-test-clip" + (mimeType === "video/webm" ? ".webm" : ".mp4"),
    mimeType,
    sizeBytes: statSync(CLIP).size,
    durationMs,
  });
  const uploadUrl: string | undefined = up.json?.uploadUrl;
  const assetVersionId: string | undefined = up.json?.assetVersion?.id;
  if (!check("4a upload URL issued", up.status === 201 && !!uploadUrl, String(up.status))) return;
  const form = new FormData();
  form.append("cacheControl", "3600");
  form.append("", new Blob([new Uint8Array(bytes)], { type: mimeType }));
  const put = await fetch(uploadUrl as string, { method: "PUT", body: form });
  await put.arrayBuffer().catch(() => undefined);
  if (
    !check(
      "4b our clip uploaded to storage",
      put.status >= 200 && put.status < 300,
      `${put.status}, ${bytes.length} bytes, ${durationMs} ms`,
    )
  )
    return;
  console.log(`      asset version id: ${assetVersionId}`);

  // Step 5: start analysis and wait for the worker.
  const start = await api("POST", `${P}/analysis`, t, {});
  const jobId: string | undefined = start.json?.job?.id;
  if (!check("5a analysis queued", start.status === 202 && !!jobId, String(start.status))) return;
  console.log(`      job id: ${jobId}`);
  // The server says whether it started the worker (ADR 0009 amendment). "sent" means a
  // workflow_dispatch run of worker.yml should appear within about a minute: do not start one.
  const dispatch = start.headers.get("x-sleuth-worker-dispatch");
  console.log(
    `      worker dispatch: ${dispatch ?? "no header (this deploy is older than the dispatch check)"}`,
  );
  console.log(
    `      Now run the read-only queue check, then start the worker. Waiting up to ${WAIT_MIN} minutes.`,
  );
  const deadline = Date.now() + WAIT_MIN * 60_000;
  let job: Json = start.json?.job ?? null;
  let lastStatus = String(job?.status);
  while (Date.now() < deadline && job && (job.status === "queued" || job.status === "running")) {
    await new Promise((r) => setTimeout(r, 15_000));
    const g = await api("GET", `${P}/jobs/${encodeURIComponent(jobId as string)}`, t);
    if (g.status !== 200) {
      job = null;
      break;
    }
    job = g.json?.job ?? null;
    if (String(job?.status) !== lastStatus) {
      lastStatus = String(job?.status);
      console.log(`      job is ${lastStatus} (attempts ${job?.attempts ?? "?"})`);
    }
  }
  const status = String(job?.status ?? "unknown");
  // The job error is a short code from the worker (it never holds content), so it is safe to show.
  const errorCode = typeof job?.error === "string" ? job.error.split(":")[0]?.slice(0, 60) : "";
  if (
    !check(
      "5b the job succeeded",
      status === "succeeded",
      status === "failed" ? `failed: ${errorCode}` : status,
    )
  ) {
    skip("6 to 10", "need a finished analysis");
    return;
  }

  // Step 6: evidence and findings, counts by type.
  const ev1 = await api("GET", `${P}/evidence`, t);
  const fi1 = await api("GET", `${P}/findings`, t);
  const evidence: { id: string; status: string; scriptSegmentId: string }[] =
    ev1.json?.evidence ?? [];
  const findings: { id: string; type: string; status: string; evidenceId?: string | null }[] =
    fi1.json?.findings ?? [];
  check(
    "6 list evidence and findings",
    ev1.status === 200 && fi1.status === 200,
    `evidence: ${evidence.length} (${counts(evidence, (e) => e.status) || "none"}); findings: ${findings.length} (${counts(findings, (f) => f.type) || "none"})`,
  );
  // Which mode really ran: every finding of a speech-only run carries the mark (D-4).
  console.log(`      speech-only findings: ${speechOnlyCount(fi1.json?.findings ?? [])}`);

  // Step 7: resolve one finding through the review call.
  const target = findings.find(
    (f) =>
      f.status === "open" &&
      f.evidenceId &&
      evidence.some((e) => e.id === f.evidenceId && e.status === "candidate"),
  );
  if (!target) {
    skip("7 resolve one finding", "no open finding tied to undecided evidence");
  } else {
    // A person decides here, through the same review call the UI uses.
    const rv = await api(
      "PATCH",
      `/evidence/${encodeURIComponent(target.evidenceId as string)}/review`,
      t,
      {
        decision: "confirm",
        note: "zz-test e2e review",
      },
    );
    const fi2 = await api("GET", `${P}/findings`, t);
    const now = (fi2.json?.findings ?? []).find((f: { id: string }) => f.id === target.id);
    check(
      "7 resolve one finding through the review call",
      rv.status === 200 && now?.status === "resolved",
      `review ${rv.status}, ${target.type} is ${now?.status ?? "missing"}`,
    );
  }

  // Step 8: change one sentence; only evidence tied to it may go stale.
  const before = (await api("GET", `${P}/evidence`, t)).json?.evidence ?? [];
  // Edit a line that has live evidence, so the check means something; else the middle line.
  const withEvidence = segments.find((s) =>
    before.some(
      (e: { scriptSegmentId: string; status: string }) =>
        e.scriptSegmentId === s.id && e.status !== "rejected" && e.status !== "stale",
    ),
  );
  const editIndex = withEvidence?.index ?? 1;
  const v2 = SCRIPT_V1.map((line, i) => (i === editIndex ? REWORDED[i] : line));
  const edit = await api("POST", `${P}/scripts`, t, { text: v2.join("\n") });
  const modified: string[] = edit.json?.diff?.modified ?? [];
  const after: { id: string; status: string; scriptSegmentId: string }[] =
    (await api("GET", `${P}/evidence`, t)).json?.evidence ?? [];
  const changed = after.filter((e) => {
    const old = before.find((b: { id: string }) => b.id === e.id);
    return old && old.status !== e.status;
  });
  const onlyEdited = changed.every(
    (e) => modified.includes(e.scriptSegmentId) && e.status === "stale",
  );
  const edited = segments.find((s) => s.index === editIndex)?.id;
  // Every live item on the edited line must now be stale. Rejected evidence stays rejected.
  const onLine = before.filter(
    (e: { scriptSegmentId: string; status: string }) =>
      e.scriptSegmentId === edited && e.status !== "rejected" && e.status !== "stale",
  );
  const allStale = onLine.every(
    (e: { id: string }) => after.find((a) => a.id === e.id)?.status === "stale",
  );
  check(
    "8 editing one sentence stales only its own evidence",
    edit.status === 201 &&
      modified.length === 1 &&
      modified[0] === edited &&
      onlyEdited &&
      allStale,
    `modified lines ${modified.length}, live evidence on that line ${onLine.length}, evidence changed ${changed.length}, all on the edited line: ${onlyEdited}`,
  );
  if (onLine.length === 0) {
    console.log(
      "      note: the edited line had no evidence, so step 8 proves only that nothing else changed",
    );
  }

  // Step 9: try the Final Seal.
  const seal = await api("POST", `${P}/seal`, t, { note: "zz-test e2e" });
  if (seal.status === 201) {
    check("9 Final Seal", true, `sealed, seal id ${seal.json?.seal?.id}`);
  } else {
    const blockers: string[] = seal.json?.error?.details?.blockers ?? [];
    check(
      "9 Final Seal answers with the seal or its blockers",
      seal.status === 409 && blockers.length > 0,
      `${seal.status}, blockers: ${blockers.join(", ") || "none"}`,
    );
  }

  // Step 10: export report.csv.
  const csv = await api("GET", `${P}/report.csv`, t);
  const rows = csv.text.split(/\r?\n/).filter((l) => l.trim() !== "").length;
  check(
    "10 export report.csv",
    csv.status === 200 && rows > 1,
    `${rows} rows including the header`,
  );
}

// Run only as a script, so the unit test can import the helpers without any network call.
if (process.argv[1] && /prod-e2e\.ts$/.test(process.argv[1])) runAsScript();

function runAsScript(): void {
  main()
    .catch((e: unknown) => {
      // An error message can hold a URL or a token, so only the error name is printed.
      check("script error", false, e instanceof Error ? e.name : "unknown");
    })
    .finally(() => {
      // A skipped step is not a pass: say so in the last line.
      console.log(
        failed > 0
          ? `${failed} STEP(S) FAILED. Earliest: ${firstFailure}`
          : skipped > 0
            ? `NO FAILURES, BUT ${skipped} STEP(S) SKIPPED: not all steps are proven`
            : "ALL STEPS PASSED",
      );
      process.exit(failed === 0 ? 0 : 1);
    });
}
