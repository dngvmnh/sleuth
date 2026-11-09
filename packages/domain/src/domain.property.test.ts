import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { EvidenceCandidate, EvidenceStatus } from "@sleuth/contracts";
import { invalidateForNewAssetVersion, invalidateForScriptChange } from "./invalidate";
import { normaliseAndHash } from "./normalise";
import { applyReviewDecision } from "./review";
import { segmentScript } from "./segment";
import { makeEvidence } from "./test-helpers";

const wordArb = fc.stringMatching(/^[a-z]{2,8}$/);
const STATUSES: EvidenceStatus[] = [
  "candidate",
  "confirmed",
  "rejected",
  "needs_reshoot",
  "needs_outside_proof",
];

/** n distinct sentences. Each starts with a unique marker word so none collide. */
const sentencesArb = fc
  .array(fc.array(wordArb, { minLength: 2, maxLength: 6 }), { minLength: 2, maxLength: 8 })
  .map((rows) =>
    rows.map(
      (words, i) =>
        `${["alpha", "beta", "gamma", "delta", "eps", "zeta", "eta", "theta"][i]} ${words.join(" ")}`,
    ),
  );

function evidenceFor(text: string): {
  evidence: EvidenceCandidate[];
  segments: ReturnType<typeof segmentScript>;
} {
  const segments = segmentScript(text, { scriptVersionId: "sv1" });
  const evidence = segments.map((s, i) =>
    makeEvidence({
      scriptSegmentId: s.id,
      segmentHash: s.hash,
      status: STATUSES[i % STATUSES.length] ?? "candidate",
    }),
  );
  return { evidence, segments };
}

describe("normalised hashing (ADR 0004)", () => {
  it("never changes the hash on a cosmetic edit", () => {
    fc.assert(
      fc.property(
        fc.array(wordArb, { minLength: 1, maxLength: 8 }),
        fc.array(fc.boolean(), { minLength: 8, maxLength: 8 }),
        fc.constantFrom(".", "!", "?", "...", "", '"'),
        fc.constantFrom(" ", "  ", "\t", " \n "),
        (words, upper, tail, gap) => {
          const plain = words.join(" ");
          const messy = words.map((w, i) => (upper[i] ? w.toUpperCase() : w)).join(gap) + tail;
          expect(normaliseAndHash(messy)).toBe(normaliseAndHash(plain));
        },
      ),
    );
  });

  it("always changes the hash when a word changes", () => {
    fc.assert(
      fc.property(
        fc.array(wordArb, { minLength: 1, maxLength: 8 }),
        fc.nat(),
        wordArb,
        (words, at, replacement) => {
          const i = at % words.length;
          fc.pre(words[i] !== replacement);
          const edited = words.map((w, j) => (j === i ? replacement : w));
          expect(normaliseAndHash(edited.join(" "))).not.toBe(normaliseAndHash(words.join(" ")));
        },
      ),
    );
  });

  it("keeps 3.5 and 35 apart whatever surrounds them", () => {
    fc.assert(
      fc.property(wordArb, wordArb, (before, after) => {
        expect(normaliseAndHash(`${before} 3.5 ${after}`)).not.toBe(
          normaliseAndHash(`${before} 35 ${after}`),
        );
      }),
    );
  });
});

describe("change impact", () => {
  it("never makes evidence on an unchanged segment stale when another segment is edited", () => {
    fc.assert(
      fc.property(sentencesArb, fc.nat(), wordArb, (sentences, at, extra) => {
        const k = at % sentences.length;
        const { evidence, segments } = evidenceFor(sentences.join("\n"));
        const edited = sentences.map((s, i) => (i === k ? `${s} ${extra}x` : s));
        const next = segmentScript(edited.join("\n"), {
          scriptVersionId: "sv2",
          previous: segments,
        });
        const out = invalidateForScriptChange(evidence, next);
        out.forEach((e, i) => {
          if (i !== k) expect(e.status).toBe(evidence[i]?.status);
        });
      }),
    );
  });

  it("never makes evidence stale on a cosmetic edit", () => {
    fc.assert(
      fc.property(sentencesArb, (sentences) => {
        const { evidence, segments } = evidenceFor(sentences.join("\n"));
        const cosmetic = sentences.map((s) => `  ${s.toUpperCase()}.  `).join("\n");
        const next = segmentScript(cosmetic, { scriptVersionId: "sv2", previous: segments });
        expect(invalidateForScriptChange(evidence, next)).toEqual(evidence);
      }),
    );
  });

  it("always makes the edited segment's evidence stale when a word changes", () => {
    fc.assert(
      fc.property(sentencesArb, fc.nat(), (sentences, at) => {
        const k = at % sentences.length;
        const { evidence, segments } = evidenceFor(sentences.join("\n"));
        const edited = sentences.map((s, i) => (i === k ? `${s} changedword` : s));
        const next = segmentScript(edited.join("\n"), {
          scriptVersionId: "sv2",
          previous: segments,
        });
        // A person's rejection sticks; everything else that could be relied on goes stale.
        const before = evidence[k]?.status;
        const after = invalidateForScriptChange(evidence, next)[k]?.status;
        expect(after).toBe(before === "rejected" ? "rejected" : "stale");
      }),
    );
  });

  it("makes every candidate on the old video stale when a new video arrives (rejected ones stay rejected)", () => {
    fc.assert(
      fc.property(sentencesArb, (sentences) => {
        const { evidence } = evidenceFor(sentences.join("\n"));
        const out = invalidateForNewAssetVersion(evidence, "av2");
        out.forEach((e, i) => {
          expect(e.status).toBe(evidence[i]?.status === "rejected" ? "rejected" : "stale");
        });
      }),
    );
  });

  it("does not undo a dismissal when the script changes again", () => {
    fc.assert(
      fc.property(sentencesArb, fc.nat(), (sentences, at) => {
        const k = at % sentences.length;
        const { evidence, segments } = evidenceFor(sentences.join("\n"));
        const dismissed = evidence.map((e, i) =>
          i === k ? { ...e, status: "rejected" as const } : e,
        );
        const edited = sentences.map((s, i) => (i === k ? `${s} changedword` : s));
        const next = segmentScript(edited.join("\n"), {
          scriptVersionId: "sv2",
          previous: segments,
        });
        const once = invalidateForScriptChange(dismissed, next);
        expect(once[k]?.status).toBe("rejected");
        expect(invalidateForScriptChange(once, next)).toEqual(once);
      }),
    );
  });
});

describe("review state machine", () => {
  const decisionArb = fc.record({
    decision: fc.constantFrom("confirm", "reject", "needs_reshoot", "needs_outside_proof"),
    reviewerId: fc.constantFrom("", "  ", "user-1"),
    wrongEvidence: fc.boolean(),
  });

  it("never confirms evidence unless a named person decided confirm", () => {
    fc.assert(
      fc.property(fc.array(decisionArb, { maxLength: 12 }), (steps) => {
        let ev = makeEvidence({ scriptSegmentId: "a" });
        let sawHumanConfirm = false;
        for (const step of steps) {
          const result = applyReviewDecision(ev, {
            evidenceId: step.wrongEvidence ? "other" : ev.id,
            decision: step.decision,
            reviewerId: step.reviewerId,
          });
          if (result.ok) {
            if (step.decision === "confirm") sawHumanConfirm = true;
            ev = result.evidence;
          }
          if (ev.status === "confirmed") expect(sawHumanConfirm).toBe(true);
        }
      }),
    );
  });

  it("refuses every decision except a dismissal while the line or video no longer matches, whatever the status", () => {
    fc.assert(
      fc.property(
        fc.constantFrom<EvidenceStatus>(
          "candidate",
          "confirmed",
          "rejected",
          "stale",
          "needs_reshoot",
          "needs_outside_proof",
        ),
        fc.constantFrom("confirm", "reject", "needs_reshoot", "needs_outside_proof"),
        fc.constantFrom("hash", "asset", "both", "gone"),
        (status, decision, what) => {
          const ev = makeEvidence({ scriptSegmentId: "a", status });
          const current = {
            segmentHash:
              what === "hash" || what === "both"
                ? "something-else"
                : what === "gone"
                  ? undefined
                  : ev.segmentHash,
            assetVersionId: what === "asset" || what === "both" ? "av-other" : ev.assetVersionId,
          };
          const r = applyReviewDecision(
            ev,
            { evidenceId: ev.id, decision, reviewerId: "user-1" },
            current,
          );
          expect(r.ok).toBe(decision === "reject");
          if (r.ok) expect(r.evidence.status).toBe("rejected");
        },
      ),
    );
  });

  it("never lets a confirm through on stale evidence", () => {
    fc.assert(
      fc.property(fc.constantFrom("user-1", "user-2"), (reviewerId) => {
        const stale = makeEvidence({ scriptSegmentId: "a", status: "stale" });
        const r = applyReviewDecision(stale, {
          evidenceId: stale.id,
          decision: "confirm",
          reviewerId,
        });
        expect(r.ok).toBe(false);
      }),
    );
  });
});
