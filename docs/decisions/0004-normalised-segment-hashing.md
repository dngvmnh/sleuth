# 0004 Normalised segment hashing

## Context
The Change Impact Engine marks evidence stale when a script segment changes. If a typo or punctuation fix makes evidence stale, the Poltergeist feature becomes noise. But stripping all punctuation would make "3.5" and "35" look the same.

## Decision
Each script segment has a stable ID and a hash of its normalised text. Evidence stores the `segmentHash` it was built against. Evidence is stale when the segment's current hash differs.

Normalisation:
1. Apply Unicode NFC, then lower-case.
2. Normalise curly apostrophes and hyphen variants to ASCII `'` and `-`.
3. Extract tokens with the regex `[\p{L}\p{N}]+(?:[.,:'\-][\p{L}\p{N}]+)*` (Unicode flag).
4. Join tokens with a single space.
5. Hash with SHA-256 (hex).

Sentence punctuation, quotes and extra whitespace fall away. Joiners between letters or digits stay, so "3.5", "1,000", "10:30", "don't" and "e-mail" are kept.

Property tests: a cosmetic edit (case, whitespace, sentence punctuation) never changes the hash; a word change always does; "3.5" and "35" hash differently; "Click Export." and "click export" hash the same; editing segment A never affects segment B.

## Consequences
- "Click Export." to "click export" keeps evidence valid. "export" to "download" invalidates it.
- Changing the rules changes every hash, so it needs a migration and a version tag.
- A trailing joiner ("end.") is dropped, but "end.next" stays one token. Accepted.
