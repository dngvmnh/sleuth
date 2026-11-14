# Blog post

Final text, 14 November 2026. Publish it on a public site the team controls, then put its URL on Devpost. Re-check each number on publishing day (commands are in `docs/submission/devpost.md`).

**Title:** A haunted studio for demo videos: building SLEUTH with Kiro

*We wrote this for the Kiroween 2026 hackathon.*

Demo videos lie by accident. A step gets cut in editing, a screen changes, a script line is reworded after the take. SLEUTH is our Kiroween project: a QA workspace that checks a demo video against its script and checklist, and says what it cannot prove.

![The SLEUTH workspace: the claims map with the Lantern open on line 3](screenshots/workspace-lantern-open-1440.png)

**Candidates, not verdicts.** SLEUTH never confirms anything on its own. It proposes evidence, and a person confirms or rejects it. A check in our repository flags any new code, outside the review rules, that marks evidence as confirmed.

**Findings with two names.** Every finding has a haunted name and a plain one: Ghost (no visual evidence), Phantom Dialogue (script line not spoken), Cursed Frame (needs a human check), Poltergeist (evidence out of date), Needs Outside Proof (footage cannot prove this). The plain name is always beside the spooky one.

**Change one line, re-check one line.** Each script sentence keeps a stable id and a hash of its normalised text, so "Click Export." and "click export" are the same line, but "3.5" and "35" are not. Edit one sentence and only its evidence goes stale. Upload a new video and all evidence on the old one goes stale.

**Two stores, one contract.** The app runs with no keys on an in-memory golden fixture, and on Supabase in production. Both stores pass the same contract suite, and a throwaway Supabase stack in CI runs every Postgres, Auth and Storage test.

**Specs found our bugs.** We wrote each feature as a Kiro spec with numbered requirements. Requirements marked for property tests became fast-check properties. One random-history test found three bugs in code we had written the same day. The worst: evidence a person had dismissed could later be confirmed on an outdated line.

**A haunted house you can still read.** The dashboard hero says "The cut is haunted." and shows the demo's real coverage. The findings cabinet explains each finding, how it is found and how to clear it. In the workspace, the claims map is a floor plan with one room per claim. Click a room and the Lantern opens beside it with the evidence. The report is "The final seal". Every number on these screens comes from the API, and every spooky label sits next to its plain one.

**Night wind, made in the browser.** The optional ambient sound is generated with the Web Audio API: wind, a far-off howl and a low drone, with no audio files. It is off by default and starts only on a click. It goes quiet while the demo video plays, so the reviewer hears the demo's own sound.

**Free means slow, so we say so.** The worker runs on a GitHub Actions schedule every 10 minutes. A visitor's job can wait 10 to 15 minutes, and the page says that instead of faking a progress bar.

**What is not done.** We have not measured accuracy. No real clip is recorded and labelled yet, so we publish no precision or recall number. The repository's `docs/evidence-confidence.md` will show one when the clips exist, with the clip count beside it.

<!-- PLACEHOLDER (issue #67): replace the paragraph above with the table `pnpm eval --providers real` printed, with the date and the clip count. Do not type numbers by hand. -->
`[Accuracy table from issue #67 goes here once it is posted.]`

Try it: https://sleuth-eight.vercel.app. Code: https://github.com/dngvmnh/sleuth (MIT).

Built by Đạt (@phatdat220707), Đăng (@dngvmnh) and Phạm Quốc Bảo (@baofrovn).
