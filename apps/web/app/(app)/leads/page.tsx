import { runTool, tools } from "@viewing/core";
import { PageHeader } from "@/components/ui";
import { getToolContext } from "@/lib/context";
import { LeadBoard } from "./board";
import { getT } from "@/lib/i18n/server";

export default async function LeadsPage() {
  const t = await getT();
  const leads = await runTool(tools.listLeads, await getToolContext(), {});
  return (
    <>
      <PageHeader crumbs={[{ label: t("Leads") }]} actions={<span className="hidden text-[12px] text-muted md:inline">{t("Drag cards to move them")}</span>} />
      <div className="min-h-0 flex-1">
        <LeadBoard leads={leads} />
      </div>
    </>
  );
}
