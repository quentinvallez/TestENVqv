import { BarChart3 } from "lucide-react";
import { EmptyState, PageHeader } from "@/components/ui";
import { getT } from "@/lib/i18n/server";

export default async function ReportsPage() {
  const t = await getT();
  return (
    <>
      <PageHeader crumbs={[{ label: t("Reports") }]} />
      <EmptyState
        icon={<BarChart3 className="size-5" />}
        title={t("Reports are on the way")}
        description={t("Lead response times, viewing-to-offer conversion and agent workload, once the planner has data to report on.")}
      />
    </>
  );
}
