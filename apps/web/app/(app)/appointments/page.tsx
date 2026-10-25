import Link from "next/link";
import { runTool, startOfZonedDay, tools } from "@viewing/core";
import { CalendarCheck } from "lucide-react";
import { Avatar, EmptyState, PageHeader, StatusDot } from "@/components/ui";
import { cn } from "@/lib/cn";
import { getToolContext } from "@/lib/context";
import { address, formatDay, formatTime, fullName } from "@/lib/format";
import { appointmentStatusMeta } from "@/lib/labels";
import { cancelAppointmentAction, markAttendanceAction } from "../actions";

/** After a viewing started the agent can say whether the client came; viewings nobody marks count as done. */
function Attendance({ apt, now }: { apt: { id: string; status: string; startsAt: Date }; now: Date }) {
  if (apt.startsAt > now || apt.status === "cancelled") return null;
  return (
    <span className="flex justify-end gap-3 text-[12px]">
      {apt.status !== "completed" && (
        <form action={markAttendanceAction.bind(null, apt.id, true)}>
          <button className="py-1 text-muted hover:text-fg">{apt.status === "no_show" ? "Came after all" : "Came"}</button>
        </form>
      )}
      {apt.status !== "no_show" && (
        <form action={markAttendanceAction.bind(null, apt.id, false)}>
          <button className="py-1 text-muted hover:text-danger">No-show</button>
        </form>
      )}
    </span>
  );
}

export default async function AppointmentsPage() {
  const now = new Date();
  const appointments = await runTool(tools.listAppointments, await getToolContext(), {
    from: startOfZonedDay(now, -14),
    to: startOfZonedDay(now, 60),
    includeCancelled: true,
  });

  return (
    <>
      <PageHeader crumbs={[{ label: "Appointments" }]} />
      <div className="flex-1 overflow-auto">
        {appointments.length === 0 ? (
          <EmptyState icon={<CalendarCheck className="size-5" />} title="No appointments" description="Viewings booked by clients or agents appear here." />
        ) : (
          <>
          <ul className="divide-y divide-line md:hidden">
            {appointments.map((apt) => (
              <li key={apt.id} className={cn("flex items-center gap-3 px-4 py-3", apt.startsAt < now && "text-muted")}>
                <div className="w-14 shrink-0 tabular-nums">
                  <div className="font-medium">{formatTime(apt.startsAt)}</div>
                  <div className="text-[11px] text-muted">{formatDay(apt.startsAt)}</div>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{fullName(apt.contactFirstName, apt.contactLastName)}</div>
                  <div className="truncate text-[12px] text-muted">{address(apt.listingStreet, apt.listingHouseNumber, apt.listingCity) || apt.location}</div>
                  <div className="mt-0.5 flex items-center gap-1.5 text-[12px] text-muted">
                    <StatusDot color={appointmentStatusMeta[apt.status].color} className="size-1.5" />
                    {appointmentStatusMeta[apt.status].label}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <Avatar name={apt.agentName} color={apt.agentColor} />
                  <Attendance apt={apt} now={now} />
                </div>
              </li>
            ))}
          </ul>
          <table className="hidden w-full min-w-[760px] text-left md:table">
            <thead className="sticky top-0 bg-panel text-[12px] text-muted">
              <tr className="border-b border-line">
                <th className="py-2 pr-3 pl-5 font-normal">When</th>
                <th className="px-3 font-normal">Contact</th>
                <th className="px-3 font-normal">Listing</th>
                <th className="px-3 font-normal">Status</th>
                <th className="px-3 font-normal">Agent</th>
                <th className="py-2 pr-5 pl-3 font-normal" />
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {appointments.map((apt) => (
                <tr key={apt.id} className={apt.startsAt < now ? "text-muted" : undefined}>
                  <td className="py-2.5 pr-3 pl-5 whitespace-nowrap tabular-nums">
                    {formatDay(apt.startsAt)} · {formatTime(apt.startsAt)}
                  </td>
                  <td className="px-3 font-medium">{fullName(apt.contactFirstName, apt.contactLastName)}</td>
                  <td className="px-3">
                    {apt.listingId ? (
                      <Link href={`/listings/${apt.listingId}`} className="hover:underline">
                        {apt.listingReference} · {address(apt.listingStreet, apt.listingHouseNumber, apt.listingCity)}
                      </Link>
                    ) : (
                      apt.location
                    )}
                  </td>
                  <td className="px-3">
                    <span className="flex items-center gap-1.5 whitespace-nowrap">
                      <StatusDot color={appointmentStatusMeta[apt.status].color} />
                      {appointmentStatusMeta[apt.status].label}
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
                        <button className="text-[12px] text-muted hover:text-danger">Cancel</button>
                      </form>
                    )}
                    <Attendance apt={apt} now={now} />
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
