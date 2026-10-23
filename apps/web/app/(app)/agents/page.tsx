import { runTool, tools } from "@viewing/core";
import { Users } from "lucide-react";
import { Avatar, EmptyState, PageHeader, StatusDot } from "@/components/ui";
import { getToolContext } from "@/lib/context";

export default async function AgentsPage() {
  const agents = await runTool(tools.listAgents, await getToolContext(), {});
  return (
    <>
      <PageHeader crumbs={[{ label: "Agents" }]} />
      <div className="flex-1 overflow-auto">
        {agents.length === 0 ? (
          <EmptyState icon={<Users className="size-5" />} title="No agents" description="Add the agents whose calendars the planner should fill." />
        ) : (
          <table className="w-full min-w-[760px] text-left">
            <thead className="sticky top-0 bg-panel text-[12px] text-muted">
              <tr className="border-b border-line">
                <th className="py-2 pr-3 pl-5 font-normal">Agent</th>
                <th className="px-3 font-normal">Office</th>
                <th className="px-3 font-normal">Active listings</th>
                <th className="px-3 font-normal">Upcoming viewings</th>
                <th className="py-2 pr-5 pl-3 font-normal">Calendar</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {agents.map((a) => (
                <tr key={a.id}>
                  <td className="py-2.5 pr-3 pl-5">
                    <span className="flex items-center gap-2.5">
                      <Avatar name={a.name} color={a.color} size={26} />
                      <span>
                        <span className="block font-medium">{a.name}</span>
                        <span className="block text-[12px] text-muted">{a.email}</span>
                      </span>
                    </span>
                  </td>
                  <td className="px-3 text-muted">{a.officeName ?? "—"}</td>
                  <td className="px-3 tabular-nums">{a.activeListings}</td>
                  <td className="px-3 tabular-nums">{a.upcomingAppointments}</td>
                  <td className="py-2.5 pr-5 pl-3">
                    {a.calendarProvider ? (
                      <span className="flex items-center gap-1.5">
                        <StatusDot color="var(--success)" />
                        {a.calendarProvider === "google" ? "Google Calendar" : "Outlook"}
                      </span>
                    ) : (
                      <span className="flex items-center gap-1.5 text-muted">
                        <StatusDot color="var(--line-strong)" />
                        Not connected · Phase 1
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
