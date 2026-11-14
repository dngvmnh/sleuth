import { PanelCorners } from "@/components/ornaments";
import styles from "./route-loading.module.css";

function Bar({ className }: { className: string }) {
  return <div aria-hidden="true" className={`rounded-[2px] bg-raised ${styles.shimmer} ${className}`} />;
}

function Panel({ lines, className = "" }: { lines: string[]; className?: string }) {
  return (
    <div className={`panel space-y-3 p-5 ${className}`} aria-hidden="true">
      <PanelCorners />
      {lines.map((w, i) => (
        <Bar key={i} className={`${i === 0 ? "h-6" : "h-3"} ${w}`} />
      ))}
    </div>
  );
}

/**
 * Route-level loading screen (Next.js `loading.tsx`): forest-panel skeletons in the shape of the
 * page that is coming. The shimmer is slow (2.4 s) and stops under reduced motion.
 */
export function RouteLoading({ label, layout }: { label: string; layout: "workspace" | "report" }) {
  return (
    <div role="status" aria-label={label} className="mx-auto max-w-6xl space-y-6 px-4 py-10 sm:px-6">
      <div className="space-y-3" aria-hidden="true">
        <Bar className="h-3 w-48" />
        <Bar className="h-10 w-2/3 max-w-xl" />
        <Bar className="h-5 w-56" />
      </div>
      {layout === "workspace" ? (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <div className="space-y-6">
            <Panel lines={["w-40", "w-full", "w-5/6", "w-2/3"]} />
            <Panel lines={["w-32", "w-full", "w-3/4"]} className="min-h-48" />
          </div>
          <Panel lines={["w-28", "w-3/4", "w-full", "w-5/6", "w-1/2"]} />
        </div>
      ) : (
        <div className="space-y-6">
          <Panel lines={["w-40", "w-2/3", "w-1/2"]} className="min-h-40" />
          <Panel lines={["w-32", "w-full", "w-full", "w-full", "w-3/4"]} />
        </div>
      )}
      <span className="sr-only">{label}…</span>
    </div>
  );
}
