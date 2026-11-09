# DRAFT: blog post

> DRAFT. Not published. Check every claim against `docs/submission/devpost.md` ("what is real and what is mocked") on publishing day. Numbers only from test or harness output, with the source named.

## Title ideas
- "A haunted studio for demo videos: building SLEUTH with Kiro"
- "Every match is a candidate: how we kept a person in charge of sign-off"

## Draft

Demo videos lie by accident. A step gets cut in editing, a screen changes, a script line is reworded after the take. SLEUTH is our Kiroween project: a QA workspace that checks a demo video against its script and checklist and reports what it cannot prove.

**Candidates, not verdicts.** SLEUTH never confirms anything on its own. It proposes evidence; a person confirms or rejects it. A check in our repo flags any new code, outside the review rules, that marks evidence as confirmed.

**Change one line, re-check one line.** Each script sentence keeps a stable id and a hash of its normalised text, so "Click Export." and "click export" are the same line, but "3.5" and "35" are not. Edit one sentence and only its evidence goes stale, shown as a Poltergeist. Upload a new video and all evidence on the old one goes stale.

**Two stores, one contract.** The app runs with no keys on an in-memory golden fixture, and on Supabase in production. Both stores pass the same contract suite. In CI, a throwaway Supabase stack runs every Postgres, Auth and Storage test (66 passed, 0 skipped in CI run 42580335599).

**Specs found our bugs.** We wrote each feature as a Kiro spec with numbered requirements. Requirements marked for property tests became fast-check properties. One random-history property test found three bugs in our own earlier code. The worst: evidence a person had dismissed could later be confirmed on an outdated line.

**What is not done yet.** TODO: update on publishing day (real providers, the review UI, the first evaluation numbers).

## Credits
Đạt (@phatdat220707), Đăng (@dngvmnh), Phạm Quốc Bảo (@baofrovn).
