import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { categoryOf } from "./keep-alive";

// Importing keep-alive.ts does not connect: it runs only when called as a script.

const CATEGORIES = ["auth", "host", "timeout", "tls", "config", "other"] as const;
const err = (fields: { code?: string; name?: string; message?: string; cause?: unknown }) =>
  Object.assign(new Error(fields.message ?? "x"), fields);

describe("categoryOf (scripts/keep-alive.ts)", () => {
  it.each([
    ["28P01", "auth"],
    ["28000", "auth"],
    ["SASL_SIGNATURE_MISMATCH", "auth"],
    ["ENOTFOUND", "host"],
    ["EAI_AGAIN", "host"],
    ["ECONNREFUSED", "host"],
    ["EHOSTUNREACH", "host"],
    ["ENETUNREACH", "host"],
    ["ECONNRESET", "host"],
    ["KEEP_ALIVE_TIMEOUT", "timeout"],
    ["CONNECT_TIMEOUT", "timeout"],
    ["ETIMEDOUT", "timeout"],
    ["ERR_TLS_CERT_ALTNAME_INVALID", "tls"],
    ["ERR_SSL_WRONG_VERSION_NUMBER", "tls"],
    ["DEPTH_ZERO_SELF_SIGNED_CERT", "tls"],
    ["UNABLE_TO_VERIFY_LEAF_SIGNATURE", "tls"],
    ["ERR_INVALID_URL", "config"],
    ["XX000", "other"],
  ])("maps code %s to %s", (code, category) => {
    expect(categoryOf(err({ code }))).toBe(category);
  });

  it("maps a TypeError to config and anything unknown to other", () => {
    expect(categoryOf(new TypeError("bad"))).toBe("config");
    expect(categoryOf(new Error("plain"))).toBe("other");
    expect(categoryOf(null)).toBe("other");
    expect(categoryOf(undefined)).toBe("other");
    expect(categoryOf("a string")).toBe("other");
    expect(categoryOf({ code: 42 })).toBe("other");
  });

  it("reads a wrapped cause one level down when the outer error says nothing", () => {
    expect(categoryOf(err({ cause: err({ code: "ENOTFOUND" }) }))).toBe("host");
    expect(categoryOf(err({ cause: err({ code: "28P01" }) }))).toBe("auth");
    // The outer code wins when it is known.
    expect(categoryOf(err({ code: "ETIMEDOUT", cause: err({ code: "28P01" }) }))).toBe("timeout");
    // A cause that points at itself does not loop.
    const self = err({});
    (self as { cause?: unknown }).cause = self;
    expect(categoryOf(self)).toBe("other");
  });

  it("never lets message text decide the category or reach the output [PBT]", () => {
    const secretish = fc.oneof(
      fc.constant("password authentication failed for user postgres.abcdefghij"),
      fc.constant("getaddrinfo ENOTFOUND aws-0-ap-northeast-2.pooler.supabase.com"),
      fc.constant("postgresql://user:secret@host:5432/postgres"),
      fc.string({ minLength: 1, maxLength: 80 }),
    );
    fc.assert(
      fc.property(
        secretish,
        fc.option(fc.constantFrom("28P01", "ENOTFOUND", "x"), { nil: undefined }),
        (message, code) => {
          const withMessage = categoryOf(err({ message, ...(code ? { code } : {}) }));
          const without = categoryOf(err({ message: "", ...(code ? { code } : {}) }));
          // The same code gives the same answer whatever the message says.
          expect(withMessage).toBe(without);
          expect(CATEGORIES).toContain(withMessage);
          // The printed line is one fixed word after "error", so no part of the message can be in it.
          expect(`error ${withMessage}`).toMatch(/^error (auth|host|timeout|tls|config|other)$/);
        },
      ),
      { numRuns: 200 },
    );
  });
});
