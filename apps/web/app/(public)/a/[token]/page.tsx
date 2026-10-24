import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { runTool, tools } from "@viewing/core";
import { appointmentByManageToken, publicContext } from "@viewing/core/public";
import { CalendarCheck, CalendarX2, Check, Clock, MapPin, UserRound } from "lucide-react";
import { BookingShell } from "@/components/booking/shell";
import { RescheduleForm } from "@/components/booking/reschedule-form";
import { formatDay, formatTime } from "@/lib/format";
import { groupSlotsByDay } from "@/lib/slots";
import { cancelByTokenAction, rescheduleByTokenAction } from "../../actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Your viewing", robots: { index: false } };

export default async function ManagePage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ booked?: string; moved?: string; change?: string }>;
}) {
  const { token } = await params;
  const query = await searchParams;
  const found = await appointmentByManageToken(token);
  if (!found) notFound();
  const { appointment, listing, agentName, agencyName, branding } = found;
  const cancelled = appointment.status === "cancelled";
  const upcoming = ["scheduled", "confirmed"].includes(appointment.status) && appointment.startsAt > new Date();

  const reschedule =
    query.change && upcoming
      ? await runTool(tools.availableSlots, publicContext(appointment.agencyId), { agentId: appointment.agentId, days: 14, excludeAppointmentId: appointment.id })
      : null;

  const heading = cancelled
    ? "Your viewing is cancelled"
    : query.booked
      ? "Your viewing is booked"
      : query.moved
        ? "Your viewing has moved"
        : "Your viewing";

  return (
    <BookingShell agencyName={agencyName} branding={branding}>
      <div className="p-5">
        <div className="flex items-center gap-3">
          <span
            className={
              cancelled
                ? "flex size-9 items-center justify-center rounded-full bg-hover text-muted"
                : "flex size-9 items-center justify-center rounded-full bg-[var(--brand)] text-[var(--brand-fg)]"
            }
          >
            {cancelled ? <CalendarX2 className="size-4" /> : query.booked || query.moved ? <Check className="size-4" /> : <CalendarCheck className="size-4" />}
          </span>
          <h1 className="text-[17px] font-semibold tracking-tight">{heading}</h1>
        </div>

        <ul className={`mt-5 flex flex-col gap-2.5 ${cancelled ? "text-muted line-through" : ""}`}>
          <li className="flex items-center gap-2.5">
            <Clock className="size-4 text-muted" />
            {formatDay(appointment.startsAt)} at {formatTime(appointment.startsAt)}
          </li>
          <li className="flex items-center gap-2.5">
            <MapPin className="size-4 text-muted" />
            {appointment.location ?? listing?.city}
          </li>
          <li className="flex items-center gap-2.5">
            <UserRound className="size-4 text-muted" />
            With {agentName}
          </li>
        </ul>

        {query.booked && !cancelled && (
          <p className="mt-5 rounded-lg bg-hover px-3 py-2.5 text-muted">
            Keep this page: you can use it to change or cancel your viewing.
          </p>
        )}

        {upcoming && !reschedule && (
          <div className="mt-5 flex gap-2">
            <Link
              href={`/a/${token}?change=1`}
              className="flex h-10 flex-1 items-center justify-center rounded-md border border-line font-medium hover:bg-hover"
            >
              Change time
            </Link>
            <form action={cancelByTokenAction.bind(null, token)} className="flex-1">
              <button className="h-10 w-full rounded-md border border-line font-medium text-danger hover:bg-hover">Cancel viewing</button>
            </form>
          </div>
        )}

        {reschedule && (
          <div className="mt-6 border-t border-line pt-5">
            <h2 className="mb-3 font-medium">Pick a new time</h2>
            <RescheduleForm days={groupSlotsByDay(reschedule.slots)} action={rescheduleByTokenAction.bind(null, token)} />
            <Link href={`/a/${token}`} className="mt-3 block text-center text-muted hover:text-fg">
              Keep my current time
            </Link>
          </div>
        )}

        {cancelled && listing && (
          <Link
            href={`/book/${listing.id}`}
            className="mt-5 flex h-10 items-center justify-center rounded-md bg-[var(--brand)] font-medium text-[var(--brand-fg)] hover:opacity-90"
          >
            Book a new time
          </Link>
        )}
      </div>
    </BookingShell>
  );
}
