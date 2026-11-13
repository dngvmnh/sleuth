import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  fakeMedia,
  fakeStore,
  geminiSet,
  handlerOptions,
  inputsFor,
  job,
} from "./speech-only.fakes";
import { createSupabaseHandler } from "./supabase-handler";

describe("speech-only rule (decision D-4) [PBT]", () => {
  it("calls Gemini only for a real account whose id is on the list", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.option(fc.uuid(), { nil: null }),
        fc.boolean(),
        fc.array(fc.uuid(), { maxLength: 4 }),
        fc.boolean(),
        async (userId, realAccount, others, listOwner) => {
          const list = listOwner && userId ? [...others, userId.toLowerCase()] : others;
          const set = geminiSet(list);
          const media = fakeMedia();
          const owner = { userId, realAccount };
          await createSupabaseHandler(handlerOptions(fakeStore(inputsFor(owner)), set, media))(job);
          const allowed = userId !== null && realAccount && list.includes(userId.toLowerCase());
          expect(set.client.calls > 0).toBe(allowed);
          expect(media.frameCalls > 0).toBe(allowed);
        },
      ),
      { numRuns: 60 },
    );
  });
});
