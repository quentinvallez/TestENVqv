import Link from "next/link";
import { oauthConfigured, runTool, tools } from "@viewing/core";
import { Users } from "lucide-react";
import { Avatar, EmptyState, PageHeader, Pill, StatusDot } from "@/components/ui";
import { getToolContext } from "@/lib/context";
import { saveAgentAction } from "../actions";
import { AddAgent, AgentEmail } from "./agent-forms";
import { getT } from "@/lib/i18n/server";
import { msg } from "@/lib/i18n";

type Agent = Awaited<ReturnType<typeof tools.listAgents.run>>[number];

/** Connected calendar, or the buttons to connect one; Outlook first, also for personal Microsoft accounts. */
async function CalendarCell({ agent, available }: { agent: Agent; available: { google: boolean; microsoft: boolean } }) {
  const t = await getT();
  if (agent.calendarProvider) {
    return (
      <span className="flex items-center gap-1.5">
        <StatusDot color="var(--success)" />
        {agent.calendarProvider === "google" ? t("Google Calendar") : "Outlook"}
      </span>
    );
  }
  const providers = (["microsoft", "google"] as const).filter((p) => available[p]);
  if (providers.length === 0) {
    return (
      <span className="flex items-center gap-1.5 text-muted">
        <StatusDot color="var(--line-strong)" />
        {t("Not connected")}
      </span>
    );
  }
  return (
    <span className="flex flex-wrap gap-1.5">
      {providers.map((p) => (
        <a key={p} href={`/api/calendar/${p}/start?agentId=${agent.id}`} className="inline-flex h-7 items-center rounded-md border border-line px-2.5 text-[12px] font-medium hover:bg-hover">
          {t("Connect {provider}", { provider: p === "google" ? "Google" : "Outlook" })}
        </a>
      ))}
    </span>
  );
}

/** Can the agent log in: role, invited, or not yet. */
async function LoginCell({ agent }: { agent: Agent }) {
  const t = await getT();
  const { login } = agent;
  if (login.status === "member") {
    return (
      <span className="flex items-center gap-1.5">
        <StatusDot color="var(--success)" />
        {t({ owner: msg("Owner"), admin: msg("Admin"), member: msg("Agent") }[login.role])}
      </span>
    );
  }
  if (login.status === "invited") {
    return (
      <span className="flex items-center gap-1.5 text-muted">
        <StatusDot color={login.expired ? "var(--danger)" : "var(--warning)"} />
        {login.expired ? t("Invitation expired") : t("Invited")}
      </span>
    );
  }
  return (
    <Link href={`/agents/${agent.id}`} className="flex items-center gap-1.5 text-muted hover:text-fg">
      <StatusDot color="var(--line-strong)" />
      {t("No login")}
    </Link>
  );
}

export default async function AgentsPage() {
  const t = await getT();
  const agents = await runTool(tools.listAgents, await getToolContext(), {});
  const available = { google: oauthConfigured("google"), microsoft: oauthConfigured("microsoft") };
  return (
    <>
      <PageHeader crumbs={[{ label: t("Agents") }]} actions={<AddAgent action={saveAgentAction} />} />
      <div className="flex-1 overflow-auto">
        {agents.length === 0 ? (
          <EmptyState icon={<Users className="size-5" />} title={t("No agents")} description={t("Add the agents whose calendars the planner should fill.")} />
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
                      {a.source === "website" && <Pill>{t("From website")}</Pill>}
                    </div>
                    <div className="truncate text-[12px] text-muted">
                      {a.officeName ?? t("No office")} · {t("{n} listings", { n: a.activeListings })} · {t("{n} viewings", { n: a.upcomingAppointments })}
                    </div>
                  </div>
                  <StatusDot color={a.calendarProvider ? "var(--success)" : "var(--line-strong)"} />
                </Link>
                <div className="mt-2 flex flex-col gap-2 pl-11 text-[13px]">
                  <AgentEmail agentId={a.id} email={a.email} action={saveAgentAction} />
                  <LoginCell agent={a} />
                  <CalendarCell agent={a} available={available} />
                </div>
              </li>
            ))}
          </ul>
          <table className="hidden w-full min-w-[860px] text-left md:table">
            <thead className="sticky top-0 bg-panel text-[12px] text-muted">
              <tr className="border-b border-line">
                <th className="py-2 pr-3 pl-5 font-normal">{t("Agent")}</th>
                <th className="px-3 font-normal">{t("Office")}</th>
                <th className="px-3 font-normal">{t("Active listings")}</th>
                <th className="px-3 font-normal">{t("Upcoming viewings")}</th>
                <th className="px-3 font-normal">{t("Login")}</th>
                <th className="py-2 pr-5 pl-3 font-normal">{t("Calendar")}</th>
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
                          {a.source === "website" && <Pill>{t("From website")}</Pill>}
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
                  <td className="px-3 whitespace-nowrap">
                    <LoginCell agent={a} />
                  </td>
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
