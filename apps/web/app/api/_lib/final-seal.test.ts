import { describe, expect, it } from "vitest";
import {
  ErrorResponseSchema,
  GetCoverageResponseSchema,
  ListEvidenceResponseSchema,
  ListReshootsResponseSchema,
  SealProjectResponseSchema,
  GetProjectResponseSchema,
} from "@sleuth/contracts";
import { GET as getCoverage } from "../v1/projects/[id]/coverage/route";
import { GET as getProject } from "../v1/projects/[id]/route";
import { GET as listEvidence } from "../v1/projects/[id]/evidence/route";
import { GET as listReshoots, POST as createReshoot } from "../v1/projects/[id]/reshoots/route";
import { GET as reportHtml } from "../v1/projects/[id]/report.html/route";
import { GET as reportCsv } from "../v1/projects/[id]/report.csv/route";
import { POST as seal } from "../v1/projects/[id]/seal/route";
import { POST as createProject } from "../v1/projects/route";
import { PATCH as review } from "../v1/evidence/[id]/review/route";
import { PATCH as updateReshoot } from "../v1/reshoots/[id]/route";
import { POST as createScript } from "../v1/projects/[id]/scripts/route";

const ctx = (params: Record<string, string> = {}) => ({ params: Promise.resolve(params) });
const call = (user: string, method: string, body?: unknown) =>
  new Request("http://localhost/x", {
    method,
    headers: { "content-type": "application/json", "x-fixture-user": user },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });

async function newCopy(user: string) {
  const res = await createProject(call(user, "POST", { name: "Seal", copyFromDemo: true }), ctx());
  return ((await res.json()) as { project: { id: string } }).project.id;
}

describe("final seal through the API", () => {
  it("coverage is readable on the public demo without signing in", async () => {
    const res = await getCoverage(call("anonymous", "GET"), ctx({ id: "proofpay-demo" }));
    expect(res.status).toBe(200);
    const body = GetCoverageResponseSchema.parse(await res.json());
    expect(body.coverage.items).toHaveLength(5);
    expect(body.seal).toBeNull();
    expect(body.blockers.length).toBeGreaterThan(0);
  });

  it("answers 409 seal_blocked with the blockers while work is left", async () => {
    const id = await newCopy("seal-user-1");
    const res = await seal(call("seal-user-1", "POST", {}), ctx({ id }));
    expect(res.status).toBe(409);
    const body = ErrorResponseSchema.parse(await res.json());
    expect(body.error.code).toBe("seal_blocked");
    expect(body.error.details).toEqual({ blockers: ["undecided_candidates", "uncovered_items"] });
  });

  it("refuses the demo, a stranger and a visitor who is not signed in", async () => {
    const id = await newCopy("seal-user-2");
    expect((await seal(call("seal-user-2", "POST", {}), ctx({ id: "proofpay-demo" }))).status).toBe(
      403,
    );
    expect((await seal(call("someone-else", "POST", {}), ctx({ id }))).status).toBe(404);
    expect((await seal(call("anonymous", "POST", {}), ctx({ id }))).status).toBe(404);
  });

  it("review everything, add a reshoot, seal, export, then break the seal with an edit", async () => {
    const user = "seal-user-3";
    const id = await newCopy(user);
    const evidence = ListEvidenceResponseSchema.parse(
      await (await listEvidence(call(user, "GET"), ctx({ id }))).json(),
    ).evidence;
    const by = (seg: string) => evidence.find((e) => e.scriptSegmentId === seg)?.id ?? "";
    for (const seg of ["seg-1", "seg-2", "seg-3"]) {
      expect(
        (await review(call(user, "PATCH", { decision: "confirm" }), ctx({ id: by(seg) }))).status,
      ).toBe(200);
    }
    expect(
      (
        await review(
          call(user, "PATCH", { decision: "needs_outside_proof" }),
          ctx({ id: by("seg-5") }),
        )
      ).status,
    ).toBe(200);

    const project = GetProjectResponseSchema.parse(
      await (await getProject(call(user, "GET"), ctx({ id }))).json(),
    );
    const exportItem = project.checklist.find((c) => c.label.startsWith("Export"));
    const made = await createReshoot(
      call(user, "POST", { note: "Record the export step.", checklistItemId: exportItem?.id }),
      ctx({ id }),
    );
    expect(made.status).toBe(201);
    const reshootId =
      ListReshootsResponseSchema.parse(
        await (await listReshoots(call(user, "GET"), ctx({ id }))).json(),
      ).reshoots[0]?.id ?? "";

    // Seal.
    const sealed = await seal(call(user, "POST", { note: "All reviewed." }), ctx({ id }));
    expect(sealed.status).toBe(201);
    const { seal: s } = SealProjectResponseSchema.parse(await sealed.json());
    expect(s).toMatchObject({ status: "active", sealedBy: user, note: "All reviewed." });

    // Exports say who signed in words; the raw id stays only in its audit place (issue #96).
    const html = await (await reportHtml(call(user, "GET"), ctx({ id }))).text();
    expect(html).toContain("Sealed by the project owner");
    expect(html).not.toContain(`Sealed by ${user}`);
    expect(html).toContain(`<details><summary><small>Audit id</small></summary><small>${user}</small></details>`);
    expect(html).not.toContain("Draft: not signed off");
    const csv = await (await reportCsv(call(user, "GET"), ctx({ id }))).text();
    expect(csv).toContain("Sealed by the project owner");
    expect(csv).not.toContain(`Sealed by ${user}`);
    expect(csv).toContain(`Signer id (audit),${user}`);

    // The owner marks the reshoot done; the seal stays, the item stays unproven.
    const done = await updateReshoot(
      call(user, "PATCH", { status: "done" }),
      ctx({ id: reshootId }),
    );
    expect(done.status).toBe(200);
    expect(
      (
        await updateReshoot(
          call("someone-else", "PATCH", { status: "open" }),
          ctx({ id: reshootId }),
        )
      ).status,
    ).toBe(404);
    const cov = GetCoverageResponseSchema.parse(
      await (await getCoverage(call(user, "GET"), ctx({ id }))).json(),
    );
    expect(cov.seal?.status).toBe("active");
    expect(cov.coverage.totals.proven).toBe(3);

    // Edit one sentence: evidence goes stale, the seal breaks, the report says so.
    const edited = await createScript(
      call(user, "POST", {
        text: (project.scriptVersion?.text ?? "").replace("New Invoice", "Add Invoice"),
      }),
      ctx({ id }),
    );
    expect(edited.status).toBe(201);
    const after = GetCoverageResponseSchema.parse(
      await (await getCoverage(call(user, "GET"), ctx({ id }))).json(),
    );
    expect(after.seal?.status).toBe("broken");
    expect(after.blockers).toContain("stale_evidence");
    expect(await (await reportHtml(call(user, "GET"), ctx({ id }))).text()).toContain(
      "Seal broken: evidence changed after sign-off",
    );
  });

  it("validates the body of a reshoot update", async () => {
    const res = await updateReshoot(
      call("seal-user-4", "PATCH", { status: "finished" }),
      ctx({ id: "x" }),
    );
    expect(res.status).toBe(400);
  });
});
