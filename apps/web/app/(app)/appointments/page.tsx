import Link from "next/link";
import { runTool, startOfZonedDay, tools } from "@viewing/core";
import { CalendarCheck, Plus } from "lucide-react";
import { Avatar, EmptyState, PageHeader, StatusDot } from "@/components/ui";
import { cn } from "@/lib/cn";
import { getToolContext } from "@/lib/context";
import { address, fullName } from "@/lib/format";
import type { T } from "@/lib/i18n";
import { getT } from "@/lib/i18n/server";
import { appointmentStatusMeta } from "@/lib/labels";
import { cancelAppointmentAction, markAttendanceAction } from "../actions";

/** After a viewing started the agent can say whether the client came; viewings nobody marks count as done. */
function Attendance({ t, apt, now }: { t: T; apt: { id: string; status: string; startsAt: Date }; now: Date }) {
  if (apt.startsAt > now || apt.status === "cancelled") return null;
  return (
    <span className="flex justify-end gap-3 text-[12px]">
      {apt.status !== "completed" && (
        <form action={markAttendanceAction.bind(null, apt.id, true)}>
          <button className="py-1 text-muted hover:text-fg">{apt.status === "no_show" ? t("Came after all") : t("Came")}</button>
        </form>
      )}
      {apt.status !== "no_show" && (
        <form action={markAttendanceAction.bind(null, apt.id, false)}>
          <button className="py-1 text-muted hover:text-danger">{t("No-show")}</button>
        </form>
      )}
    </span>
  );
}

export default async function AppointmentsPage({ searchParams }: { searchParams: Promise<{ booked?: string }> }) {
  const { booked } = await searchParams;
  const now = new Date();
  const t = await getT();
  const appointments = await runTool(tools.listAppointments, await getToolContext(), {
    from: startOfZonedDay(now, -14),
    to: startOfZonedDay(now, 60),
    includeCancelled: true,
  });

  return (
    <>
      <PageHeader
        crumbs={[{ label: t("Calendar"), href: "/calendar" }, { label: t("All viewings") }]}
        actions={
          <Link href="/appointments/new" className="inline-flex h-7 items-center gap-1.5 rounded-md bg-primary px-2.5 text-[12px] font-medium text-primary-fg hover:opacity-90">
            <Plus className="size-3.5" />
            {t("Book a viewing")}
          </Link>
        }
      />
      <div className="flex-1 overflow-auto">
        {booked && (() => {
          const apt = appointments.find((a) => a.id === booked);
          return apt ? (
            <div className="flex items-center gap-2 border-b border-line px-4 py-2.5 md:px-5">
              <StatusDot color="var(--success)" />
              {t("Booked: {name}, {day} at {time} with {agent}.", { name: fullName(apt.contactFirstName, apt.contactLastName), day: t.day(apt.startsAt), time: t.time(apt.startsAt), agent: apt.agentName })}
            </div>
          ) : null;
        })()}
        {appointments.length === 0 ? (
          <EmptyState icon={<CalendarCheck className="size-5" />} title={t("No appointments")} description={t("Viewings booked by clients or agents appear here.")} />
        ) : (
          <>
          <ul className="divide-y divide-line md:hidden">
            {appointments.map((apt) => (
              <li key={apt.id} className={cn("flex items-center gap-3 px-4 py-3", apt.startsAt < now && "text-muted")}>
                <div className="w-14 shrink-0 tabular-nums">
                  <div className="font-medium">{t.time(apt.startsAt)}</div>
                  <div className="text-[11px] text-muted">{t.day(apt.startsAt)}</div>
                </div>
                <div className="min-w-0 flex-1">
                  {apt.leadId ? (
                    <Link href={`/requests/${apt.leadId}`} className="block truncate font-medium">
                      {fullName(apt.contactFirstName, apt.contactLastName)}
                    </Link>
                  ) : (
                    <div className="truncate font-medium">{fullName(apt.contactFirstName, apt.contactLastName)}</div>
                  )}
                  <div className="truncate text-[12px] text-muted">
                    {address(apt.listingStreet, apt.listingHouseNumber, apt.listingCity) || apt.location}
                    {apt.openHouseId && ` · ${t("open house")}`}
                  </div>
                  <div className="mt-0.5 flex items-center gap-1.5 text-[12px] text-muted">
                    <StatusDot color={appointmentStatusMeta[apt.status].color} className="size-1.5" />
                    {t(appointmentStatusMeta[apt.status].label)}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <Avatar name={apt.agentName} color={apt.agentColor} />
                  <Attendance t={t} apt={apt} now={now} />
                </div>
              </li>
            ))}
          </ul>
          <table className="hidden w-full min-w-[760px] text-left md:table">
            <thead className="sticky top-0 bg-panel text-[12px] text-muted">
              <tr className="border-b border-line">
                <th className="py-2 pr-3 pl-5 font-normal">{t("When")}</th>
                <th className="px-3 font-normal">{t("Contact")}</th>
                <th className="px-3 font-normal">{t("Listing")}</th>
                <th className="px-3 font-normal">{t("Status")}</th>
                <th className="px-3 font-normal">{t("Agent")}</th>
                <th className="py-2 pr-5 pl-3 font-normal" />
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {appointments.map((apt) => (
                <tr key={apt.id} className={apt.startsAt < now ? "text-muted" : undefined}>
                  <td className="py-2.5 pr-3 pl-5 whitespace-nowrap tabular-nums">
                    {t.day(apt.startsAt)} · {t.time(apt.startsAt)}
                  </td>
                  <td className="px-3 font-medium">
                    {apt.leadId ? (
                      <Link href={`/requests/${apt.leadId}`} className="hover:underline">
                        {fullName(apt.contactFirstName, apt.contactLastName)}
                      </Link>
                    ) : (
                      fullName(apt.contactFirstName, apt.contactLastName)
                    )}
                    {apt.answers.length > 0 && <span className="ml-1.5 text-[12px] font-normal text-muted">{apt.answers.length === 1 ? t("1 answer") : t("{n} answers", { n: apt.answers.length })}</span>}
                  </td>
                  <td className="px-3">
                    {apt.listingId ? (
                      <Link href={`/listings/${apt.listingId}`} className="hover:underline">
                        {apt.listingReference} · {address(apt.listingStreet, apt.listingHouseNumber, apt.listingCity)}
                      </Link>
                    ) : (
                      apt.location
                    )}
                    {apt.openHouseId && <span className="ml-1.5 text-[12px] text-muted">{t("open house")}</span>}
                  </td>
                  <td className="px-3">
                    <span className="flex items-center gap-1.5 whitespace-nowrap">
                      <StatusDot color={appointmentStatusMeta[apt.status].color} />
                      {t(appointmentStatusMeta[apt.status].label)}
                    </span>
                  </td>
                  <td className="px-3">
                    <span className="flex items-center gap-2 whitespace-nowrap">
                      <Avatar name={apt.agentName} color={apt.agentColor} />
                      {apt.agentName}
                    </span>
                  </td>
                  <td className="py-2.5 pr-5 pl-3 text-right">
                    {apt.startsAt > now && (apt.status === "scheduled" || apt.status === "confirmed") && (
                      <form action={cancelAppointmentAction.bind(null, apt.id)}>
                        <button className="text-[12px] text-muted hover:text-danger">{t("Cancel")}</button>
                      </form>
                    )}
                    <Attendance t={t} apt={apt} now={now} />
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
