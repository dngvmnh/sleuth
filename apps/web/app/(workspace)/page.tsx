import { FINDING_LABELS, type FindingType } from "@sleuth/contracts";
import { getStore, VISITOR } from "../api/_lib/data-source";

export const dynamic = "force-dynamic";

const ORDER: FindingType[] = [
  "ghost",
  "phantom_dialogue",
  "cursed_frame",
  "poltergeist",
  "needs_outside_proof",
];

export default async function HomePage() {
  const store = getStore();
  const projects = await store.listProjects(VISITOR);
  const rows = await Promise.all(
    projects.map(async (project) => ({
      project,
      evidence: await store.listEvidence(VISITOR, project.id),
      findings: await store.listFindings(VISITOR, project.id),
    })),
  );

  return (
    <main className="mx-auto max-w-4xl px-6 py-12">
      <h1 className="font-display text-4xl tracking-tight">SLEUTH</h1>
      <p className="mt-2 max-w-2xl text-muted">
        A QA workspace for software demo videos. It checks what you meant to say and show against
        what the video actually has. Every match is a candidate. Only a person confirms it.
      </p>

      <section aria-labelledby="projects-heading" className="mt-10">
        <h2 id="projects-heading" className="font-display text-2xl">
          Projects
        </h2>
        <ul className="mt-4 space-y-3">
          {rows.map(({ project, evidence, findings }) => (
            <li key={project.id} className="rounded-md border border-line bg-surface p-4">
              <a
                className="font-display text-xl text-primary-strong underline-offset-4 hover:underline"
                href={`/api/v1/projects/${project.id}`}
              >
                {project.name}
              </a>
              {project.isDemo ? (
                <span className="ml-3 rounded border border-line px-2 py-0.5 text-xs text-muted">
                  Public demo, read-only
                </span>
              ) : null}
              <p className="mt-2 text-sm text-muted">
                {evidence.length} evidence candidates, {findings.length} findings
              </p>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="legend-heading" className="mt-10">
        <h2 id="legend-heading" className="font-display text-2xl">
          What the findings mean
        </h2>
        <dl className="mt-4 grid gap-3 sm:grid-cols-2">
          {ORDER.map((type) => {
            const label = FINDING_LABELS[type];
            return (
              <div key={type} className="rounded-md border border-line bg-surface p-4">
                <dt className="font-medium">
                  {label.spooky} <span className="text-muted">({label.plain})</span>
                </dt>
                <dd className="mt-1 text-sm text-muted">{label.meaning}</dd>
              </div>
            );
          })}
        </dl>
      </section>
    </main>
  );
}
