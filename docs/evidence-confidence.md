# How SLEUTH ranks a match

This page explains, in plain words, how the evidence engine decides that a script line was spoken, which frames it links to, and how it ranks the match. The numbers below are the same constants the code uses (`packages/evidence-engine/src/thresholds.ts` and `match.ts`). A test fails if this page and the code disagree.

**Confidence is a ranking, not proof and not a probability.** It tells a person which matches to look at first. Every match is a candidate until a person confirms it.

## Step 1: was the line spoken?

For each script line, SLEUTH counts its key words (filler words such as "the" and "to" are ignored) and checks how many appear in each spoken segment of the transcript.

| Share of key words found | Label | Meaning |
|---|---|---|
| 85% or more | exact | Spoken as written. |
| 60% up to 85% | changed | Spoken, but with different words. |
| Below 60% | missing | Not found. This raises a **Phantom Dialogue** finding ("Script line not spoken"). |

A spoken segment serves one script line only. If the same line is spoken out of the script's order, it is labelled **reordered**. A spoken segment that no script line uses is **unscripted**. Reordered and unscripted lines are reported in the analysis result and in the explanation text. They are not separate finding types yet.

## Step 2: which frames go with it?

SLEUTH looks at frames from 2,000 ms before the spoken segment starts to 2,000 ms after it ends. A frame counts when its description or on-screen text shares at least 1 key word with the line. If no frame counts, there is no candidate, and the checklist item may raise a **Ghost** finding ("No visual evidence").

A frame inside the spoken time (not only inside the 2,000 ms margin) is called "inside the spoken time".

## Step 3: the rank

| Rank | When |
|---|---|
| **high** | The line is **exact**, and at least one frame inside the spoken time shares 2 or more key words with it. |
| **medium** | A frame matches, but the line is **changed** or **reordered**, or the best frame shares only 1 key word, or the strong frame is only in the margin. |
| **low** | The claim is one that footage cannot prove (see below). |

Every **medium** or **low** candidate that has frames also raises a **Cursed Frame** finding ("Needs human check"), so a person must look at it. A **high** candidate is still only a candidate.

## Claims footage cannot prove

Words such as "encrypted", "secure", "guarantee", "compliant" or "always" make a claim that a screen recording cannot show. SLEUTH raises **Needs Outside Proof** ("Footage cannot prove this"), attaches no frames, and ranks the candidate **low**.

## Checklist items

A script line serves a checklist item when at least 50% of the item's key words appear in the line.

## What the check cannot do

- It compares words, not meaning. A frame can share words with a line and still not show the step.
- Speech to text can miss or change words.
- Frames are sampled, so a quick action between two samples can be missed.
