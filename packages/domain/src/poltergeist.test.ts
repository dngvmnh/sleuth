import { describe, expect, it } from "vitest";
import type { Finding } from "@sleuth/contracts";
import { buildPoltergeistFindings, resolvePoltergeists } from "./poltergeist";
import { makeEvidence } from "./test-helpers";

const stale = (segment: string) => makeEvidence({ scriptSegmentId: segment, status: "stale" });

describe("buildPoltergeistFindings", () => {
  it("makes one open finding per stale candidate and ignores fresh ones", () => {
    const out = buildPoltergeistFindings(
      [stale("a"), makeEvidence({ scriptSegmentId: "b" })],
      "run1",
    );
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      type: "poltergeist",
      status: "open",
      evidenceId: "ev-a",
      plainLabel: "Evidence out of date",
    });
  });

  it("states what was found, what was not found and the limits", () => {
    const [f] = buildPoltergeistFindings([stale("a")], "run1");
    expect(f?.found && f.notFound && f.limits).toBeTruthy();
  });

  it("names the cause: the script or the video", () => {
    const script = buildPoltergeistFindings([stale("a")], "r", "script_changed")[0];
    const video = buildPoltergeistFindings([stale("a")], "r", "video_replaced")[0];
    expect(script?.found).toMatch(/script line/);
    expect(video?.found).toMatch(/earlier version of the video/);
  });
});

describe("resolvePoltergeists", () => {
  const poltergeists = buildPoltergeistFindings([stale("a"), stale("b")], "run1");
  const other: Finding = {
    ...(poltergeists[0] as Finding),
    id: "fd-ghost-x",
    type: "ghost",
    evidenceId: "ev-a",
  };
  const all = [...poltergeists, other];

  it("resolves the Poltergeist whose evidence was replaced", () => {
    const out = resolvePoltergeists(all, ["ev-a"]);
    expect(out.find((f) => f.id === "fd-poltergeist-ev-a")?.status).toBe("resolved");
  });

  it("leaves Poltergeists for evidence that was not replaced", () => {
    const out = resolvePoltergeists(all, ["ev-a"]);
    expect(out.find((f) => f.id === "fd-poltergeist-ev-b")?.status).toBe("open");
  });

  it("never touches other finding types, even with the same evidence id", () => {
    const out = resolvePoltergeists(all, ["ev-a"]);
    expect(out.find((f) => f.id === "fd-ghost-x")).toEqual(other);
  });

  it("does nothing when nothing was replaced", () => {
    expect(resolvePoltergeists(all, [])).toEqual(all);
  });

  it("does not mutate its input and is idempotent", () => {
    const once = resolvePoltergeists(all, ["ev-a", "ev-b"]);
    expect(all.every((f) => f.status === "open")).toBe(true);
    expect(resolvePoltergeists(once, ["ev-a", "ev-b"])).toEqual(once);
  });

  it("ignores findings with no evidence id", () => {
    const loose: Finding = { ...(poltergeists[0] as Finding), id: "fd-p-loose", evidenceId: null };
    expect(resolvePoltergeists([loose], ["ev-a"])).toEqual([loose]);
  });
});
