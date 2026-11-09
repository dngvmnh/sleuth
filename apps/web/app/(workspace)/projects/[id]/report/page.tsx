import { ReportView } from "@/features/report/report-view";

export default async function ReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // The key makes a different project start from a clean report.
  return <ReportView key={id} projectId={id} />;
}
