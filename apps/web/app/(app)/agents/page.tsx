import Link from "next/link";
import { oauthConfigured, runTool, tools } from "@viewing/core";
import { Users } from "lucide-react";
import { Avatar, EmptyState, PageHeader, Pill, StatusDot } from "@/components/ui";
import { getToolContext } from "@/lib/context";
import { saveAgentAction } from "../actions";
import { AddAgent, AgentEmail } from "./agent-forms";

type Agent = Awaited<ReturnType<typeof tools.listAgents.run>>[number];

/** Connected calendar, or the buttons to connect one; Outlook first, also for personal Microsoft accounts. */
function CalendarCell({ agent, available }: { agent: Agent; available: { google: boolean; microsoft: boolean } }) {
  if (agent.calendarProvider) {
    return (
      <span className="flex items-center gap-1.5">
        <StatusDot color="var(--success)" />
        {agent.calendarProvider === "google" ? "Google Calendar" : "Outlook"}
      </span>
    );
  }
  const providers = (["microsoft", "google"] as const).filter((p) => available[p]);
  if (providers.length === 0) {
    return (
      <span className="flex items-center gap-1.5 text-muted">
        <StatusDot color="var(--line-strong)" />
        Not connected
      </span>
    );
  }
  return (
    <span className="flex flex-wrap gap-1.5">
      {providers.map((p) => (
        <a key={p} href={`/api/calendar/${p}/start?agentId=${agent.id}`} className="inline-flex h-7 items-center rounded-md border border-line px-2.5 text-[12px] font-medium hover:bg-hover">
          Connect {p === "google" ? "Google" : "Outlook"}
        </a>
      ))}
    </span>
  );
}

export default async function AgentsPage() {
  const agents = await runTool(tools.listAgents, await getToolContext(), {});
  const available = { google: oauthConfigured("google"), microsoft: oauthConfigured("microsoft") };
  return (
    <>
      <PageHeader crumbs={[{ label: "Agents" }]} actions={<AddAgent action={saveAgentAction} />} />
      <div className="flex-1 overflow-auto">
        {agents.length === 0 ? (
          <EmptyState icon={<Users className="size-5" />} title="No agents" description="Add the agents whose calendars the planner should fill." />
        ) : (
          <>
          <ul className="divide-y divide-line md:hidden">
            {agents.map((a) => (
              <li key={a.id} className="px-4 py-3">
                <Link href={`/agents/${a.id}`} className="flex items-center gap-3 active:bg-hover">
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
                <div className="mt-2 flex flex-col gap-2 pl-11 text-[13px]">
                  <AgentEmail agentId={a.id} email={a.email} action={saveAgentAction} />
                  <CalendarCell agent={a} available={available} />
                </div>
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
                    <div className="flex items-center gap-2.5">
                      <Link href={`/agents/${a.id}`}>
                        <Avatar name={a.name} color={a.color} size={26} />
                      </Link>
                      <div className="min-w-0">
                        <Link href={`/agents/${a.id}`} className="flex items-center gap-2">
                          <span className="font-medium hover:underline">{a.name}</span>
                          {a.source === "website" && <Pill>From website</Pill>}
                        </Link>
                        <div className="text-[12px] text-muted">
                          <AgentEmail agentId={a.id} email={a.email} action={saveAgentAction} />
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 text-muted">{a.officeName ?? "—"}</td>
                  <td className="px-3 tabular-nums">{a.activeListings}</td>
                  <td className="px-3 tabular-nums">{a.upcomingAppointments}</td>
                  <td className="py-2.5 pr-5 pl-3">
                    <CalendarCell agent={a} available={available} />
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
