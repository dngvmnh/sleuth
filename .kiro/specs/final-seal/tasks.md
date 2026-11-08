# Final seal: tasks

Tasks 1 to 5 are Đăng's (@dngvmnh, backend and contracts). Tasks 6 to 10 are Đạt's (@phatdat220707, frontend). Each is half a day or less and runs against fixture mode with no keys. Task 6 onward needs task 1 merged first (contract change). After every task: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:property`, `pnpm check:contracts`.

- [x] 1. Contracts, endpoints and OpenAPI
  - Owner: Đăng
  - Files: `packages/contracts/src/entities.ts` (or new `seal.ts`), `endpoints.ts`, `index.ts`, `docs/api/openapi.yaml` (regenerated), `apps/web/app/api/v1/projects/[id]/coverage/route.ts`, `apps/web/app/api/v1/projects/[id]/reshoots/route.ts` (add GET), `apps/web/app/api/v1/projects/[id]/seal/route.ts`, `apps/web/app/api/v1/reshoots/[id]/route.ts`
  - Do: add the schemas and four endpoints from the design; routes return 501 `not_implemented` until task 4 (so the frontend can compile against the client).
  - Done when: `pnpm check:contracts` passes; the OpenAPI file lists the new paths. Label the PR `contract-change`.
  - Requirements: 1, 2, 3 (shapes)

- [x] 2. `computeCoverage`
  - Owner: Đăng
  - Files: `packages/domain/src/coverage.ts`, `coverage.test.ts`, `coverage.property.test.ts`, `packages/domain/src/index.ts`
  - Do: implement with the first-match order in the design; decisions matched by evidence id.
  - Done when: unit tests for each state; property tests for 1.3, 1.4, 1.5 pass; the golden fixture with no decisions gives 4 items `needs_review` (including the engine-proposed outside-proof item) and 1 `uncovered` (the Export item).
  - Requirements: 1.1 to 1.5

- [x] 3. `sealBlockers` and `canSeal`
  - Owner: Đăng
  - Files: `packages/domain/src/seal.ts`, `seal.test.ts`, `seal.property.test.ts`
  - Do: pure rules from the design.
  - Done when: property tests for 3.2 pass (undecided candidate always blocks; allowed implies no `uncovered` or `needs_review`).
  - Requirements: 3.2, 3.3

- [x] 4. Store: coverage, reshoots, seal, break
  - Owner: Đăng
  - Files: `packages/db/src/store.ts`, `packages/db/src/fixture/store.ts`, `store.test.ts`, the four route files from task 1
  - Do: implement `getCoverage`, `listReshoots`, `updateReshoot`, `sealProject`, `breakSeal` in the fixture store; wire the routes; add `decisions`, `seal`, `coverage` to `ReportData`.
  - Done when: tests cover seal refused with blockers, seal succeeded, demo refused, blank user refused (3.4), one active seal (3.7), seal broken after an edit that stales evidence (3.6).
  - Requirements: 2.1, 2.2, 3.1 to 3.7
  - Depends on: tasks 1 to 3

- [x] 5. Report model, CSV and HTML
  - Owner: Đăng
  - Files: `apps/web/app/api/_lib/report.ts`, `report.test.ts`, `report.property.test.ts`
  - Do: one `ReportModel`; CSV sections; HTML with seal banner, coverage, reshoots, outside proof, honesty notes, print stylesheet; escaping and formula property tests.
  - Done when: tests check every required section in both formats and the property tests for 5.3 pass.
  - Requirements: 5.1 to 5.5, 6.1, 6.2, 4.2 (text)
  - Depends on: task 4

- [ ] 6. Client methods and report data hook
  - Owner: Đạt
  - Files: `apps/web/lib/api-client.ts`, `api-client.test.ts`, `apps/web/features/report/use-report.ts`
  - Do: `getCoverage`, `listReshoots`, `updateReshoot`, `sealProject`; hook that loads coverage, findings, reshoots.
  - Done when: client tests cover success and the `seal_blocked` error with blockers.
  - Requirements: 4.1
  - Depends on: tasks 1 and 4

- [ ] 7. Report page and coverage table
  - Owner: Đạt
  - Files: `apps/web/app/(workspace)/projects/[id]/report/page.tsx`, `apps/web/features/report/report-view.tsx`, `coverage-table.tsx`, tests
  - Do: sections in the order of 4.1; "Draft: not signed off" banner; state shown with text and icon; loading, empty and error states.
  - Done when: the demo project's report renders with its coverage rows and findings; a component test checks the banner.
  - Requirements: 4.1, 4.2, 1.1

- [ ] 8. Reshoots and outside-proof lists
  - Owner: Đạt
  - Files: `apps/web/features/report/reshoot-list.tsx`, `outside-proof-list.tsx`, tests
  - Do: open and done reshoots with mark-done for owners; outside-proof lines with the proof hint and acknowledged flag; explain that "done" does not prove the item.
  - Done when: Playwright on an editable copy marks a reshoot done and the coverage state does not become proven.
  - Requirements: 2.1 to 2.3

- [ ] 9. Seal panel, confirmation and exports
  - Owner: Đạt
  - Files: `apps/web/features/report/seal-panel.tsx`, `seal-confirmation.tsx`, `export-buttons.tsx`, `apps/web/styles/` (print rules), tests
  - Do: seal button with blockers list and confirm step; wax-seal confirmation with live announcement; reduced-motion safe; CSV and HTML links and a Print button; print stylesheet check.
  - Done when: blockers disable the button with reasons; the seal succeeds after everything is reviewed; the broken-seal message appears after an edit.
  - Requirements: 3.5, 3.6, 4.3, 4.4, 5.4

- [ ] 10. End-to-end and accessibility
  - Owner: Đạt
  - Files: `tests/e2e/final-seal.spec.ts`, `docs/accessibility.md` (extend)
  - Do: copy the demo, review every candidate, add a reshoot for the ghost item, seal, edit one sentence, see the seal broken; axe scan on the report page; keyboard-only run of the seal flow.
  - Done when: the spec passes and axe reports no serious or critical issues; the accessibility doc lists what was and was not checked.
  - Requirements: 3.1 to 3.6, 4, 5
