import { runTool, tools } from "@viewing/core";
import { PageHeader } from "@/components/ui";
import { getToolContext } from "@/lib/context";
import { LeadBoard } from "./board";

export default async function LeadsPage() {
  const leads = await runTool(tools.listLeads, await getToolContext(), {});
  return (
    <>
      <PageHeader crumbs={[{ label: "Leads" }]} actions={<span className="text-[12px] text-muted">Drag cards to move them</span>} />
      <div className="min-h-0 flex-1">
        <LeadBoard leads={leads} />
      </div>
    </>
  );
}
