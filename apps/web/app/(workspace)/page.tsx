import { FINDING_LABELS, type FindingType } from "@sleuth/contracts";
import { FINDING_ICONS } from "@/components/icons";
import { ProjectList } from "@/features/dashboard/project-list";

const ORDER: FindingType[] = [
  "ghost",
  "phantom_dialogue",
  "cursed_frame",
  "poltergeist",
  "needs_outside_proof",
];

export default function HomePage() {
  return (
    <div className="mx-auto max-w-4xl px-6 py-12">
      <p className="text-xs font-medium uppercase tracking-widest text-spectral">QA for demo videos</p>
      <h1 className="mt-1 font-display text-5xl tracking-tight">SLEUTH</h1>
      <p className="mt-1 font-display text-2xl italic text-gold">Find what your demo forgot to show.</p>
      <p className="mt-3 max-w-2xl text-muted">
        A QA workspace for software demo videos. It checks what you meant to say and show against
        what the video actually has. Every match is a candidate. Only a person confirms it.
      </p>

      <section aria-labelledby="projects-heading" className="mt-10">
        <h2 id="projects-heading" className="font-display text-2xl">
          Projects
        </h2>
        <div className="mt-4">
          <ProjectList />
        </div>
      </section>

      <section aria-labelledby="legend-heading" className="mt-10">
        <h2 id="legend-heading" className="font-display text-2xl">
          What the findings mean
        </h2>
        <dl className="mt-4 grid gap-3 sm:grid-cols-2">
          {ORDER.map((type) => {
            const label = FINDING_LABELS[type];
            const FindingIcon = FINDING_ICONS[type];
            return (
              <div key={type} className="rounded-md border border-line bg-surface p-4">
                <dt className="flex items-center gap-2 font-medium">
                  <FindingIcon size={20} />
                  <span>
                    {label.spooky} <span className="text-muted">({label.plain})</span>
                  </span>
                </dt>
                <dd className="mt-1 text-sm text-muted">{label.meaning}</dd>
              </div>
            );
          })}
        </dl>
      </section>
    </div>
  );
}
