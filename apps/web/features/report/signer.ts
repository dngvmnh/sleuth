/**
 * Who signed the Final Seal, in words a person reads (issue #96). The seal stores only the
 * signer's user id, and a raw id looks like a bug, so the screen never shows it as text.
 *
 * - "you": the person looking at the report signed it.
 * - "the project owner": someone else signed it, and that is the project's owner. Only the owner
 *   may seal (the store checks it), so this is the usual case for anyone else who can read it.
 * - "a reviewer": anything else.
 *
 * The API does not say whether a user is a team account or a guest, so this cannot say "the
 * team reviewer" or "a guest reviewer" about someone else without new data from the API.
 * Never an e-mail address: the web app never receives one.
 */
export type SignerLabel = "you" | "the project owner" | "a reviewer";

export function signerLabel(
  sealedBy: string,
  viewerId: string | null | undefined,
  ownerId: string | null | undefined,
): SignerLabel {
  if (viewerId && sealedBy === viewerId) return "you";
  if (ownerId && sealedBy === ownerId) return "the project owner";
  return "a reviewer";
}

/** An 8-4-4-4-12 hex id, the shape of a Supabase user id. Visible text must never contain one. */
export const UUID_PATTERN = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
