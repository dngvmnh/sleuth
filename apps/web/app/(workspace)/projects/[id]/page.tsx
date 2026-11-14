import { Workspace } from "@/features/workspace/workspace";

export default async function ProjectPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const { line } = await searchParams;
  // The key makes a different project start from a clean workspace.
  return <Workspace key={id} projectId={id} initialLine={typeof line === "string" ? line : undefined} />;
}
