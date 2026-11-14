/**
 * Server only: which sign-in the browser should use, read from the server's environment at
 * request time. The mode follows `SLEUTH_DATA_MODE` with the same rule as the API
 * (`app/api/_lib/data-source.ts`, `dataMode()`): only "supabase" means Supabase. Having a URL or
 * a key set never switches the mode on its own.
 *
 * Only the two public values go to the browser. Both are public by design (ADR 0006); the
 * service-role key, DATABASE_URL and provider keys are never read here.
 */
export type ClientAuthConfig =
  | { mode: "fixture" }
  | { mode: "supabase"; url: string | null; anonKey: string | null };

export function clientAuthConfigFromEnv(
  env: Readonly<Record<string, string | undefined>> = process.env,
): ClientAuthConfig {
  if (env.SLEUTH_DATA_MODE !== "supabase") return { mode: "fixture" };
  const url = env.NEXT_PUBLIC_SUPABASE_URL?.trim() || null;
  const anonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() || null;
  return { mode: "supabase", url, anonKey };
}
