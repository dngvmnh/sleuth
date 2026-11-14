"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { createApiClient, type ApiClient } from "@/lib/api-client";
import type { ClientAuthConfig } from "@/lib/auth-config";
import { createFixtureGuestAuth, type GuestAuth } from "@/lib/guest-auth";
import { createBrowserGuestAuth } from "@/lib/supabase-browser";

interface GuestAuthContextValue {
  auth: GuestAuth;
  client: ApiClient;
}

// Without a provider (unit tests, isolated components): fixture behaviour, no Supabase.
const fallback: GuestAuthContextValue = { auth: createFixtureGuestAuth(), client: createApiClient() };
const GuestAuthContext = createContext<GuestAuthContextValue>(fallback);

/**
 * One guest sign-in and one API client for every page in the workspace, so the dashboard and
 * "Make an editable copy" share the same session and the same in-flight sign-in.
 * `config` comes from the server (`clientAuthConfigFromEnv`); tests may pass `auth` directly.
 */
export function GuestAuthProvider({
  config,
  auth: given,
  children,
}: {
  config: ClientAuthConfig;
  auth?: GuestAuth;
  children: ReactNode;
}) {
  const [value] = useState<GuestAuthContextValue>(() => {
    const auth = given ?? createBrowserGuestAuth(config);
    const client =
      auth.mode === "supabase" ? createApiClient({ beforeRequest: () => auth.prepareRequest() }) : createApiClient();
    return { auth, client };
  });
  return <GuestAuthContext.Provider value={value}>{children}</GuestAuthContext.Provider>;
}

export function useGuestAuth(): GuestAuth {
  return useContext(GuestAuthContext).auth;
}

export function useApiClient(): ApiClient {
  return useContext(GuestAuthContext).client;
}

/** Shown next to the write buttons in Supabase mode. Promises nothing it cannot keep. */
export function GuestSessionNote({ className, auth: given }: { className?: string; auth?: GuestAuth }) {
  const shared = useGuestAuth();
  const auth = given ?? shared;
  if (auth.mode !== "supabase") return null;
  return (
    <p className={`text-xs text-muted ${className ?? ""}`}>
      Your projects use a guest session in this browser only. If you clear this browser&apos;s data, the session
      and its projects cannot be recovered.
    </p>
  );
}
