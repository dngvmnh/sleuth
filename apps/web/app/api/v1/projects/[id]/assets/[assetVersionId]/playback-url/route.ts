import { endpoint } from "../../../../../../_lib/api";

export const dynamic = "force-dynamic";

export const GET = endpoint("getPlaybackUrl", async ({ actor, store, params }) =>
  store.getPlaybackUrl(actor, params.id ?? "", params.assetVersionId ?? ""),
);
