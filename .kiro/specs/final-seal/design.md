# Final seal: design

## Where things are today

- Report builders: `apps/web/app/api/_lib/report.ts` (`buildCsv`, `buildHtml`, `htmlEscape`), covered by `api.test.ts`.
- `ProjectStore.getReportData` returns detail, evidence, findings and reshoots. Decisions are stored in the fixture store (`decisions`) but not returned.
- `createReshoot` exists; nothing lists or updates reshoot tasks.
- Contracts have no `Seal` and no coverage shapes.

## Contract additions (`packages/contracts`, label `contract-change`)

```ts
CoverageStateSchema = z.enum(["proven","needs_review","outside_proof","reshoot","uncovered"])
CoverageItemSchema  = { checklistItemId, state: CoverageState, evidenceIds: string[] }
CoverageSummarySchema = {
  items: CoverageItem[],
  totals: Record<CoverageState, number>,
  provenPercent: number,              // 0..100, integer
  outsideProof: { scriptSegmentId, hint: string, acknowledged: boolean }[],
  openReshootIds: string[],
}
SealSchema = {
  id, projectId, sealedBy, sealedAt,
  scriptVersionId, assetVersionId,
  coverage: CoverageSummary,          // snapshot
  note: string | null,
  status: "active" | "broken",
  brokenAt: string | null, brokenReason: string | null,
}
SealBlockerSchema = z.enum(["undecided_candidates","stale_evidence","uncovered_items","job_running","no_analysis"])
```

Endpoints: `GET /projects/{id}/coverage` returns `{ coverage, seal: Seal | null, blockers: SealBlocker[] }`. `GET /projects/{id}/reshoots` returns `{ reshoots }`. `PATCH /reshoots/{id}` takes `{ status: "done" | "open" }`. `POST /projects/{id}/seal` takes `{ note?: string }`, returns 201 `{ seal }` or 409 `seal_blocked` with `details.blockers`.

`ReportData` (db store) gains `decisions`, `seal`, `coverage`.

## Pure rules (`packages/domain`)

```ts
computeCoverage(checklist, script, evidence, decisions, reshoots?): CoverageSummary   // script lets it treat a changed line as stale
sealBlockers({ coverage, evidence, jobs, hasAnalysis }): SealBlocker[]   // an empty checklist counts as uncovered_items
canSeal(input): { ok: true } | { ok: false; blockers: SealBlocker[] }
```

Coverage per checklist item, first match wins:
1. any non-stale candidate with a `confirm` decision and current status `confirmed` -> `proven`
2. a decision `needs_outside_proof` on one of its candidates (status `needs_outside_proof`) -> `outside_proof`
3. a `needs_reshoot` decision, or an open reshoot task for the item -> `reshoot`
4. any undecided `candidate` (including engine-proposed outside proof) -> `needs_review`
5. else `uncovered`

Decisions are matched to candidates by `evidenceId`, and a decision only counts if the candidate's current status still equals what the decision set (so a later stale marks it as nothing, 1.4).

`canSeal` has no clock and no user. The store adds the rules about who (owner, signed in, not demo) before calling it.

## Store behaviour

- `sealProject(actor, projectId, note)`: checks owner and non-demo, loads data, calls `canSeal`; on success writes the seal, deactivates any earlier active seal (kept as history), writes an `AuditEvent` `project_sealed` with ids only.
- Breaking: the revision and upload paths from change-impact call `breakSeal(projectId, reason)` when `staleEvidenceIds` is non-empty or a new asset version is created. Sets `status: "broken"`, `brokenAt`, `brokenReason`.
- Fixture store keeps seals in memory. Supabase store gets a `seals` table (migration; RLS like other project tables) when ingestion's Supabase store exists.

## Report content (`_lib/report.ts`)

Both exports are built from one `ReportModel` (title, seal banner, coverage rows, findings, reshoots, outside proof, honesty notes) so CSV and HTML cannot disagree. CSV has sections separated by a blank line and a header row each (summary, coverage, findings, reshoots, outside proof). HTML has a print stylesheet (white background, no animation, `@page` margins, table rows do not split across pages).

## Frontend (Đạt)

```
app/(workspace)/projects/[id]/report/page.tsx
features/report/
  report-view.tsx          sections in the order of requirement 4.1
  coverage-table.tsx       per-item state with text + icon, not colour alone
  reshoot-list.tsx         open and done, mark done (owner only)
  outside-proof-list.tsx
  seal-panel.tsx           status, blockers list, "Apply the Final Seal" button, note field
  seal-confirmation.tsx    wax-seal icon; animation off under reduced motion
  export-buttons.tsx       links to report.csv and report.html, "Print" button
```
Seal button states: hidden for non-owners and the demo; disabled with a list of blockers (each blocker has a plain sentence and a link to the place to fix it); enabled with a confirm step ("You are signing that you reviewed these items"). The page reads `GET /coverage` and never computes states itself.

## Error handling

`seal_blocked` (409) carries blockers. `demo_read_only` (403), `unauthorized` (401), `not_found` (404) as everywhere.

## Testing

- Domain: unit and property tests as marked.
- Store: seal, refuse, break on edit, history kept.
- Routes: handler tests for the four new endpoints.
- Report: snapshot-free tests that check required sections and escaping.
- Frontend: component tests for blockers and states; Playwright seals an editable copy after reviewing everything, then edits a sentence and sees the broken seal.

## Open questions

- Whether sealing with open reshoots is acceptable for the pitch (allowed, shown prominently).
- Whether the PDF route is wanted; the browser's print-to-PDF of the HTML export is the MVP answer.
