import { RouteLoading } from "@/components/route-loading";

/** Shown while the workspace route loads on the server. */
export default function Loading() {
  return <RouteLoading label="Opening the workspace" layout="workspace" />;
}
