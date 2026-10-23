import Link from "next/link";
import { runTool, tools } from "@viewing/core";
import { ArrowUpRight, CalendarDays, Database, Sparkles } from "lucide-react";
import { AiPill, Avatar, Button, EmptyState, PageHeader, Panel, Stat, StatusDot } from "@/components/ui";
import { getSession, getToolContext } from "@/lib/context";
import { address, formatDay, formatRelative, formatTime, fullName } from "@/lib/format";
import { appointmentStatusMeta, eventLabel } from "@/lib/labels";
import { seedDemoAction } from "./actions";

export default async function DashboardPage() {
  const { user } = await getSession();
  const ctx = await getToolContext();
  const [summary, upcoming, activity, proposals] = await Promise.all([
    runTool(tools.dashboardSummary, ctx, {}),
    runTool(tools.listAppointments, ctx, {}),
    runTool(tools.recentActivity, ctx, { limit: 12 }),
    runTool(tools.listProposals, ctx, {}),
  ]);
  const isEmpty = summary.activeListings === 0 && upcoming.length === 0;
  const firstName = user.name.split(" ")[0];

  return (
    <>
      <PageHeader crumbs={[{ label: "Dashboard" }]} />
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[1100px] px-5 py-6">
          <h1 className="text-[20px] font-semibold tracking-tight">Good to see you, {firstName}</h1>
          <p className="mt-0.5 text-muted">Here is what is happening across your agency.</p>

          {isEmpty ? (
            <Panel className="mt-6">
              <EmptyState
                icon={<Database className="size-5" />}
                title="Your workspace is empty"
                description="Load sample offices, agents, listings, leads and viewings to explore the platform. You can remove them later."
                action={
                  <form action={seedDemoAction}>
                    <Button variant="primary">Load demo data</Button>
                  </form>
                }
              />
            </Panel>
          ) : (
            <>
              <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
                <Stat label="New leads" value={summary.newLeadsThisWeek} hint="Last 7 days" />
                <Stat label="Viewings today" value={summary.viewingsToday} />
                <Stat label="Viewings next 7 days" value={summary.viewingsNext7Days} />
                <Stat label="Active listings" value={summary.activeListings} />
              </div>

              {proposals.length > 0 && (
                <Link href="/inbox?f=drafts" className="mt-3 block">
                  <div className="flex items-center gap-3 rounded-lg border border-ai-line bg-ai-soft px-4 py-3 text-ai transition hover:brightness-[0.98]">
                    <Sparkles className="size-4 shrink-0" />
                    <span className="flex-1">
                      <span className="font-medium">
                        The planner drafted {proposals.length} {proposals.length === 1 ? "reply" : "replies"} for you to check.
                      </span>{" "}
                      <span className="opacity-80">{proposals[0]!.summary}</span>
                    </span>
                    <ArrowUpRight className="size-4 shrink-0" />
                  </div>
                </Link>
              )}

              <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_340px]">
                <section className="min-w-0">
                  <div className="mb-2 flex items-center justify-between">
                    <h2 className="font-medium">Upcoming viewings</h2>
                    <Link href="/calendar" className="text-muted hover:text-fg">
                      Open calendar
                    </Link>
                  </div>
                  <Panel className="divide-y divide-line">
                    {upcoming.length === 0 && (
                      <EmptyState icon={<CalendarDays className="size-5" />} title="No viewings planned" description="Booked viewings appear here." />
                    )}
                    {upcoming.slice(0, 8).map((apt) => (
                      <div key={apt.id} className="flex items-center gap-4 px-4 py-3">
                        <div className="w-[84px] shrink-0">
                          <div className="font-medium tabular-nums">{formatTime(apt.startsAt)}</div>
                          <div className="text-[12px] text-muted">{formatDay(apt.startsAt)}</div>
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="truncate font-medium">{fullName(apt.contactFirstName, apt.contactLastName)}</div>
                          <div className="truncate text-[12px] text-muted">
                            {apt.listingReference} · {address(apt.listingStreet, apt.listingHouseNumber, apt.listingCity)}
                          </div>
                        </div>
                        <span className="hidden items-center gap-1.5 text-[12px] text-muted sm:flex">
                          <StatusDot color={appointmentStatusMeta[apt.status].color} />
                          {appointmentStatusMeta[apt.status].label}
                        </span>
                        <Avatar name={apt.agentName} color={apt.agentColor} />
                      </div>
                    ))}
                  </Panel>
                </section>

                <section className="min-w-0">
                  <h2 className="mb-2 font-medium">Activity</h2>
                  <Panel className="px-4 py-2">
                    {activity.length === 0 && <p className="py-4 text-center text-muted">Nothing yet.</p>}
                    <ol className="relative">
                      {activity.map((event) => (
                        <li key={event.id} className="flex items-start gap-3 py-2">
                          <StatusDot color={event.actorType === "agent" ? "var(--ai)" : "var(--line-strong)"} className="mt-1.5" />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="truncate">{eventLabel[event.type] ?? event.type}</span>
                              {event.type === "message.received" && event.data.intent ? (
                                <AiPill>{String(event.data.intent)}</AiPill>
                              ) : null}
                            </div>
                            <div className="text-[12px] text-faint">
                              {event.actorType === "contact" ? "by client" : event.actorType === "agent" ? "by planner agent" : event.actorType === "user" ? "by you" : "automatic"}
                              {" · "}
                              {formatRelative(event.createdAt)}
                            </div>
                          </div>
                        </li>
                      ))}
                    </ol>
                  </Panel>
                </section>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}
