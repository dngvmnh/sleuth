import { Workspace } from "@/features/workspace/workspace";

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // The key makes a different project start from a clean workspace.
  return <Workspace key={id} projectId={id} />;
}
