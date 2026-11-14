import Link from "next/link";
import { PanelCorners } from "@/components/ornaments";

/** 404: "A locked door". The heading is themed; the line under it says plainly what happened. */
export default function NotFound() {
  return (
    <main id="main-content" className="mx-auto max-w-xl px-4 py-16 sm:px-6">
      <div className="panel p-8 text-center">
        <PanelCorners />
        <p className="eyebrow justify-center">A locked door</p>
        <h1 className="mt-3 font-display text-4xl text-foreground">
          This room is <em className="italic text-primary">empty</em>.
        </h1>
        <p className="mt-3 text-muted">We could not find that page.</p>
        <p className="mt-1 text-sm text-muted">It may have moved, or the project may have been deleted.</p>
        <Link
          href="/"
          className="sleuth-flicker mt-6 inline-flex min-h-11 items-center rounded-[2px] bg-primary px-5 text-sm font-semibold text-on-primary hover:bg-primary-strong"
        >
          Back to the dashboard
        </Link>
      </div>
    </main>
  );
}
