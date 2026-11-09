# Change impact: requirements

Owner: Đăng (@dngvmnh). Covers the script revision flow, video re-upload, targeted invalidation, re-analysis of affected segments only, and the Poltergeist timeline state.

This is the main idea of SLEUTH: when one script sentence changes, only the evidence attached to it goes stale. When a new video version is uploaded, all evidence tied to the old video goes stale. Today `createScript` and `createUploadUrl` in the fixture store already do this in memory. This spec makes it complete, durable and visible.

`[PBT]` marks a criterion that a fast-check property test must cover.

## 1. Script revisions

1.1 WHEN a new script version is saved, THE SYSTEM SHALL compare it with the current version by segment id and hash and return which segments were added, modified, removed and unchanged.

1.2 WHEN a segment's normalised text hash changes, THE SYSTEM SHALL mark every evidence candidate attached to that segment `stale`, except one a person already rejected: a rejection (including dismissing stale evidence) stays `rejected`. [PBT: a word change always stales that segment's non-rejected evidence.]

1.3 WHEN only case, spacing or sentence punctuation changes, THE SYSTEM SHALL mark nothing stale. [PBT: any cosmetic edit leaves every candidate unchanged.]

1.4 WHEN one segment is edited, THE SYSTEM SHALL leave the evidence of every other segment unchanged. [PBT: editing segment A never stales evidence on segment B, for any script of 2 to 8 segments.]

1.5 WHEN a segment is removed, THE SYSTEM SHALL mark its evidence `stale` and keep the rows for history.

1.6 THE SYSTEM SHALL keep human decisions on unchanged segments across any number of revisions.

1.7 WHEN a revision is saved, THE SYSTEM SHALL return the ids of the evidence that went stale in the same response.

## 2. Video re-upload

2.1 WHEN a new asset version is created, THE SYSTEM SHALL mark every candidate tied to an older asset version `stale`, including confirmed ones, except one a person already rejected. [PBT: after any upload, no candidate other than a rejected one is fresh while referring to an older asset version.]

2.2 THE SYSTEM SHALL keep the old asset version's transcript and observations for history and SHALL NOT use them for new matching.

2.3 WHEN the new video is analysed, THE SYSTEM SHALL create fresh candidates for the new asset version and leave the stale ones in place until a person dismisses them.

## 3. Targeted re-analysis

3.1 WHEN a script revision is saved, THE SYSTEM SHALL compute the segment ids that need new analysis: modified, added, and any whose evidence is stale. Unchanged segments with valid evidence SHALL NOT be included. [PBT: the plan never contains an unchanged segment that has non-stale evidence.]

3.2 WHEN analysis is requested with `segmentIds`, THE SYSTEM SHALL create a `reanalysis` job and the worker SHALL analyse only those segments.

3.3 WHEN re-analysis finishes, THE SYSTEM SHALL replace stale candidates for those segments with new `candidate` rows and SHALL NOT touch candidates on other segments. [PBT: candidates on segments outside `segmentIds` are identical before and after.]

3.4 WHEN a new asset version is uploaded, THE SYSTEM SHALL plan a full analysis (all segments).

3.5 Re-running the same re-analysis SHALL create no duplicates (same rule as evidence-analysis 5.7).

## 4. Poltergeist state

4.1 WHEN evidence goes stale, THE SYSTEM SHALL create one Poltergeist finding per stale candidate, with an explanation of what changed (script line edited, line removed, or new video) and what has not been re-checked.

4.2 WHEN re-analysis replaces a stale candidate, THE SYSTEM SHALL mark its Poltergeist finding `resolved`.

4.3 THE SYSTEM SHALL provide a pure function that gives each script segment a display state for the timeline: `covered`, `needs_review`, `stale`, `uncovered`, `outside_proof`. [PBT: every segment gets exactly one state; a segment with any stale candidate and no fresh one is `stale`.]

4.4 THE SYSTEM SHALL NEVER present a stale candidate as valid evidence or let it be confirmed (see `applyReviewDecision`). This holds after a stale candidate was dismissed: `applyReviewDecision` is told the current line hash and video, and refuses anything but a dismissal for evidence built on an older one. [PBT: store-level, over random histories.]

## 5. Audit trail

5.1 WHEN a revision or upload stales evidence, THE SYSTEM SHALL write an `AuditEvent` with counts and ids (segments modified, evidence staled), not text.

5.2 WHEN a seal exists (see final-seal), a change that stales evidence SHALL break it and record that.
