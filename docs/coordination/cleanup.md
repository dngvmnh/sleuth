# Test data to clean up

Owner: Đăng. Written 14 November 2026. Delete rows in the Supabase SQL Editor, and files in the Storage page. **SQL cannot delete Storage objects**, so every file is a click in the dashboard.

Rule for every block: run the `select` first, read the rows, and only then run the `delete`. A `delete` never touches the demo (`not is_demo`). Child rows (versions, segments, evidence, findings, jobs, seals) go with the project (cascade). There is no undo, but these rows are all test data; the demo is protected by `not is_demo` and by its own id.

## 1. Production (`sleuth-prod`)

### 1a. Rows

```sql
-- List first. Only zz-test- rows should appear, never proofpay-demo.
select id, name, owner_id, created_at
from projects
where name like 'zz-test-%' and not is_demo
order by created_at;

delete from projects where name like 'zz-test-%' and not is_demo;
```

This catches the smoke-test projects of 13 November (three were already deleted: `zz-test-ec48xl`, `zz-test-836d6a`, `zz-test-eu60zn`) and the extra one made by mistake during brief 003 (journal, 13 November). It will also catch any project made later by `scripts/prod-e2e.ts` (`zz-test-e2e-<random>`).

`scripts/guest-flow-check.ts` (PR #30) does not name its project: the app names it "Copy of ProofPay demo". When it runs against production, it prints the id. Delete that one row by id:

```sql
select id, name, owner_id, created_at from projects where id = '<id printed by the script>';
delete from projects where id = '<id printed by the script>' and not is_demo;
```

### 1b. Storage files

Click path: Supabase dashboard, `sleuth-prod`, Storage, Buckets, `video-assets`. Open the folder, select it, Delete. Folders to delete (each holds one 4 KB test file):

- `prj-0mwetmijy0001-78237676`
- `prj-0mweu1pmk0001-c9e4ae11`
- `prj-0mweuyda80001-70352397`
- `prj-0mwfvix7w0001-47e2cd39`
- `prj-0mwfw7s890001-e7c1b662`
- `prj-0mwfwzva70001-de91a8b1`
- the folder of the extra brief-003 project, if it has one (its name is the project id from the `select` above)
$1
State on 14 Nov afternoon (reported by Đăng): every `zz-test-*` row from the smoke test and the two prod-e2e runs is deleted, including `zz-test-prpfcc` and both `zz-test-e2e-*` projects. Only the six Storage folders above remain.

To see which folders have no project any more, compare the folder names with this list:

```sql
select id from projects order by id;
```

### 1c. Users (optional)

Authentication, Users, filter by anonymous. Delete the anonymous users made by the test runs. The 7-day purge (ADR 0008) deletes their projects anyway once the worker runs.

## 2. Development (`sleuth-dev`)

Nothing here is visible to visitors. The 7-day anonymous purge also removes the guest projects, once a worker runs against dev. Clean it anyway so test runs start from a known state.

### 2a. Rows

Made by Đạt on 13 November (journal entry in PR #27, 13:45 to 13:49 UTC): 11 projects named `zz-test-*` (`zz-test-4waug-A-1`; `zz-test-wp25u-A-1`, `-A-2`, `-B-1`; `zz-test-w9ui3-A-1`, `-A-2`, `-B-1`; `zz-test-aglvg-A-1`, `-A-2`, `-B-1`; `zz-test-hgli8c`). Ids from `prj-0mwf14qud0001-eb75deee` to `prj-0mwf19d62000l-f5cc5b6b`.

Made by Đăng's checks on 13 and 14 November:
- `scripts/prod-e2e.ts` rehearsals (PR #32): `zz-test-e2e-zkgp8m`, `zz-test-e2e-15jv2c`, and two more on 14 November.
- `scripts/guest-flow-check.ts` runs (PR #30) and one probe: "Copy of ProofPay demo" projects owned by anonymous users, among them `prj-0mwevljzg0003-358df99a`, `prj-0mwevnpvk0005-83ecc454`, `prj-0mwevoi6i0007-2f29cdbc`, `prj-0mwevrar70009-60e44371`, `prj-0mwevk4m30001-8d1b7140`.

```sql
-- List first.
select p.id, p.name, p.created_at, u.is_anonymous
from projects p left join auth.users u on u.id = p.owner_id
where not p.is_demo
  and (p.name like 'zz-test-%'
       or (p.name = 'Copy of ProofPay demo' and u.is_anonymous and p.created_at >= '2026-11-13'))
order by p.created_at;

delete from projects p
using auth.users u
where u.id = p.owner_id and not p.is_demo
  and p.name = 'Copy of ProofPay demo' and u.is_anonymous and p.created_at >= '2026-11-13';

delete from projects where name like 'zz-test-%' and not is_demo;
```

Test suites clean their own `contract-test-` rows; do not delete those by hand while a test run is going.

### 2b. Storage files

Click path: Supabase dashboard, `sleuth-dev`, Storage, Buckets, `video-assets`. Delete the folder named with each project id from the `select` above, after its row is gone. Đạt's smoke run left 2 files under the `zz-test-hgli8c` project (asset versions `av-0mwf19hj8000n-2959d91c` and `av-0mwf19k1l000p-14c9f07f`: a 4 KB webm and an accepted `.txt`).

### 2c. Bucket setting found on the way

Đạt's run showed the dev bucket accepted a `text/plain` upload. Set the allowed MIME types on dev too: Storage, Buckets, `video-assets`, Edit bucket, allowed MIME types `video/mp4, video/quicktime, video/webm, video/x-matroska`, limit 50 MB. The API refuses other types already; this is the second wall, as on production.

## 3. Repair the demo's findings (bug found 14 Nov)

An analysis in any project overwrote the public demo's finding with the same id (`fd-cursed-frame-seg-1` and the other line findings), because segment ids restart at `seg-1` in every project. The fix is in `packages/db/src/supabase/rows.ts` (finding ids now carry the project id). Rows already damaged must be put back once, on each project. On sleuth-dev it was done on 14 Nov. On sleuth-prod: Supabase dashboard, `sleuth-prod`, SQL Editor.

Check first. A damaged row shows a run id other than `run-golden-1`:

```sql
select id, analysis_run_id, evidence_id from findings where project_id = 'proofpay-demo' order by id;
```

Then restore (safe to run twice; it touches only the demo's four rows):

```sql
-- Restore the demo's findings to the golden fixture (fixtures/golden/proofpay-demo/expected-findings.json).
-- Touches only rows of project proofpay-demo. Safe to run twice.
begin;
update findings set type = $t$cursed_frame$t$, plain_label = $t$Needs human check$t$, checklist_item_id = $t$ck-1$t$, script_segment_id = $t$seg-1$t$, evidence_id = $t$ev-seg-1-av-1$t$, found = $t$1 frame near the spoken line shares words with it.$t$, not_found = $t$Not every key word of the line was seen on screen.$t$, limits = $t$Matching compares words only. Watch the clip to confirm it shows the step.$t$, status = $t$open$t$, analysis_run_id = $t$run-golden-1$t$ where id = 'fd-cursed-frame-seg-1' and project_id = 'proofpay-demo';
update findings set type = $t$phantom_dialogue$t$, plain_label = $t$Script line not spoken$t$, checklist_item_id = $t$ck-4$t$, script_segment_id = $t$seg-4$t$, evidence_id = null, found = $t$The script line exists.$t$, not_found = $t$No spoken sentence in the transcript covers enough of its words.$t$, limits = $t$Speech to text can miss words, and the presenter may have said it differently. Listen to the clip.$t$, status = $t$open$t$, analysis_run_id = $t$run-golden-1$t$ where id = 'fd-phantom-dialogue-seg-4' and project_id = 'proofpay-demo';
update findings set type = $t$needs_outside_proof$t$, plain_label = $t$Footage cannot prove this$t$, checklist_item_id = $t$ck-5$t$, script_segment_id = $t$seg-5$t$, evidence_id = null, found = $t$The script makes a claim about security, guarantees or compliance.$t$, not_found = $t$Footage cannot show this. No visual check was attempted.$t$, limits = $t$Needs a document, certificate or other proof from outside the video.$t$, status = $t$open$t$, analysis_run_id = $t$run-golden-1$t$ where id = 'fd-needs-outside-proof-seg-5' and project_id = 'proofpay-demo';
update findings set type = $t$ghost$t$, plain_label = $t$No visual evidence$t$, checklist_item_id = $t$ck-4$t$, script_segment_id = null, evidence_id = null, found = $t$A script line points at this item.$t$, not_found = $t$No frame near a matching spoken line shows it.$t$, limits = $t$Frames are sampled, so a quick action between samples can be missed. Scrub the video to check.$t$, status = $t$open$t$, analysis_run_id = $t$run-golden-1$t$ where id = 'fd-ghost-ck-4' and project_id = 'proofpay-demo';
commit;

```

Afterwards every row shows `run-golden-1`, and `fd-cursed-frame-seg-1` points at `ev-seg-1-av-1`.
