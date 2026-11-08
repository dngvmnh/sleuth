# Change impact: design

## Where things are today

- `segmentScript` (stable ids, `previous`, `retiredIds`), `diffScriptVersions`, `invalidateForScriptChange`, `invalidateForNewAssetVersion`, `buildPoltergeistFindings`, `applyReviewDecision` in `packages/domain`.
- The fixture store's `createScript` runs segment, diff, invalidate and adds Poltergeist findings; `createUploadUrl` stales older evidence.
- `mergeEvidence` / `mergeFindings` in `packages/evidence-engine/src/merge.ts` keep human decisions with an unchanged hash and replace stale rows.
- `StartAnalysisRequest` already has optional `segmentIds`; `ProcessingJob.payload.segmentIds` exists; the worker ignores it.
- Property tests for 1.2 to 1.4, 2.1 and the cosmetic edit rule exist at the function level in `packages/domain/src/domain.property.test.ts`.

What is missing: planning re-analysis, honouring `segmentIds`, resolving Poltergeist findings, the timeline state function, durable audit events, and tests that prove the rules through the store and the API rather than only through the functions.

## Data flow

```
POST /scripts
  segmentScript(text, previous, retiredIds)
  diffScriptVersions(prev, next)
  invalidateForScriptChange(evidence, next)      -> stale ids
  buildPoltergeistFindings(stale)                -> open findings
  planReanalysis(diff, evidence)                 -> segmentIds   (new)
  response: { scriptVersion, diff, staleEvidenceIds }

POST /analysis { segmentIds }                    -> reanalysis job
worker: analyse only segmentIds
  mergeEvidence(existing, produced)              -> replaces stale, keeps human decisions
  resolvePoltergeists(findings, replacedIds)     -> resolved                 (new)
```

## New pure functions (`packages/domain`)

```ts
planReanalysis(diff: ScriptDiff, evidence: readonly EvidenceCandidate[]): string[]
// modified + added ids, plus ids whose every candidate is stale. Never an unchanged segment with valid evidence.

resolvePoltergeists(findings: readonly Finding[], replacedEvidenceIds: readonly string[]): Finding[]
// sets status "resolved" on poltergeist findings whose evidenceId was replaced.

deriveSegmentStates(segments, evidence): Record<segmentId, SegmentState>
type SegmentState = "covered" | "needs_review" | "stale" | "uncovered" | "outside_proof"
```

`deriveSegmentStates` rules, first match wins:
1. any candidate with status `needs_outside_proof` and none valid otherwise -> `outside_proof`
2. has a candidate that is `confirmed` -> `covered`
3. has a `candidate`, `needs_reshoot` -> `needs_review`
4. has candidates and all are `stale` -> `stale`
5. otherwise -> `uncovered` (rejected-only also counts as uncovered)

The review-workspace timeline uses this function directly. It lives in `domain` so the frontend never re-implements the rules.

## Worker change (coordinated with evidence-analysis)

`runPipeline` gains an optional `segmentIds` argument; `analyse` filters `input.segments` to those ids before matching but still receives the whole checklist (a checklist item can be served by an untouched segment, so the Ghost check must look at stored evidence too). To keep `analyse` pure, the ghost step takes `existingEvidence` as an argument. Owned by Bảo (task 4).

## Store changes

`ProjectStore.createScript` already returns diff and stale ids. Add `reanalysisPlan: string[]` to `CreateScriptResponse` so the frontend can offer "re-check 2 changed lines" with one click (contract change). `startAnalysis` validates that `segmentIds` exist in the current script version (400 if not).

Supabase store writes the same changes in one transaction: new script version and segments, evidence updates to `stale`, new Poltergeist findings, audit event.

## Audit

`script_revised` data: `{ modified: n, added: n, removed: n, staleEvidence: n }`. `asset_replaced`: `{ staleEvidence: n }`. Counts only.

## Testing strategy

- Function-level property tests already cover the rules; add `planReanalysis` and `deriveSegmentStates` properties.
- Store-level property test: random sequences of edits, uploads, re-analyses and reviews against the fixture store (and later the Supabase store through the shared contract suite). Invariants checked after every step: no stale candidate is confirmed; human decisions on unchanged hashes survive; candidates outside `segmentIds` are untouched by re-analysis; no duplicate candidate ids.
- API-level test through the route handlers: edit one sentence on a `copyFromDemo` project and assert exactly one stale candidate and one Poltergeist finding.

## Open questions

- Whether a rejected candidate on an edited segment should become `stale` (current rule: yes, every non-stale status) or stay `rejected`. Current behaviour keeps the invariant simple.
- Whether `removed` segments' stale evidence should be hidden from the default view after dismissal (frontend call).
