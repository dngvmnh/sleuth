import { createServerClient, parseCookieHeader } from "@supabase/ssr";

/**
 * Finds the signed-in user of a request, or null. Only the Supabase Auth server can say who a
 * caller is: a header or cookie that merely names a user id proves nothing.
 */
export type SessionVerifier = (req: Request) => Promise<string | null>;

export interface SupabaseAuthConfig {
  /** NEXT_PUBLIC_SUPABASE_URL */
  url: string;
  /** NEXT_PUBLIC_SUPABASE_ANON_KEY. Public by design; the service-role key is never used here. */
  anonKey: string;
}

export function authConfigFromEnv(env: NodeJS.ProcessEnv = process.env): SupabaseAuthConfig | null {
  const url = env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  return url && anonKey ? { url, anonKey } : null;
}

/**
 * Verify the session with `auth.getUser()`, which asks the Auth server (it does not trust the
 * cookie's own claims). Reads the `@supabase/ssr` session cookies, or an `Authorization: Bearer`
 * access token for API clients. Route handlers here only read the session; refreshed cookies are
 * written by the browser client, so `setAll` does nothing.
 */
export function createSupabaseSessionVerifier(config: SupabaseAuthConfig): SessionVerifier {
  return async (req) => {
    const bearer = /^Bearer\s+(\S+)$/i.exec(req.headers.get("authorization") ?? "")?.[1];
    const cookies = parseCookieHeader(req.headers.get("cookie") ?? "").map((c) => ({
      name: c.name,
      value: c.value ?? "",
    }));
    if (!bearer && cookies.length === 0) return null;
    const client = createServerClient(config.url, config.anonKey, {
      cookies: { getAll: () => cookies, setAll: () => {} },
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    try {
      const { data, error } = bearer
        ? await client.auth.getUser(bearer)
        : await client.auth.getUser();
      if (error || !data.user) return null;
      return data.user.id;
    } catch {
      // An unreachable Auth server must never turn into "signed in".
      return null;
    }
  };
}
