import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { StoreError, type Actor, type ProjectStore } from "./store";

/**
 * Behaviour every ProjectStore must have, whatever sits behind it. The fixture store runs this
 * today (`fixture/store.test.ts`); the Supabase store runs the same suite once it exists, so the
 * two cannot drift apart. Not exported from the package index: it imports Vitest.
 *
 * Covers ingestion requirements 1.2, 1.3, 1.4, 1.5, 2.2, 2.3, 3.2, 3.4, 4.2, 4.3.
 */
export interface ContractOptions {
  /** User id for test user n. Default `contract-user-n`; a real database needs UUIDs. */
  userId?: (n: number) => string;
  /** Cap on property runs. A remote database is slow, so it runs fewer. */
  maxRuns?: number;
}

export function runStoreContract(
  name: string,
  makeStore: () => ProjectStore | Promise<ProjectStore>,
  options: ContractOptions = {},
) {
  const DEMO = "proofpay-demo";
  const user = (n: number): Actor => ({ userId: options.userId?.(n) ?? `contract-user-${n}` });
  const runs = (n: number) => Math.min(n, options.maxRuns ?? n);
  const anon: Actor = { userId: null };

  async function refused(p: Promise<unknown>): Promise<StoreError> {
    try {
      await p;
    } catch (e) {
      if (e instanceof StoreError) return e;
      throw e;
    }
    throw new Error("expected the store to refuse this call");
  }

  /** A project with a video and a script, ready for analysis. */
  async function readyProject(
    store: ProjectStore,
    actor: Actor,
    script = "First step here.\nSecond step here.",
  ) {
    const project = await store.createProject(actor, { name: "Contract project" });
    await store.createUploadUrl(actor, project.id, {
      fileName: "a.mp4",
      mimeType: "video/mp4",
      sizeBytes: 1000,
      durationMs: 30_000,
    });
    await store.createScript(actor, project.id, script);
    return project;
  }

  describe(`${name}: project isolation`, () => {
    it("lists only the demo and the caller's own projects, for any mix of users [PBT 1.3]", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(fc.integer({ min: 0, max: 3 }), { minLength: 1, maxLength: 8 }),
          async (owners) => {
            const store = await makeStore();
            const created = new Map<number, string[]>();
            for (const o of owners) {
              const p = await store.createProject(user(o), { name: `p${o}` });
              created.set(o, [...(created.get(o) ?? []), p.id]);
            }
            for (let u = 0; u < 4; u++) {
              const ids = (await store.listProjects(user(u))).map((p) => p.id).sort();
              expect(ids).toEqual([DEMO, ...(created.get(u) ?? [])].sort());
            }
            expect((await store.listProjects(anon)).map((p) => p.id)).toEqual([DEMO]);
          },
        ),
        { numRuns: runs(25) },
      );
    });

    it("answers 404, not 403, when someone asks for another user's project [1.4]", async () => {
      const store = await makeStore();
      const mine = await store.createProject(user(1), { name: "Private" });
      for (const stranger of [user(2), anon]) {
        expect((await refused(store.getProjectDetail(stranger, mine.id))).status).toBe(404);
        expect((await refused(store.listEvidence(stranger, mine.id))).status).toBe(404);
        expect((await refused(store.listFindings(stranger, mine.id))).status).toBe(404);
      }
    });

    it("lets a stranger neither write to nor start work on another user's project", async () => {
      const store = await makeStore();
      const mine = await readyProject(store, user(1));
      expect((await refused(store.createScript(user(2), mine.id, "Hijack."))).status).toBe(404);
      expect((await refused(store.startAnalysis(user(2), mine.id, {}))).status).toBe(404);
    });

    it("needs a signed-in user to create a project [1.2]", async () => {
      const store = await makeStore();
      expect((await refused(store.createProject(anon, { name: "x" }))).status).toBe(401);
    });

    it("refuses every write to the demo project, for everyone [1.5]", async () => {
      const store = await makeStore();
      for (const who of [user(1), anon]) {
        expect((await refused(store.createScript(who, DEMO, "Nope."))).code).toBe("demo_read_only");
        expect((await refused(store.setChecklist(who, DEMO, ["x"]))).code).toBe("demo_read_only");
        expect((await refused(store.startAnalysis(who, DEMO, {}))).code).toBe("demo_read_only");
      }
    });

    it("serves the demo to a visitor who is not signed in [1.6]", async () => {
      const store = await makeStore();
      expect((await store.getProjectDetail(anon, DEMO)).project.isDemo).toBe(true);
    });

    it("lists the demo first, then projects by last change, newest first [review-workspace 1.2]", async () => {
      const store = await makeStore();
      const tick = () => new Promise((r) => setTimeout(r, 15));
      const older = await store.createProject(user(1), { name: "older" });
      await tick();
      const newer = await store.createProject(user(1), { name: "newer" });
      expect(Date.parse(newer.updatedAt)).toBeGreaterThanOrEqual(Date.parse(newer.createdAt));
      const order = async () => (await store.listProjects(user(1))).map((p) => p.id);
      expect(await order()).toEqual([DEMO, newer.id, older.id]);

      await tick();
      await store.setChecklist(user(1), older.id, ["Show the export"]);
      const changed = (await store.getProjectDetail(user(1), older.id)).project;
      expect(Date.parse(changed.updatedAt)).toBeGreaterThan(Date.parse(changed.createdAt));
      expect(await order()).toEqual([DEMO, older.id, newer.id]);

      // A refused write is not a change.
      await tick();
      await refused(
        store.createUploadUrl(user(1), newer.id, {
          fileName: "v.mp4",
          mimeType: "video/mp4",
          sizeBytes: 1000,
          durationMs: -1,
        }),
      );
      expect(await order()).toEqual([DEMO, older.id, newer.id]);
    });
  });

  describe(`${name}: playback URLs`, () => {
    it("answers url null for the demo, to anyone, signed in or not", async () => {
      const store = await makeStore();
      const demo = await store.getProjectDetail(anon, DEMO);
      const assetId = demo.assetVersion?.id as string;
      for (const actor of [anon, user(1)]) {
        expect(await store.getPlaybackUrl(actor, DEMO, assetId)).toEqual({
          url: null,
          expiresAt: null,
        });
      }
    });

    it("never gives another user or a visitor anything for a private project, not even existence", async () => {
      const store = await makeStore();
      const p = await store.createProject(user(1), { name: "p" });
      const { assetVersion } = await store.createUploadUrl(user(1), p.id, {
        fileName: "v.mp4",
        mimeType: "video/mp4",
        sizeBytes: 1000,
        durationMs: 1000,
      });
      for (const actor of [user(2), anon]) {
        const err = await refused(store.getPlaybackUrl(actor, p.id, assetVersion.id));
        expect([err.status, err.code]).toEqual([404, "not_found"]);
      }
      const own = await store.getPlaybackUrl(user(1), p.id, assetVersion.id);
      expect(own.url === null ? own.expiresAt : typeof own.expiresAt).toBe(
        own.url === null ? null : "string",
      );
    });

    it("refuses an unknown version and a version that belongs to another project", async () => {
      const store = await makeStore();
      const a = await store.createProject(user(1), { name: "a" });
      const b = await store.createProject(user(1), { name: "b" });
      const { assetVersion } = await store.createUploadUrl(user(1), a.id, {
        fileName: "v.mp4",
        mimeType: "video/mp4",
        sizeBytes: 1000,
        durationMs: 1000,
      });
      expect((await refused(store.getPlaybackUrl(user(1), a.id, "av-nope"))).status).toBe(404);
      expect((await refused(store.getPlaybackUrl(user(1), b.id, assetVersion.id))).status).toBe(
        404,
      );
    });

    it("gives a URL only to the owner of a private project [PBT]", async () => {
      const store = await makeStore();
      const p = await store.createProject(user(1), { name: "p" });
      const { assetVersion } = await store.createUploadUrl(user(1), p.id, {
        fileName: "v.mp4",
        mimeType: "video/mp4",
        sizeBytes: 1000,
        durationMs: 1000,
      });
      const demo = await store.getProjectDetail(anon, DEMO);
      const targets = [
        { projectId: DEMO, assetId: demo.assetVersion?.id as string, demo: true },
        { projectId: p.id, assetId: assetVersion.id, demo: false },
      ];
      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom<"owner" | "other" | "visitor">("owner", "other", "visitor"),
          fc.constantFrom(...targets),
          async (who, target) => {
            const actor = who === "owner" ? user(1) : who === "other" ? user(2) : anon;
            const call = store.getPlaybackUrl(actor, target.projectId, target.assetId);
            if (!target.demo && who !== "owner") {
              expect((await refused(call)).status).toBe(404);
              return;
            }
            const out = await call;
            if (target.demo) expect(out).toEqual({ url: null, expiresAt: null });
            else expect(out.url === null).toBe(out.expiresAt === null);
          },
        ),
        { numRuns: runs(30) },
      );
    });
  });

  describe(`${name}: asset versions`, () => {
    it("numbers uploads 1..n with no gaps, per project [PBT 2.3]", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(fc.integer({ min: 0, max: 180_000 }), { minLength: 1, maxLength: 8 }),
          async (durations) => {
            const store = await makeStore();
            const a = await store.createProject(user(1), { name: "a" });
            const b = await store.createProject(user(1), { name: "b" });
            const versionsA: number[] = [];
            for (const durationMs of durations) {
              const out = await store.createUploadUrl(user(1), a.id, {
                fileName: "v.mp4",
                mimeType: "video/mp4",
                sizeBytes: 1000,
                durationMs,
              });
              versionsA.push(out.assetVersion.version);
            }
            expect(versionsA).toEqual(durations.map((_, i) => i + 1));
            // The other project starts again at 1.
            const first = await store.createUploadUrl(user(1), b.id, {
              fileName: "v.mp4",
              mimeType: "video/mp4",
              sizeBytes: 1000,
              durationMs: 1,
            });
            expect(first.assetVersion.version).toBe(1);
          },
        ),
        { numRuns: runs(25) },
      );
    });

    it("rejects any duration outside 0..180000 ms and creates nothing [PBT 2.2]", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.oneof(
            fc.integer({ min: -1_000_000, max: -1 }),
            fc.integer({ min: 180_001, max: 5_000_000 }),
          ),
          async (durationMs) => {
            const store = await makeStore();
            const p = await store.createProject(user(1), { name: "p" });
            const err = await refused(
              store.createUploadUrl(user(1), p.id, {
                fileName: "v.mp4",
                mimeType: "video/mp4",
                sizeBytes: 1000,
                durationMs,
              }),
            );
            expect(err.status).toBe(400);
            const ok = await store.createUploadUrl(user(1), p.id, {
              fileName: "v.mp4",
              mimeType: "video/mp4",
              sizeBytes: 1000,
              durationMs: 1000,
            });
            expect(ok.assetVersion.version).toBe(1);
          },
        ),
        { numRuns: runs(25) },
      );
    });

    it("rejects any size outside 1..52428800 bytes and creates nothing", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.oneof(
            fc.integer({ min: -1_000_000, max: 0 }),
            fc.integer({ min: 52_428_801, max: 500_000_000 }),
          ),
          async (sizeBytes) => {
            const store = await makeStore();
            const p = await store.createProject(user(1), { name: "p" });
            const err = await refused(
              store.createUploadUrl(user(1), p.id, {
                fileName: "v.mp4",
                mimeType: "video/mp4",
                sizeBytes,
                durationMs: 1000,
              }),
            );
            expect(err.status).toBe(400);
            const ok = await store.createUploadUrl(user(1), p.id, {
              fileName: "v.mp4",
              mimeType: "video/mp4",
              sizeBytes: 52_428_800,
              durationMs: 1000,
            });
            expect(ok.assetVersion.version).toBe(1);
          },
        ),
        { numRuns: runs(15) },
      );
    });

    it("gives upload URLs that expire within five minutes and carry no secret", async () => {
      const store = await makeStore();
      const p = await store.createProject(user(1), { name: "p" });
      const out = await store.createUploadUrl(user(1), p.id, {
        fileName: "v.mp4",
        mimeType: "video/mp4",
        sizeBytes: 1000,
        durationMs: 1000,
      });
      const ttl = Date.parse(out.expiresAt) - Date.now();
      expect(ttl).toBeLessThanOrEqual(5 * 60_000 + 5_000);
      expect(JSON.stringify(out).toLowerCase()).not.toMatch(/service[_-]?role|secret|apikey/);
    });
  });

  describe(`${name}: script versions`, () => {
    const POOL = [
      "Open the app",
      "Create an invoice",
      "Pick a client",
      "Enter the amount",
      "Press save",
      "Review totals",
      "Send it out",
      "Close the app",
    ];
    const versionArb = fc.uniqueArray(fc.integer({ min: 0, max: POOL.length - 1 }), {
      minLength: 1,
      maxLength: 6,
    });

    it("never gives a new segment an id that an earlier version used [PBT 3.2]", async () => {
      await fc.assert(
        fc.asyncProperty(fc.array(versionArb, { minLength: 2, maxLength: 7 }), async (versions) => {
          const store = await makeStore();
          const p = await store.createProject(user(1), { name: "p" });
          const everUsed = new Set<string>();
          let previous = new Set<string>();
          for (const picks of versions) {
            const text = picks.map((i) => POOL[i]).join(".\n") + ".";
            const { scriptVersion } = await store.createScript(user(1), p.id, text);
            const ids = scriptVersion.segments.map((s) => s.id);
            expect(new Set(ids).size).toBe(ids.length);
            for (const id of ids) {
              if (!previous.has(id)) expect(everUsed.has(id), `id ${id} was reused`).toBe(false);
            }
            ids.forEach((id) => everUsed.add(id));
            previous = new Set(ids);
          }
        }),
        { numRuns: runs(30) },
      );
    });

    it("keeps the id of a sentence that is edited in place and keeps old versions' ids reserved", async () => {
      const store = await makeStore();
      const p = await store.createProject(user(1), { name: "p" });
      const v1 = await store.createScript(user(1), p.id, "Alpha step.\nBeta step.");
      const v2 = await store.createScript(user(1), p.id, "Alpha step.");
      const v3 = await store.createScript(user(1), p.id, "Alpha step.\nFresh step.");
      expect(v1.scriptVersion.segments.map((s) => s.id)).toEqual(["seg-1", "seg-2"]);
      expect(v2.scriptVersion.segments.map((s) => s.id)).toEqual(["seg-1"]);
      expect(v3.scriptVersion.segments.map((s) => s.id)).toEqual(["seg-1", "seg-3"]);
    });
  });

  describe(`${name}: checklist`, () => {
    it("replaces the whole list and numbers positions 0..n-1 [PBT 3.4]", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(fc.stringMatching(/^[a-z]{1,12}$/), { minLength: 1, maxLength: 50 }),
          fc.array(fc.stringMatching(/^[a-z]{1,12}$/), { minLength: 1, maxLength: 50 }),
          async (first, second) => {
            const store = await makeStore();
            const p = await store.createProject(user(1), { name: "p" });
            const a = await store.setChecklist(user(1), p.id, first);
            expect(a.map((c) => c.position)).toEqual(first.map((_, i) => i));
            const b = await store.setChecklist(user(1), p.id, second);
            expect(b.map((c) => c.position)).toEqual(second.map((_, i) => i));
            expect(b.map((c) => c.label)).toEqual(second);
            expect(
              (await store.getProjectDetail(user(1), p.id)).checklist.map((c) => c.label),
            ).toEqual(second);
          },
        ),
        { numRuns: runs(25) },
      );
    });
  });

  describe(`${name}: analysis jobs`, () => {
    it("refuses analysis until the project has a video and a script [4.2]", async () => {
      const store = await makeStore();
      const p = await store.createProject(user(1), { name: "empty" });
      expect((await refused(store.startAnalysis(user(1), p.id, {}))).code).toBe("missing_inputs");
      await store.createUploadUrl(user(1), p.id, {
        fileName: "a.mp4",
        mimeType: "video/mp4",
        sizeBytes: 1000,
        durationMs: 1000,
      });
      expect((await refused(store.startAnalysis(user(1), p.id, {}))).code).toBe("missing_inputs");
    });

    it("queues a job for the current video and script [4.1]", async () => {
      const store = await makeStore();
      const p = await readyProject(store, user(1));
      const detail = await store.getProjectDetail(user(1), p.id);
      const job = await store.startAnalysis(user(1), p.id, {});
      expect(job.status).toBe("queued");
      expect(job.payload.assetVersionId).toBe(detail.assetVersion?.id);
      expect(job.payload.scriptVersionId).toBe(detail.scriptVersion?.id);
    });

    it("returns the same job for repeated identical requests while it is active [PBT 4.3]", async () => {
      await fc.assert(
        fc.asyncProperty(fc.integer({ min: 2, max: 10 }), async (times) => {
          const store = await makeStore();
          const p = await readyProject(store, user(1));
          const ids = new Set<string>();
          for (let i = 0; i < times; i++)
            ids.add((await store.startAnalysis(user(1), p.id, {})).id);
          expect(ids.size).toBe(1);
        }),
        { numRuns: runs(20) },
      );
    });

    it("treats a different set of segments as a different request", async () => {
      const store = await makeStore();
      const p = await readyProject(store, user(1));
      const full = await store.startAnalysis(user(1), p.id, {});
      const one = await store.startAnalysis(user(1), p.id, { segmentIds: ["seg-1"] });
      const oneAgain = await store.startAnalysis(user(1), p.id, { segmentIds: ["seg-1"] });
      expect(one.id).not.toBe(full.id);
      expect(one.kind).toBe("reanalysis");
      expect(oneAgain.id).toBe(one.id);
    });

    it("starts a new job once the video or the script has a new version", async () => {
      const store = await makeStore();
      const p = await readyProject(store, user(1));
      const first = await store.startAnalysis(user(1), p.id, {});
      await store.createScript(user(1), p.id, "First step here.\nSecond step changed.");
      const second = await store.startAnalysis(user(1), p.id, {});
      expect(second.id).not.toBe(first.id);
    });

    it("lets only people who can read the project see its job", async () => {
      const store = await makeStore();
      const p = await readyProject(store, user(1));
      const job = await store.startAnalysis(user(1), p.id, {});
      expect((await store.getJob(user(1), p.id, job.id)).id).toBe(job.id);
      expect((await refused(store.getJob(user(2), p.id, job.id))).status).toBe(404);
    });
  });
}
