import { describe, expect, it, vi } from "vitest";
import { clientAuthConfigFromEnv } from "./auth-config";
import {
  createFixtureGuestAuth,
  createGuestAuth,
  GUEST_AUTH_MESSAGES,
  GuestAuthError,
  type GuestAuthPort,
} from "./guest-auth";
import { createBrowserGuestAuth } from "./supabase-browser";

const SESSION = { access_token: "test-access", user: { id: "u1" } };

/** A fake `supabase.auth`. Every method is a spy; defaults: signed out, sign-in works. */
function fakePort(over: Partial<Record<keyof GuestAuthPort, () => Promise<unknown>>> = {}) {
  let session: unknown = null;
  const port = {
    getSession: vi.fn(async () => ({ data: { session }, error: null })),
    getUser: vi.fn(async () => ({ data: { user: { id: "u1" } }, error: null })),
    signInAnonymously: vi.fn(async () => {
      session = SESSION;
      return { data: { session: SESSION }, error: null };
    }),
    signOut: vi.fn(async () => {
      session = null;
      return { error: null };
    }),
    ...over,
  };
  return {
    port: port as unknown as GuestAuthPort,
    spies: port,
    setSession: (s: unknown) => {
      session = s;
    },
  };
}

const codeOf = async (p: Promise<void>) => {
  try {
    await p;
    return "resolved";
  } catch (e: unknown) {
    return e instanceof GuestAuthError ? e.code : "other";
  }
};

describe("guest auth", () => {
  it("reuses a valid session and does not sign in again", async () => {
    const f = fakePort();
    f.setSession(SESSION);
    const auth = createGuestAuth(() => f.port);
    await auth.ensureSession();
    expect(f.spies.getUser).toHaveBeenCalledTimes(1);
    expect(f.spies.signInAnonymously).not.toHaveBeenCalled();
  });

  it("signs in anonymously when there is no session", async () => {
    const f = fakePort();
    const auth = createGuestAuth(() => f.port);
    await auth.ensureSession();
    expect(f.spies.signInAnonymously).toHaveBeenCalledTimes(1);
    // Next time the stored session is reused.
    await auth.ensureSession();
    expect(f.spies.signInAnonymously).toHaveBeenCalledTimes(1);
  });

  it("shares one sign-in between calls made at the same time", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const f = fakePort({
      signInAnonymously: vi.fn(async () => {
        await gate;
        return { data: { session: SESSION }, error: null };
      }),
    });
    const auth = createGuestAuth(() => f.port);
    const calls = [auth.ensureSession(), auth.ensureSession(), auth.ensureSession()];
    release();
    await Promise.all(calls);
    expect(f.spies.signInAnonymously).toHaveBeenCalledTimes(1);
  });

  it("says anonymous sign-in is off when the Auth server refuses it, and can try again", async () => {
    const f = fakePort({
      signInAnonymously: vi
        .fn()
        .mockResolvedValueOnce({
          data: { session: null },
          error: { name: "AuthApiError", status: 422, code: "anonymous_provider_disabled", message: "Anonymous sign-ins are disabled" },
        })
        .mockResolvedValueOnce({ data: { session: SESSION }, error: null }),
    });
    const auth = createGuestAuth(() => f.port);
    expect(await codeOf(auth.ensureSession())).toBe("anonymous_disabled");
    expect(await codeOf(auth.ensureSession())).toBe("resolved");
    expect(f.spies.signInAnonymously).toHaveBeenCalledTimes(2);
  });

  it("does not make a new user when the network fails while reading the session", async () => {
    const f = fakePort({
      getSession: async () => ({
        data: { session: null },
        error: { name: "AuthRetryableFetchError", status: 0, message: "Failed to fetch" },
      }),
    });
    const auth = createGuestAuth(() => f.port);
    expect(await codeOf(auth.ensureSession())).toBe("network");
    expect(f.spies.signInAnonymously).not.toHaveBeenCalled();
  });

  it("does not make a new user when checking an existing session fails on the network", async () => {
    const f = fakePort({
      getUser: async () => ({ data: { user: null }, error: { name: "AuthRetryableFetchError", status: 0 } }),
    });
    f.setSession(SESSION);
    const auth = createGuestAuth(() => f.port);
    expect(await codeOf(auth.ensureSession())).toBe("network");
    expect(f.spies.signInAnonymously).not.toHaveBeenCalled();
    expect(f.spies.signOut).not.toHaveBeenCalled();
  });

  it("starts a new guest session only when the Auth server says the old one is gone", async () => {
    const f = fakePort({
      getUser: async () => ({
        data: { user: null },
        error: { name: "AuthApiError", status: 403, code: "user_not_found", message: "User not found" },
      }),
    });
    f.setSession(SESSION);
    const auth = createGuestAuth(() => f.port);
    await auth.ensureSession();
    expect(f.spies.signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(f.spies.signInAnonymously).toHaveBeenCalledTimes(1);
  });

  // Regression: a failed read of the session is not proof that nobody is signed in.
  it("does not sign in or sign out when reading the session is rate limited (429)", async () => {
    const f = fakePort({
      getSession: async () => ({
        data: { session: null },
        error: { name: "AuthApiError", status: 429, code: "over_request_rate_limit", message: "Too many requests" },
      }),
    });
    const auth = createGuestAuth(() => f.port);
    expect(await codeOf(auth.ensureSession())).toBe("failed");
    expect(f.spies.signInAnonymously).not.toHaveBeenCalled();
    expect(f.spies.signOut).not.toHaveBeenCalled();
  });

  it("does not sign in or sign out when reading the session fails with an unknown error", async () => {
    const f = fakePort({
      getSession: async () => ({
        data: { session: null },
        error: { name: "AuthUnknownError", status: 400, message: "Something odd" },
      }),
    });
    const auth = createGuestAuth(() => f.port);
    expect(await codeOf(auth.ensureSession())).toBe("failed");
    expect(f.spies.signInAnonymously).not.toHaveBeenCalled();
    expect(f.spies.signOut).not.toHaveBeenCalled();
  });

  // Regression: a 403 alone does not mean the session is dead.
  it("keeps the session and makes no new user when getUser says access_denied (403)", async () => {
    const f = fakePort({
      getUser: async () => ({
        data: { user: null },
        error: { name: "AuthApiError", status: 403, code: "access_denied", message: "Access denied" },
      }),
    });
    f.setSession(SESSION);
    const auth = createGuestAuth(() => f.port);
    expect(await codeOf(auth.ensureSession())).toBe("failed");
    expect(f.spies.signOut).not.toHaveBeenCalled();
    expect(f.spies.signInAnonymously).not.toHaveBeenCalled();
  });

  it("keeps the session and makes no new user on a bare 401 with no specific code", async () => {
    const f = fakePort({
      getUser: async () => ({ data: { user: null }, error: { name: "AuthApiError", status: 401, message: "Unauthorized" } }),
    });
    f.setSession(SESSION);
    const auth = createGuestAuth(() => f.port);
    expect(await codeOf(auth.ensureSession())).toBe("failed");
    expect(f.spies.signOut).not.toHaveBeenCalled();
    expect(f.spies.signInAnonymously).not.toHaveBeenCalled();
  });

  it("signs in again when reading the session reports a specific dead refresh token", async () => {
    const f = fakePort({
      getSession: async () => ({
        data: { session: null },
        error: { name: "AuthApiError", status: 400, code: "refresh_token_not_found", message: "Invalid Refresh Token" },
      }),
    });
    const auth = createGuestAuth(() => f.port);
    await auth.ensureSession();
    expect(f.spies.signInAnonymously).toHaveBeenCalledTimes(1);
  });

  it("reports a network error from sign-in as network, not as a disabled feature", async () => {
    const f = fakePort({
      signInAnonymously: async () => {
        throw new TypeError("Failed to fetch");
      },
    });
    const auth = createGuestAuth(() => f.port);
    expect(await codeOf(auth.ensureSession())).toBe("network");
  });

  it("refuses with not_configured when the public settings are missing", async () => {
    const auth = createGuestAuth(null);
    expect(auth.mode).toBe("supabase");
    expect(await codeOf(auth.ensureSession())).toBe("not_configured");
    await expect(auth.prepareRequest()).resolves.toBeUndefined();
  });

  it("prepareRequest only reads the session and never signs in", async () => {
    const f = fakePort();
    const auth = createGuestAuth(() => f.port);
    await auth.prepareRequest();
    expect(f.spies.getSession).toHaveBeenCalledTimes(1);
    expect(f.spies.signInAnonymously).not.toHaveBeenCalled();
  });

  it("builds nothing until it is first used", () => {
    const getPort = vi.fn(() => fakePort().port);
    createGuestAuth(getPort);
    expect(getPort).not.toHaveBeenCalled();
  });

  it("does nothing at all in fixture mode", async () => {
    const auth = createFixtureGuestAuth();
    expect(auth.mode).toBe("fixture");
    await expect(auth.ensureSession()).resolves.toBeUndefined();
    await expect(auth.prepareRequest()).resolves.toBeUndefined();
  });

  it("gives every error a plain message that says nothing was created", () => {
    for (const message of Object.values(GUEST_AUTH_MESSAGES)) expect(message).toMatch(/nothing was created/);
  });
});

describe("browser guest auth and the server config", () => {
  it("never builds a Supabase client in fixture mode", async () => {
    const createClient = vi.fn();
    const auth = createBrowserGuestAuth({ mode: "fixture" }, createClient as never);
    await auth.ensureSession();
    await auth.prepareRequest();
    expect(auth.mode).toBe("fixture");
    expect(createClient).not.toHaveBeenCalled();
  });

  it("builds the browser client from the public URL and anon key on first use", async () => {
    const f = fakePort();
    const createClient = vi.fn(() => ({ auth: f.port }));
    const auth = createBrowserGuestAuth(
      { mode: "supabase", url: "https://example.supabase.co", anonKey: "public-anon-key" },
      createClient as never,
    );
    expect(createClient).not.toHaveBeenCalled();
    await auth.ensureSession();
    expect(createClient).toHaveBeenCalledWith("https://example.supabase.co", "public-anon-key");
    expect(f.spies.signInAnonymously).toHaveBeenCalledTimes(1);
  });

  it("is not configured when Supabase mode has no public settings", async () => {
    const createClient = vi.fn();
    const auth = createBrowserGuestAuth({ mode: "supabase", url: null, anonKey: null }, createClient as never);
    expect(await codeOf(auth.ensureSession())).toBe("not_configured");
    expect(createClient).not.toHaveBeenCalled();
  });

  it("takes the mode from SLEUTH_DATA_MODE only, never from a URL or key being set", () => {
    expect(clientAuthConfigFromEnv({ NEXT_PUBLIC_SUPABASE_URL: "https://x", NEXT_PUBLIC_SUPABASE_ANON_KEY: "k" })).toEqual({
      mode: "fixture",
    });
    expect(clientAuthConfigFromEnv({ SLEUTH_DATA_MODE: "supabase" })).toEqual({ mode: "supabase", url: null, anonKey: null });
    expect(
      clientAuthConfigFromEnv({
        SLEUTH_DATA_MODE: "supabase",
        NEXT_PUBLIC_SUPABASE_URL: " https://x ",
        NEXT_PUBLIC_SUPABASE_ANON_KEY: "k",
        SUPABASE_SERVICE_ROLE_KEY: "must-not-leak",
      }),
    ).toEqual({ mode: "supabase", url: "https://x", anonKey: "k" });
  });
});

describe("reviewer kind (header identity chip)", () => {
  it("reads the local session only and never signs in", async () => {
    const f = fakePort();
    const auth = createGuestAuth(() => f.port);
    expect(await auth.reviewerKind?.()).toBe("visitor");
    f.setSession({ ...SESSION, user: { id: "u1", is_anonymous: true } });
    expect(await auth.reviewerKind?.()).toBe("guest");
    f.setSession({ ...SESSION, user: { id: "u2", is_anonymous: false } });
    expect(await auth.reviewerKind?.()).toBe("team");
    expect(f.spies.signInAnonymously).not.toHaveBeenCalled();
    expect(f.spies.getUser).not.toHaveBeenCalled();
  });

  it("reads any failure as a visitor", async () => {
    const f = fakePort({ getSession: async () => Promise.reject(new TypeError("offline")) });
    expect(await createGuestAuth(() => f.port).reviewerKind?.()).toBe("visitor");
    expect(await createGuestAuth(null).reviewerKind?.()).toBe("visitor");
    expect(await createFixtureGuestAuth().reviewerKind?.()).toBe("guest");
  });
});

describe("current user id (signer label)", () => {
  it("reads the local session id only, and null without a session or on failure", async () => {
    const f = fakePort();
    const auth = createGuestAuth(() => f.port);
    expect(await auth.currentUserId?.()).toBeNull();
    f.setSession({ ...SESSION, user: { id: "u-7" } });
    expect(await auth.currentUserId?.()).toBe("u-7");
    expect(f.spies.signInAnonymously).not.toHaveBeenCalled();
    const broken = fakePort({ getSession: async () => Promise.reject(new TypeError("offline")) });
    expect(await createGuestAuth(() => broken.port).currentUserId?.()).toBeNull();
    expect(await createGuestAuth(null).currentUserId?.()).toBeNull();
    expect(await createFixtureGuestAuth().currentUserId?.()).toBe("fixture-user");
  });
});
