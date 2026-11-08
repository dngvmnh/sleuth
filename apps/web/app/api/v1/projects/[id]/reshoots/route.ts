import { endpoint } from "../../../../_lib/api";

export const dynamic = "force-dynamic";

export const GET = endpoint("listReshoots", async ({ actor, store, params }) => ({
  reshoots: await store.listReshoots(actor, params.id ?? ""),
}));

export const POST = endpoint("createReshoot", async ({ actor, store, params, body }) => ({
  reshoot: await store.createReshoot(actor, params.id ?? "", body),
}));
