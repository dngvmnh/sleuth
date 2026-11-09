import { z } from "zod";

/**
 * The format of an evaluation clip folder (`docs/evaluation-protocol.md` explains it to people).
 *
 *   clips/<name>/clip.json         the script, the checklist and facts about the recording
 *   clips/<name>/labels.json       what a person saw and heard when they watched the clip
 *   clips/<name>/mock-inputs.json  optional: hand-written transcript and frames for `--providers mock`
 *
 * Script lines and checklist items are counted from 1, in the order they are listed.
 */

export const ClipSchema = z.object({
  name: z.string().min(1),
  /** Null until the clip is recorded. A clip without a duration is listed as "not ready". */
  durationMs: z.number().int().positive().max(180_000).nullable(),
  labelledBy: z.string().min(1).nullable(),
  script: z.array(z.string().min(1)).min(1),
  checklist: z.array(z.string().min(1).max(300)),
});
export type Clip = z.infer<typeof ClipSchema>;

/** The finding types a person can label. Poltergeist depends on edits, not on one clip. */
export const LabelledTypeSchema = z.enum([
  "ghost",
  "phantom_dialogue",
  "cursed_frame",
  "needs_outside_proof",
]);
export type LabelledType = z.infer<typeof LabelledTypeSchema>;

const PositiveInt = z.number().int().positive();

export const LabelledFindingSchema = z
  .object({
    type: LabelledTypeSchema,
    /** Which script line (from 1). Used by every type except `ghost`. */
    scriptLine: PositiveInt.optional(),
    /** Which checklist item (from 1). Used by `ghost` only. */
    checklistItem: PositiveInt.optional(),
    note: z.string().optional(),
  })
  .superRefine((f, ctx) => {
    if (f.type === "ghost") {
      if (f.checklistItem === undefined)
        ctx.addIssue({ code: "custom", message: "a ghost label needs checklistItem" });
      if (f.scriptLine !== undefined)
        ctx.addIssue({
          code: "custom",
          message: "a ghost label names a checklist item, not a line",
        });
    } else {
      if (f.scriptLine === undefined)
        ctx.addIssue({ code: "custom", message: `a ${f.type} label needs scriptLine` });
      if (f.checklistItem !== undefined)
        ctx.addIssue({
          code: "custom",
          message: `a ${f.type} label names a line, not a checklist item`,
        });
    }
  });
export type LabelledFinding = z.infer<typeof LabelledFindingSchema>;

export const LabelsSchema = z.object({
  clip: z.string().min(1),
  labelledBy: z.string().min(1),
  labelledOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  findings: z.array(LabelledFindingSchema),
  /** Sentences the presenter said that are not in the script: the time in ms where one is heard. */
  unscripted: z
    .array(z.object({ atMs: z.number().int().nonnegative(), note: z.string().optional() }))
    .default([]),
  /** Script lines (from 1) the presenter said out of the script's order. */
  reordered: z.array(PositiveInt).default([]),
});
export type Labels = z.infer<typeof LabelsSchema>;

export const MockInputsSchema = z.object({
  transcript: z.array(
    z.object({
      startMs: z.number().int().nonnegative(),
      endMs: z.number().int().nonnegative(),
      text: z.string().min(1),
    }),
  ),
  observations: z.array(
    z.object({
      timestampMs: z.number().int().nonnegative(),
      description: z.string().min(1),
      onScreenText: z.array(z.string()).default([]),
    }),
  ),
});
export type MockInputs = z.infer<typeof MockInputsSchema>;
