import Link from "next/link";
import { runTool, tools } from "@viewing/core";
import { CalendarDays, Database } from "lucide-react";
import { Avatar, Button, EmptyState, PageHeader, Panel, Stat, StatusDot } from "@/components/ui";
import { getSession, getToolContext } from "@/lib/context";
import { address, fullName } from "@/lib/format";
import { getT } from "@/lib/i18n/server";
import type { T } from "@/lib/i18n";
import { appointmentStatusMeta } from "@/lib/labels";
import { resetDemoAction, seedDemoAction } from "./actions";
import { DemoReset } from "./demo-reset";
import { NotConnected } from "./not-connected";

/** "12 h 30 min", "45 min". */
function formatDuration(t: T, minutes: number) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} min`;
  return m ? `${t.number(h)} h ${m} min` : `${t.number(h)} h`;
}

export default async function DashboardPage() {
  const { user, isAdmin } = await getSession();
  const ctx = await getToolContext();
  const t = await getT();
  const [summary, team, upcoming] = await Promise.all([
    runTool(tools.dashboardSummary, ctx, {}),
    isAdmin ? runTool(tools.listTeamNotConnected, ctx, {}) : null,
    runTool(tools.listAppointments, ctx, {}),
  ]);
  const isEmpty = summary.activeListings === 0 && summary.viewingsPlanned === 0 && upcoming.length === 0;
  const firstName = user.name.split(" ")[0] ?? user.name;

  return (
    <>
      <PageHeader crumbs={[{ label: t("Dashboard") }]} />
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[1100px] px-5 py-6">
          <h1 className="text-[20px] font-semibold tracking-tight">{t("Good to see you, {name}", { name: firstName })}</h1>

          {isEmpty ? (
            <Panel className="mt-6">
              <EmptyState
                icon={<Database className="size-5" />}
                title={t("Your workspace is empty")}
                description={t("Load sample offices, agents, listings, leads and viewings to explore the platform. You can remove them later.")}
                action={
                  <form action={seedDemoAction}>
                    <Button variant="primary">{t("Load demo data")}</Button>
                  </form>
                }
              />
            </Panel>
          ) : (
            <>
              <div className={team ? "mt-6 grid gap-3 sm:grid-cols-3" : "mt-6 grid gap-3 sm:grid-cols-2"}>
                <Stat label={t("Viewings planned")} value={t.number(summary.viewingsPlanned)} hint={t("{n} still to come", { n: summary.upcomingViewings })} />
                <Stat label={t("Time saved")} value={formatDuration(t, summary.minutesSaved)} hint={t("{n} min per planned viewing", { n: summary.minutesPerViewing })} />
                {team && (
                  <Stat
                    label={t("Not connected")}
                    value={team.agents.length}
                    hint={team.agents.length === 0 ? t("All {n} agents are set up", { n: team.total }) : team.total === 1 ? t("of {n} agent", { n: team.total }) : t("of {n} agents", { n: team.total })}
                  />
                )}
              </div>

              {team && <NotConnected agents={team.agents} />}

              <section className="mt-6 min-w-0">
                <div className="mb-2 flex items-center justify-between">
                  <h2 className="font-medium">{t("Upcoming viewings")}</h2>
                  <Link href="/calendar" className="text-muted hover:text-fg">
                    {t("Open calendar")}
                  </Link>
                </div>
                <Panel className="divide-y divide-line">
                  {upcoming.length === 0 && (
                    <EmptyState icon={<CalendarDays className="size-5" />} title={t("No viewings planned")} description={t("Booked viewings appear here.")} />
                  )}
                  {upcoming.slice(0, 8).map((apt) => (
                    <div key={apt.id} className="flex items-center gap-4 px-4 py-3">
                      <div className="w-[84px] shrink-0">
                        <div className="font-medium tabular-nums">{t.time(apt.startsAt)}</div>
                        <div className="text-[12px] text-muted">{t.day(apt.startsAt)}</div>
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-medium">{fullName(apt.contactFirstName, apt.contactLastName)}</div>
                        <div className="truncate text-[12px] text-muted">
                          {apt.listingReference} · {address(apt.listingStreet, apt.listingHouseNumber, apt.listingCity)}
                        </div>
                      </div>
                      <span className="hidden items-center gap-1.5 text-[12px] text-muted sm:flex">
                        <StatusDot color={appointmentStatusMeta[apt.status].color} />
                        {t(appointmentStatusMeta[apt.status].label)}
                      </span>
                      <Avatar name={apt.agentName} color={apt.agentColor} />
                    </div>
                  ))}
                </Panel>
              </section>

              <div className="mt-8 flex flex-col gap-2 border-t border-line pt-4 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-[12px] text-muted">{t("Showing a demo or starting over? Load the sample agency again.")}</p>
                <DemoReset action={resetDemoAction} />
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}
