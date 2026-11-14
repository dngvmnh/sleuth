import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// Static checks of scripts/final-prod-check.ps1. CI runs on Linux without Windows PowerShell, so
// these read the script instead of running it; the safety rules are about what it does with input.

const ps1 = readFileSync(fileURLToPath(new URL("final-prod-check.ps1", import.meta.url)), "utf8");
const code = ps1
  .split("\n")
  .filter((l) => !l.trim().startsWith("#"))
  .join("\n");

describe("scripts/final-prod-check.ps1", () => {
  it("takes the documented parameters", () => {
    for (const p of ["$SiteUrl", "$ProjectUrl", "$PublishableKey", "$Clip", "[switch]$SmokeOnly"]) {
      expect(ps1).toContain(p);
    }
    expect(ps1).toMatch(/\$SiteUrl = "https:\/\/sleuth-eight\.vercel\.app"/);
  });

  it("never reads .env.local, so it cannot reach the dev project", () => {
    expect(code).not.toMatch(/\.env/);
    expect(code).not.toMatch(/loadEnvFile|Get-Content/);
  });

  it("checks the Project URL shape and says so without printing the value", () => {
    expect(code).toContain("'^https://[a-z0-9-]+\\.supabase\\.co$'");
    expect(code).toMatch(/value not shown/);
  });

  it("asks for the password as a secure string and frees it", () => {
    expect(code).toMatch(/Read-Host "Team account password" -AsSecureString/);
    expect(code).toContain("ZeroFreeBSTR");
    expect(code).not.toMatch(/Write-Host[^\n]*\$(email|secure|bstr|PublishableKey|ProjectUrl)\b/i);
    expect(code).not.toMatch(/Start-Transcript|Out-File|Set-Content|Add-Content/);
  });

  it("removes every variable it sets in a finally block", () => {
    const sets = [...code.matchAll(/Set-ShellVar "([A-Z_0-9]+)"/g)].map((m) => m[1]);
    expect(sets).toEqual(
      expect.arrayContaining([
        "PROD_SITE_URL",
        "PROD_SUPABASE_URL",
        "PROD_SUPABASE_ANON_KEY",
        "PROD_E2E_EMAIL",
        "PROD_E2E_PASSWORD",
      ]),
    );
    // Env vars are set only through Set-ShellVar, which records them for the cleanup.
    expect(code.match(/\$env:[A-Z_]+\s*=/g) ?? []).toEqual([]);
    expect(code).toMatch(
      /finally \{\s*foreach \(\$name in \$set\) \{ Remove-Item -Path "Env:\$name"/,
    );
  });

  it("tells the operator to run the queue check before a manual worker start", () => {
    expect(code).toMatch(/worker dispatch:/);
    expect(code).toMatch(/\$word -ne "sent"/);
    expect(code).toMatch(/queue check[\s\S]*gh workflow run worker\.yml --repo dngvmnh\/sleuth/);
  });

  it("ends with the ids, the select-first SQL and the Storage folders", () => {
    expect(code).toMatch(/select id, name, owner_id, created_at from projects where id in/);
    expect(code).toMatch(/delete from projects where id in \(\$list\) and not is_demo/);
    expect(code).toMatch(/Storage, Buckets, video-assets/);
  });
});
