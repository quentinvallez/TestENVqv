import Link from "next/link";
import { runTool, tools } from "@viewing/core";
import { Users } from "lucide-react";
import { Avatar, EmptyState, PageHeader, Pill, StatusDot } from "@/components/ui";
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
          <>
          <ul className="divide-y divide-line md:hidden">
            {agents.map((a) => (
              <li key={a.id}>
                <Link href={`/agents/${a.id}`} className="flex items-center gap-3 px-4 py-3 active:bg-hover">
                  <Avatar name={a.name} color={a.color} size={32} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-medium">{a.name}</span>
                      {a.source === "website" && <Pill>From website</Pill>}
                    </div>
                    <div className="truncate text-[12px] text-muted">
                      {a.officeName ?? "No office"} · {a.activeListings} listings · {a.upcomingAppointments} viewings
                    </div>
                  </div>
                  <StatusDot color={a.calendarProvider ? "var(--success)" : "var(--line-strong)"} />
                </Link>
              </li>
            ))}
          </ul>
          <table className="hidden w-full min-w-[760px] text-left md:table">
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
                    <Link href={`/agents/${a.id}`} className="group flex items-center gap-2.5">
                      <Avatar name={a.name} color={a.color} size={26} />
                      <span>
                        <span className="flex items-center gap-2">
                          <span className="font-medium group-hover:underline">{a.name}</span>
                          {a.source === "website" && <Pill>From website</Pill>}
                        </span>
                        <span className="block text-[12px] text-muted">{a.email ?? a.phone ?? "No email yet"}</span>
                      </span>
                    </Link>
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
                        Not connected
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </>
        )}
      </div>
    </>
  );
}
