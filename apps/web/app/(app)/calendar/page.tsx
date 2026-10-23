import Link from "next/link";
import { AGENCY_TIMEZONE, runTool, startOfZonedDay, tools } from "@viewing/core";
import { ChevronLeft, ChevronRight, Navigation, Phone } from "lucide-react";
import { Avatar, PageHeader } from "@/components/ui";
import { cn } from "@/lib/cn";
import { getToolContext } from "@/lib/context";
import { fullName, formatTime } from "@/lib/format";

const START_HOUR = 8;
const END_HOUR = 20;
const HOUR_PX = 80;

function localMinutes(date: Date) {
  const [h, m] = new Intl.DateTimeFormat("en-GB", { timeZone: AGENCY_TIMEZONE, hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
    .format(date)
    .split(":")
    .map(Number);
  return h! * 60 + m!;
}

export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ week?: string; day?: string }> }) {
  const params = await searchParams;
  const week = Number(params.week ?? 0) || 0;
  const now = new Date();
  // Monday of the selected week, in agency time.
  const weekday = new Intl.DateTimeFormat("en-US", { timeZone: AGENCY_TIMEZONE, weekday: "short" }).format(now);
  const weekdayIndex = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(weekday);
  const days = Array.from({ length: 7 }, (_, i) => startOfZonedDay(now, i - weekdayIndex + week * 7));
  const from = days[0]!;
  const to = startOfZonedDay(now, 7 - weekdayIndex + week * 7);
  const appointments = await runTool(tools.listAppointments, await getToolContext(), { from, to });
  const today = startOfZonedDay(now).getTime();
  // Phones show one day at a time: today in the current week, else Monday.
  const todayIndex = days.findIndex((d) => d.getTime() === today);
  const dayIndex = Math.min(6, Math.max(0, Number(params.day ?? (todayIndex >= 0 ? todayIndex : 0)) || 0));
  const selectedDay = days[dayIndex]!;
  const dayEnd = days[dayIndex + 1]?.getTime() ?? to.getTime();
  const dayItems = appointments.filter((a) => a.startsAt.getTime() >= selectedDay.getTime() && a.startsAt.getTime() < dayEnd);
  const longDay = new Intl.DateTimeFormat("en-GB", { timeZone: AGENCY_TIMEZONE, weekday: "long", day: "numeric", month: "long" }).format(selectedDay);

  const dayLabel = (d: Date) => new Intl.DateTimeFormat("en-GB", { timeZone: AGENCY_TIMEZONE, weekday: "short", day: "numeric" }).format(d);
  const rangeLabel = `${new Intl.DateTimeFormat("en-GB", { timeZone: AGENCY_TIMEZONE, day: "numeric", month: "short" }).format(from)} – ${new Intl.DateTimeFormat("en-GB", { timeZone: AGENCY_TIMEZONE, day: "numeric", month: "short", year: "numeric" }).format(days[6]!)}`;

  return (
    <>
      <PageHeader
        crumbs={[{ label: "Calendar" }]}
        actions={
          <div className="flex items-center gap-1">
            <span className="mr-2 hidden text-muted md:inline">{rangeLabel}</span>
            <Link href={`/calendar?week=${week - 1}`} className="flex size-7 items-center justify-center rounded-md border border-line hover:bg-hover">
              <ChevronLeft className="size-4" />
            </Link>
            <Link href="/calendar" className="flex h-7 items-center rounded-md border border-line px-2.5 hover:bg-hover">
              Today
            </Link>
            <Link href={`/calendar?week=${week + 1}`} className="flex size-7 items-center justify-center rounded-md border border-line hover:bg-hover">
              <ChevronRight className="size-4" />
            </Link>
          </div>
        }
      />
      <div className="flex min-h-0 flex-1 flex-col md:hidden">
        <div className="grid shrink-0 grid-cols-7 gap-1 border-b border-line px-2 py-2">
          {days.map((d, i) => {
            const count = appointments.filter((a) => a.startsAt.getTime() >= d.getTime() && a.startsAt.getTime() < (days[i + 1]?.getTime() ?? to.getTime())).length;
            return (
              <Link
                key={d.getTime()}
                href={`/calendar?week=${week}&day=${i}`}
                className={cn("flex flex-col items-center rounded-lg py-1.5", i === dayIndex ? "bg-primary text-primary-fg" : d.getTime() === today ? "text-fg" : "text-muted")}
              >
                <span className="text-[11px]">{new Intl.DateTimeFormat("en-GB", { timeZone: AGENCY_TIMEZONE, weekday: "narrow" }).format(d)}</span>
                <span className="font-medium tabular-nums">{new Intl.DateTimeFormat("en-GB", { timeZone: AGENCY_TIMEZONE, day: "numeric" }).format(d)}</span>
                <span className={cn("mt-0.5 size-1 rounded-full", count ? (i === dayIndex ? "bg-primary-fg" : "bg-fg") : "bg-transparent")} />
              </Link>
            );
          })}
        </div>
        <div className="flex-1 overflow-y-auto">
          <div className="px-4 pt-4 pb-2 font-medium">
            {longDay}
            <span className="ml-2 font-normal text-muted">
              {dayItems.length} {dayItems.length === 1 ? "viewing" : "viewings"}
            </span>
          </div>
          {dayItems.length === 0 && <p className="px-4 py-8 text-center text-muted">Nothing planned.</p>}
          <ul className="flex flex-col gap-2 px-4 pb-4">
            {dayItems.map((apt) => {
              const place = [apt.listingStreet, apt.listingHouseNumber, apt.listingCity].filter(Boolean).join(" ") || apt.location;
              return (
                <li key={apt.id} className="rounded-lg border border-line bg-panel p-3" style={{ borderLeft: `3px solid ${apt.agentColor ?? "#71717a"}` }}>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold tabular-nums">
                      {formatTime(apt.startsAt)}–{formatTime(apt.endsAt)}
                    </span>
                    <span className="ml-auto flex items-center gap-1.5 text-[12px] text-muted">
                      <Avatar name={apt.agentName} color={apt.agentColor} size={18} />
                      {apt.agentName.split(" ")[0]}
                    </span>
                  </div>
                  <Link href={apt.contactId ? `/contacts/${apt.contactId}` : "#"} className="mt-1 block font-medium">
                    {fullName(apt.contactFirstName, apt.contactLastName)}
                  </Link>
                  <div className="text-muted">{place}</div>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    {apt.contactPhone ? (
                      <a href={`tel:${apt.contactPhone.replace(/\s/g, "")}`} className="flex h-10 items-center justify-center gap-1.5 rounded-md border border-line font-medium">
                        <Phone className="size-4" />
                        Call
                      </a>
                    ) : (
                      <span className="flex h-10 items-center justify-center rounded-md border border-line text-faint">No phone</span>
                    )}
                    <a
                      href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(place ?? "")}`}
                      target="_blank"
                      rel="noreferrer"
                      className="flex h-10 items-center justify-center gap-1.5 rounded-md border border-line font-medium"
                    >
                      <Navigation className="size-4" />
                      Route
                    </a>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
      <div className="hidden flex-1 overflow-auto md:block">
        <div className="min-w-[760px]">
          <div className="sticky top-0 z-10 grid grid-cols-[56px_repeat(7,1fr)] border-b border-line bg-panel">
            <div />
            {days.map((d) => (
              <div key={d.getTime()} className="border-l border-line px-2 py-2 text-[12px]">
                <span className={d.getTime() === today ? "rounded bg-primary px-1.5 py-0.5 font-medium text-primary-fg" : "text-muted"}>{dayLabel(d)}</span>
              </div>
            ))}
          </div>
          <div className="relative grid grid-cols-[56px_repeat(7,1fr)]" style={{ height: (END_HOUR - START_HOUR) * HOUR_PX }}>
            <div className="relative">
              {Array.from({ length: END_HOUR - START_HOUR }, (_, i) => (
                <div key={i} className="absolute right-2 -translate-y-1/2 text-[11px] text-faint tabular-nums" style={{ top: i * HOUR_PX }}>
                  {i > 0 && `${String(START_HOUR + i).padStart(2, "0")}:00`}
                </div>
              ))}
            </div>
            {days.map((d, dayIndex) => {
              const next = days[dayIndex + 1]?.getTime() ?? to.getTime();
              const items = appointments.filter((a) => a.startsAt.getTime() >= d.getTime() && a.startsAt.getTime() < next);
              return (
                <div key={d.getTime()} className="relative border-l border-line">
                  {Array.from({ length: END_HOUR - START_HOUR }, (_, i) => (
                    <div key={i} className="absolute inset-x-0 border-t border-line/70" style={{ top: i * HOUR_PX }} />
                  ))}
                  {items.map((apt) => {
                    const top = ((localMinutes(apt.startsAt) - START_HOUR * 60) / 60) * HOUR_PX;
                    const height = Math.max(((apt.endsAt.getTime() - apt.startsAt.getTime()) / 3600000) * HOUR_PX, 40);
                    return (
                      <Link
                        key={apt.id}
                        href={apt.listingId ? `/listings/${apt.listingId}` : "/appointments"}
                        className="absolute inset-x-1 overflow-hidden rounded-md border-l-2 px-1.5 py-1 text-[11px] leading-4 transition hover:brightness-95"
                        style={{ top, height, borderColor: apt.agentColor ?? "#71717a", background: `color-mix(in srgb, ${apt.agentColor ?? "#71717a"} 12%, var(--panel))` }}
                      >
                        <div className="flex items-center justify-between gap-1">
                          <span className="truncate font-medium">{fullName(apt.contactFirstName, apt.contactLastName)}</span>
                          <Avatar name={apt.agentName} color={apt.agentColor} size={14} />
                        </div>
                        <div className="truncate text-muted">
                          {formatTime(apt.startsAt)} · {apt.listingStreet} {apt.listingHouseNumber}
                        </div>
                      </Link>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </>
  );
}
