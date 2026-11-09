# Change impact: tasks

Tasks are Đăng's (@dngvmnh) unless marked. Each is half a day or less and runs against fixtures. After every task: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:property`, `pnpm check:contracts`.

- [x] 1. `planReanalysis`
  - Owner: Đăng
  - Files: `packages/domain/src/reanalysis.ts`, `reanalysis.test.ts`, `reanalysis.property.test.ts`, `packages/domain/src/index.ts`
  - Do: implement as designed.
  - Done when: unit tests and the property test for 3.1 pass.
  - Requirements: 3.1, 3.4

- [x] 2. `deriveSegmentStates`
  - Owner: Đăng
  - Files: `packages/domain/src/segment-state.ts`, `segment-state.test.ts`, `segment-state.property.test.ts`, `packages/domain/src/index.ts`
  - Do: implement the five-state function with the rule order in the design.
  - Done when: every state has a unit test; property test proves exactly one state per segment and the stale rule.
  - Requirements: 4.3, 4.4
  - Note: Đạt's timeline task 7 in review-workspace waits for this.

- [x] 3. `resolvePoltergeists`
  - Owner: Đăng
  - Files: `packages/domain/src/poltergeist.ts`, `poltergeist.test.ts`
  - Do: add `resolvePoltergeists`; test it with `buildPoltergeistFindings` output.
  - Done when: findings for replaced evidence become `resolved`, others unchanged.
  - Requirements: 4.1, 4.2

- [ ] 4. Engine honours `segmentIds`
  - Owner: Phạm Quốc Bảo (@baofrovn)
  - Files: `packages/evidence-engine/src/analyse.ts`, `pipeline.ts`, `analyse.test.ts`, `pipeline.property.test.ts`
  - Do: optional `segmentIds` filter; ghost check takes `existingEvidence`; output for a full run stays identical (golden test).
  - Done when: property test proves candidates outside `segmentIds` are never produced and merging leaves other candidates identical.
  - Requirements: 3.2, 3.3, 3.5

- [x] 5. Reanalysis in the fixture store
  - Owner: Đăng
  - Files: `packages/contracts/src/endpoints.ts` (add `reanalysisPlan` to `CreateScriptResponse`), `fixtures/golden/build.ts` (only if needed), `packages/db/src/fixture/store.ts`, `store.test.ts`, `docs/api/openapi.yaml`
  - Do: compute and return `reanalysisPlan`; validate `segmentIds` in `startAnalysis`; add `applyAnalysisResult` to the fixture store so a test (and later the frontend in fixture mode) can complete a re-analysis in memory using `analyse` with `segmentIds`, `mergeEvidence`, `resolvePoltergeists`.
  - Done when: edit one sentence, request re-analysis for the plan, and the fixture store shows one new candidate, the old one replaced, the Poltergeist resolved, and other segments untouched. Label the PR `contract-change`.
  - Requirements: 1.7, 3.2, 3.3, 4.2
  - Depends on: tasks 1, 3, 4

- [x] 6. Store-level property test
  - Owner: Đăng
  - Files: `packages/db/src/fixture/store.property.test.ts`
  - Do: random sequences of edit, cosmetic edit, upload, re-analyse and review against the fixture store; check the invariants in the design after each step.
  - Done when: 200 runs pass; any failing seed is turned into a unit test.
  - Requirements: 1.2 to 1.6, 2.1, 3.3, 4.4

- [x] 7. Audit events for revisions and uploads
  - Owner: Đăng
  - Files: `packages/db/src/fixture/store.ts`, `store.test.ts`
  - Do: write `script_revised` and `asset_replaced` events with counts only.
  - Done when: a test checks the counts and scans the JSON for text.
  - Requirements: 5.1

- [x] 8. API-level change-impact test
  - Owner: Đăng
  - Files: `apps/web/app/api/_lib/change-impact.test.ts`
  - Do: through the route handlers, copy the demo, edit one sentence, read evidence and findings, request re-analysis, read again.
  - Done when: exactly one stale candidate and one Poltergeist appear after the edit, none after the re-analysis resolves them.
  - Requirements: 1.2, 1.4, 4.1, 4.2

- [ ] 9. Supabase transaction for revisions (needs database; after ingestion task 6)
  - Owner: Đăng
  - Files: `packages/db/src/supabase/store.ts`, shared contract suite
  - Do: implement the revision and upload invalidation in one transaction; add the store-level property test to the shared suite so it runs on both stores.
  - Done when: the suite passes on the Supabase store.
  - Requirements: 1.1 to 1.7, 2.1, 2.2

- [x] 10. Seal breaking on change
  - Owner: Đăng
  - Files: `packages/db/src/fixture/store.ts`, tests
  - Do: when final-seal task 4 lands, a revision or upload that stales evidence breaks an existing seal and writes an audit event.
  - Done when: a test seals a project, edits one sentence, and sees the seal broken.
  - Requirements: 5.2
  - Depends on: final-seal task 4
