import { OrnamentDivider } from "@/components/ornaments";
import { DashboardHero } from "@/features/dashboard/dashboard-hero";
import { FindingsCabinet } from "@/features/dashboard/findings-cabinet";
import { ProjectList } from "@/features/dashboard/project-list";

/** Dashboard: "The screening room" (brief 007 step 2). */
export default function HomePage() {
  return (
    <div>
      <DashboardHero />

      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <OrnamentDivider glyph="key" className="my-10" />

        <section id="projects" aria-labelledby="projects-heading" className="scroll-mt-6">
          <p className="eyebrow">Recent cuts</p>
          <h2 id="projects-heading" className="mt-2 font-display text-3xl text-foreground">
            Projects
          </h2>
          <div className="mt-5">
            <ProjectList />
          </div>
        </section>

        <OrnamentDivider className="my-10" />

        <section id="findings-guide" aria-labelledby="legend-heading" className="scroll-mt-6 pb-6">
          <p className="eyebrow">The findings guide</p>
          <h2 id="legend-heading" className="mt-2 font-display text-3xl text-foreground">
            A cabinet of <em className="italic text-primary">findings</em>.
          </h2>
          <p className="mt-2 max-w-2xl text-sm text-muted">
            What each finding means, how the check finds it and how to clear it. Pick one to read about it.
          </p>
          <div className="mt-6">
            <FindingsCabinet />
          </div>
        </section>
      </div>
    </div>
  );
}
