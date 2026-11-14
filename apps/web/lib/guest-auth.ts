/**
 * Guest (anonymous) sign-in for the two write entry points: "Create a project" on the
 * dashboard and "Make an editable copy" on the demo (ADR 0006, review 003).
 *
 * - Viewing never signs anyone in. Only `ensureSession()` may create an anonymous user, and
 *   only when there is no usable session.
 * - A network error never creates a new user: only the Auth server saying "this session is
 *   not valid" does.
 * - Concurrent calls share one sign-in, so a double click cannot make two users.
 * - Fixture mode never touches Supabase.
 *
 * Nothing here logs. Errors carry a code and a plain message, never a token or a key.
 */

export type GuestAuthMode = "fixture" | "supabase";

/** Who is using this browser, for the header: no session yet, a guest, or a team account. */
export type ReviewerKind = "visitor" | "guest" | "team";

export type GuestAuthErrorCode = "not_configured" | "anonymous_disabled" | "network" | "failed";

/** Plain messages for people. Each says that nothing was created and how to go on. */
export const GUEST_AUTH_MESSAGES: Record<GuestAuthErrorCode, string> = {
  not_configured:
    "Guest sign-in is not set up on this site, so nothing was created. The demo still works read-only.",
  anonymous_disabled:
    "Guest sign-in is turned off on this site, so nothing was created. The demo still works read-only.",
  network: "Could not reach the sign-in service, so nothing was created. Check your connection and try again.",
  failed: "Guest sign-in did not work, so nothing was created. Try again.",
};

export class GuestAuthError extends Error {
  constructor(public readonly code: GuestAuthErrorCode) {
    super(GUEST_AUTH_MESSAGES[code]);
    this.name = "GuestAuthError";
  }
}

/** The part of `supabase.auth` this module uses. Results follow supabase-js: `{ data, error }`. */
export interface GuestAuthPort {
  getSession(): Promise<{ data: { session: unknown }; error: unknown }>;
  getUser(): Promise<{ data: { user: unknown }; error: unknown }>;
  signInAnonymously(): Promise<{ data: { session: unknown }; error: unknown }>;
  signOut(options: { scope: "local" }): Promise<{ error: unknown }>;
}

export interface GuestAuth {
  readonly mode: GuestAuthMode;
  /**
   * Make sure there is a signed-in user before a write that needs one: reuse a valid session,
   * otherwise sign in anonymously. Throws `GuestAuthError` and then nothing must be created.
   */
  ensureSession(): Promise<void>;
  /**
   * Before any API call: let an existing session refresh its cookie if it expired.
   * Never signs anyone in and never throws.
   */
  prepareRequest(): Promise<void>;
  /**
   * Who holds the session in this browser. Reads the local session only: never signs anyone
   * in and never throws (any problem reads as "visitor"). Optional for hand-made test doubles.
   */
  reviewerKind?(): Promise<ReviewerKind>;
}

interface ErrorShape {
  name?: unknown;
  status?: unknown;
  code?: unknown;
  message?: unknown;
}

function shape(error: unknown): ErrorShape {
  return typeof error === "object" && error !== null ? (error as ErrorShape) : {};
}

/** No answer from the Auth server (offline, DNS, timeout, 5xx). */
function isNetworkError(error: unknown): boolean {
  const e = shape(error);
  if (e.name === "AuthRetryableFetchError" || e.name === "TypeError") return true;
  return typeof e.status === "number" && (e.status === 0 || e.status >= 500);
}

/** Error codes from the Auth server that say this session or its user no longer exists. */
const DEAD_SESSION_CODES = new Set([
  "user_not_found",
  "session_not_found",
  "session_expired",
  "bad_jwt",
  "refresh_token_not_found",
]);

/**
 * Specific proof that the old session is no longer valid, so a new guest may replace it.
 * An HTTP 401 or 403 alone is not proof (it can be a rate limit, a denied action or a proxy),
 * and neither is an error we cannot name.
 */
function isDeadSession(error: unknown): boolean {
  const e = shape(error);
  if (e.name === "AuthSessionMissingError") return true;
  return typeof e.code === "string" && DEAD_SESSION_CODES.has(e.code);
}

/** Any other read error: network, or `failed` for rate limits, denials and unknown errors. */
function readError(error: unknown): GuestAuthError {
  return new GuestAuthError(isNetworkError(error) ? "network" : "failed");
}

function signInError(error: unknown): GuestAuthError {
  const e = shape(error);
  if (isNetworkError(error)) return new GuestAuthError("network");
  const text = typeof e.message === "string" ? e.message.toLowerCase() : "";
  if (e.code === "anonymous_provider_disabled" || text.includes("anonymous sign-ins are disabled")) {
    return new GuestAuthError("anonymous_disabled");
  }
  return new GuestAuthError("failed");
}

/** Fixture mode: the fixture API names the user itself, so there is nothing to sign in. */
export function createFixtureGuestAuth(): GuestAuth {
  return {
    mode: "fixture",
    ensureSession: async () => undefined,
    prepareRequest: async () => undefined,
    reviewerKind: async () => "guest",
  };
}

/**
 * Supabase mode. `getPort` is called lazily, on the first use, so building this object does
 * nothing on the network. Pass `null` when the public Supabase settings are missing.
 */
export function createGuestAuth(getPort: (() => GuestAuthPort) | null): GuestAuth {
  let port: GuestAuthPort | undefined;
  let inflight: Promise<void> | undefined;
  const auth = (): GuestAuthPort => {
    if (!getPort) throw new GuestAuthError("not_configured");
    return (port ??= getPort());
  };

  async function signIn(): Promise<void> {
    let result: Awaited<ReturnType<GuestAuthPort["signInAnonymously"]>>;
    try {
      result = await auth().signInAnonymously();
    } catch (error: unknown) {
      throw signInError(error);
    }
    if (result.error) throw signInError(result.error);
    if (!result.data.session) throw new GuestAuthError("failed");
  }

  async function run(): Promise<void> {
    let current: Awaited<ReturnType<GuestAuthPort["getSession"]>>;
    try {
      current = await auth().getSession();
    } catch {
      throw new GuestAuthError("network");
    }
    // A failed read is not proof that nobody is signed in. Only a clean "no session", or a
    // specific dead-session code, lets a new guest be made.
    if (current.error && !isDeadSession(current.error)) throw readError(current.error);

    if (current.data.session) {
      let check: Awaited<ReturnType<GuestAuthPort["getUser"]>>;
      try {
        check = await auth().getUser();
      } catch {
        throw new GuestAuthError("network");
      }
      if (!check.error && check.data.user) return; // reuse the session
      if (!isDeadSession(check.error)) throw readError(check.error);
      // The Auth server says the session is gone (for example the user was purged): drop it
      // from this browser only, then start a new guest session below.
      try {
        await auth().signOut({ scope: "local" });
      } catch {
        // A failed local sign-out still leaves us free to sign in again.
      }
    }
    await signIn();
  }

  return {
    mode: "supabase",
    ensureSession() {
      if (!getPort) return Promise.reject(new GuestAuthError("not_configured"));
      inflight ??= run().finally(() => {
        inflight = undefined;
      });
      return inflight;
    },
    async prepareRequest() {
      if (!getPort) return;
      try {
        await auth().getSession();
      } catch {
        // The request goes ahead; the server treats an unusable session as a visitor.
      }
    },
    async reviewerKind(): Promise<ReviewerKind> {
      if (!getPort) return "visitor";
      try {
        const { data, error } = await auth().getSession();
        if (error || !data.session) return "visitor";
        const user = (data.session as { user?: { is_anonymous?: unknown } }).user;
        return user?.is_anonymous === false ? "team" : "guest";
      } catch {
        return "visitor";
      }
    },
  };
}

/** The message to show for an error from `ensureSession`. */
export function guestAuthMessage(error: unknown): string | undefined {
  return error instanceof GuestAuthError ? error.message : undefined;
}
