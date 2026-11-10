/**
 * Production smoke test (deploy-plan section 5). Prints PASS or FAIL per check, project ids it
 * made, and nothing else. It never prints a token, a key, a URL with a token or any file content.
 *
 * Part A needs nothing and tests a signed-out visitor:
 *   pnpm tsx scripts/prod-smoke.ts
 * Part B signs in two anonymous users and needs the public Project URL and anon key. Set them in
 * your own shell first (they are public by design, but keep them out of files and chat):
 *   $env:PROD_SUPABASE_URL = Read-Host "Production Project URL"
 *   $env:PROD_SUPABASE_ANON_KEY = Read-Host "Production anon key"
 *   pnpm tsx scripts/prod-smoke.ts
 *   Remove-Item Env:PROD_SUPABASE_URL, Env:PROD_SUPABASE_ANON_KEY
 *
 * It does not load `.env.local`, so it can never hit the dev project by mistake. Test projects
 * are named `zz-test-<random>`. The API has no delete route, so remove them with the SQL in
 * the deploy plan afterwards. It starts no analysis job and sends nothing to Deepgram or Gemini.
 */
const SITE = (process.env.PROD_SITE_URL ?? "https://sleuth-eight.vercel.app").replace(/\/$/, "");
const RAW_SB_URL = process.env.PROD_SUPABASE_URL?.trim().replace(/\/$/, "");
/** A Project URL is `https://<ref>.supabase.co`. Anything else is refused and never printed. */
const URL_OK = RAW_SB_URL === undefined || /^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(RAW_SB_URL);
const SB_URL = URL_OK ? RAW_SB_URL : undefined;
const SB_KEY = process.env.PROD_SUPABASE_ANON_KEY?.trim();
const DEMO = "proofpay-demo";
const MB = 1024 * 1024;

type Json = Record<string, any> | null; // eslint-disable-line @typescript-eslint/no-explicit-any
let failed = 0;
function check(name: string, ok: boolean, detail = ""): void {
  if (!ok) failed += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` (${detail})` : ""}`);
}

async function api(
  method: string,
  path: string,
  opts: { token?: string; body?: unknown; headers?: Record<string, string> } = {},
): Promise<{ status: number; json: Json }> {
  const res = await fetch(`${SITE}/api/v1${path}`, {
    method,
    headers: {
      ...(opts.body ? { "content-type": "application/json" } : {}),
      ...(opts.token ? { authorization: `Bearer ${opts.token}` } : {}),
      ...opts.headers,
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const json = (await res.json().catch(() => null)) as Json;
  return { status: res.status, json };
}

async function anonymousUser(): Promise<{ token: string; id: string }> {
  const res = await fetch(`${SB_URL}/auth/v1/signup`, {
    method: "POST",
    headers: { apikey: SB_KEY!, "content-type": "application/json" },
    body: JSON.stringify({ data: {} }),
  });
  const json = (await res.json().catch(() => null)) as Json;
  if (!res.ok || !json?.access_token) throw new Error(`anonymous sign-in refused: ${res.status}`);
  return { token: json.access_token, id: json.user.id };
}

/** Send bytes to a signed upload URL. Returns the HTTP status only. */
async function putFile(uploadUrl: string, bytes: Uint8Array, type: string): Promise<number> {
  const form = new FormData();
  form.append("cacheControl", "3600");
  form.append("", new Blob([new Uint8Array(bytes)], { type }));
  const res = await fetch(uploadUrl, { method: "PUT", body: form });
  await res.arrayBuffer().catch(() => undefined);
  return res.status;
}

async function visitorPart(): Promise<void> {
  console.log("--- Part A: signed-out visitor ---");
  const list = await api("GET", "/projects");
  const ids = (list.json?.projects ?? []).map((p: { id: string }) => p.id);
  check(
    "visitor list holds only the demo",
    list.status === 200 && ids.length === 1 && ids[0] === DEMO,
  );
  for (const part of ["", "/evidence", "/findings", "/coverage", "/report.csv"]) {
    const r = await api("GET", `/projects/${DEMO}${part}`);
    check(`visitor reads demo${part || " project"}`, r.status === 200, String(r.status));
  }
  const missing = await api("GET", "/projects/zz-test-does-not-exist");
  check("unknown project is 404", missing.status === 404, String(missing.status));
  const create = await api("POST", "/projects", { body: { name: "zz-test-visitor" } });
  check("visitor cannot create a project", create.status === 401, String(create.status));
  const forged = await api("POST", "/projects", {
    body: { name: "zz-test-forged" },
    headers: { "x-fixture-user": "zz-test-forged" },
  });
  check("forged x-fixture-user header is ignored", forged.status === 401, String(forged.status));
  const fakeBearer = await api("POST", "/projects", {
    token: "forged.token.value",
    body: { name: "zz-test-forged" },
  });
  check("forged bearer token is refused", fakeBearer.status === 401, String(fakeBearer.status));
  for (const [path, body] of [
    [`/projects/${DEMO}/scripts`, { text: "zz-test line" }],
    [`/projects/${DEMO}/analysis`, {}],
    [`/projects/${DEMO}/seal`, {}],
    [
      `/projects/${DEMO}/assets/upload-url`,
      { fileName: "a.webm", mimeType: "video/webm", sizeBytes: 1000, durationMs: 1000 },
    ],
  ] as const) {
    const r = await api("POST", path, { body });
    check(
      `visitor cannot write ${path.split("/").slice(3).join("/")}`,
      r.status === 401 || r.status === 403,
      String(r.status),
    );
  }
}

async function userPart(): Promise<void> {
  console.log("--- Part B: two anonymous users ---");
  const a = await anonymousUser();
  const b = await anonymousUser();
  check("two different anonymous users", a.id !== b.id);

  const name = `zz-test-${Math.random().toString(36).slice(2, 8)}`;
  const created = await api("POST", "/projects", { token: a.token, body: { name } });
  const pid: string | undefined = created.json?.project?.id;
  check("user A creates a project", created.status < 300 && !!pid, String(created.status));
  if (!pid) return;
  console.log(`      test project id: ${pid}  (name ${name})`);

  const own = await api("GET", `/projects/${pid}`, { token: a.token });
  check("user A reads own project", own.status === 200, String(own.status));
  const other = await api("GET", `/projects/${pid}`, { token: b.token });
  check("user B cannot read A's project (404)", other.status === 404, String(other.status));
  const otherList = await api("GET", "/projects", { token: b.token });
  check(
    "user B's list hides A's project",
    !(otherList.json?.projects ?? []).some((p: { id: string }) => p.id === pid),
  );
  const visitor = await api("GET", `/projects/${pid}`);
  check(
    "signed-out visitor cannot read A's project (404)",
    visitor.status === 404,
    String(visitor.status),
  );
  const bWrite = await api("POST", `/projects/${pid}/scripts`, {
    token: b.token,
    body: { text: "zz-test" },
  });
  check(
    "user B cannot write to A's project",
    bWrite.status === 403 || bWrite.status === 404,
    String(bWrite.status),
  );

  const request = (mimeType: string, durationMs = 1000, sizeBytes = 4096) =>
    api("POST", `/projects/${pid}/assets/upload-url`, {
      token: a.token,
      body: { fileName: "zz-test.webm", mimeType, durationMs, sizeBytes },
    });

  const ok = await request("video/webm");
  check("signed upload URL issued", ok.status === 200 && !!ok.json?.uploadUrl, String(ok.status));
  if (ok.json?.uploadUrl) {
    const url = String(ok.json.uploadUrl);
    check("upload URL holds no service-role key", !/service_role|sb_secret_/.test(url));
    const path = String(ok.json.assetVersion?.storagePath ?? "");
    check("storage path has no file name", path !== "" && !path.includes("zz-test"));
    const ttl = Date.parse(String(ok.json.expiresAt)) - Date.now();
    check(
      "API reports at most 5 minutes",
      ttl > 0 && ttl <= 5 * 60_000 + 5_000,
      `${Math.round(ttl / 1000)} s`,
    );
    const status = await putFile(url, new Uint8Array(4096).fill(7), "video/webm");
    check("4 KB test file uploads", status >= 200 && status < 300, String(status));
  }

  const txtApi = await request("text/plain");
  check("API refuses mimeType text/plain", txtApi.status === 400, String(txtApi.status));

  const txtBucket = await request("video/webm");
  if (txtBucket.json?.uploadUrl) {
    const status = await putFile(
      txtBucket.json.uploadUrl,
      new TextEncoder().encode("hello"),
      "text/plain",
    );
    check("bucket refuses a .txt body", status >= 400, String(status));
  }

  const big = await request("video/webm");
  if (big.json?.uploadUrl) {
    const status = await putFile(big.json.uploadUrl, new Uint8Array(51 * MB), "video/webm");
    check("bucket refuses a 51 MB file", status >= 400, String(status));
  }

  const oversize = await request("video/webm", 1000, 51 * MB);
  check("API refuses a 51 MB size claim", oversize.status === 400, String(oversize.status));
  const noSize = await api("POST", `/projects/${pid}/assets/upload-url`, {
    token: a.token,
    body: { fileName: "zz-test.webm", mimeType: "video/webm", durationMs: 1000 },
  });
  check("API refuses a request with no size", noSize.status === 400, String(noSize.status));

  const longVideo = await request("video/webm", 180_001);
  check("API refuses a video over 180 s", longVideo.status === 400, String(longVideo.status));
  console.log(
    "Cleanup: remove rows named zz-test-% with the SQL in docs/deploy-plan.md section 7.",
  );
}

async function main(): Promise<void> {
  await visitorPart();
  if (!URL_OK) {
    check("PROD_SUPABASE_URL looks like https://<ref>.supabase.co (value not shown)", false);
  } else if (SB_URL && SB_KEY) await userPart();
  else
    console.log("--- Part B skipped: PROD_SUPABASE_URL and PROD_SUPABASE_ANON_KEY are not set ---");
  console.log(failed === 0 ? "ALL CHECKS PASSED" : `${failed} CHECK(S) FAILED`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e: unknown) => {
  // The message of a network error can hold the URL or a token, so only the error name is printed.
  console.log("FAIL  script error: " + (e instanceof Error ? e.name : "unknown"));
  process.exit(1);
});
