import { RouteLoading } from "@/components/route-loading";

/** Shown while the report route loads on the server. */
export default function Loading() {
  return <RouteLoading label="Opening the report" layout="report" />;
}
