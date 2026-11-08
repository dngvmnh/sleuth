import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils.js";

/**
 * A token is a run of letters or digits, optionally joined to the next run by one of
 * `. , : ' -`. This keeps "3.5", "1,000", "10:30", "don't" and "e-mail" whole while
 * sentence punctuation and quotes fall away. See ADR 0004.
 */
const TOKEN = /[\p{L}\p{N}]+(?:[.,:'-][\p{L}\p{N}]+)*/gu;

/** Lower-case, unify apostrophes and hyphens, then keep only tokens, joined by single spaces. */
export function normaliseText(text: string): string {
  return tokenise(text).join(" ");
}

/** The normalised tokens of a text, in order. */
export function tokenise(text: string): string[] {
  const prepared = text
    .normalize("NFC")
    .toLowerCase()
    .replace(/[\u2018\u2019\u02bc]/g, "'")
    .replace(/[\u2010-\u2013\u2212]/g, "-");
  return prepared.match(TOKEN) ?? [];
}

/** SHA-256 (hex) of the normalised text. Cosmetic edits keep the hash; word edits change it. */
export function normaliseAndHash(text: string): string {
  return bytesToHex(sha256(utf8ToBytes(normaliseText(text))));
}
