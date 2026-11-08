import { endpoint } from "../../../../_lib/api";

export const dynamic = "force-dynamic";

export const POST = endpoint("setChecklist", async ({ actor, store, params, body }) => ({
  items: await store.setChecklist(
    actor,
    params.id ?? "",
    body.items.map((i) => i.label),
  ),
}));
