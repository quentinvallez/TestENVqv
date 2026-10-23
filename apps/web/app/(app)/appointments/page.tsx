import Link from "next/link";
import { runTool, startOfZonedDay, tools } from "@viewing/core";
import { CalendarCheck } from "lucide-react";
import { Avatar, EmptyState, PageHeader, StatusDot } from "@/components/ui";
import { getToolContext } from "@/lib/context";
import { address, formatDay, formatTime, fullName } from "@/lib/format";
import { appointmentStatusMeta } from "@/lib/labels";

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
          <table className="w-full min-w-[760px] text-left">
            <thead className="sticky top-0 bg-panel text-[12px] text-muted">
              <tr className="border-b border-line">
                <th className="py-2 pr-3 pl-5 font-normal">When</th>
                <th className="px-3 font-normal">Contact</th>
                <th className="px-3 font-normal">Listing</th>
                <th className="px-3 font-normal">Status</th>
                <th className="py-2 pr-5 pl-3 font-normal">Agent</th>
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
                  <td className="py-2.5 pr-5 pl-3">
                    <span className="flex items-center gap-2 whitespace-nowrap">
                      <Avatar name={apt.agentName} color={apt.agentColor} />
                      {apt.agentName}
                    </span>
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
