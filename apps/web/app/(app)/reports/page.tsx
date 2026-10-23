import { BarChart3 } from "lucide-react";
import { EmptyState, PageHeader } from "@/components/ui";

export default function ReportsPage() {
  return (
    <>
      <PageHeader crumbs={[{ label: "Reports" }]} />
      <EmptyState
        icon={<BarChart3 className="size-5" />}
        title="Reports are on the way"
        description="Lead response times, viewing-to-offer conversion and agent workload, once the planner has data to report on."
      />
    </>
  );
}
