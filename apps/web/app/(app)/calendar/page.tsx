import Link from "next/link";
import { AGENCY_TIMEZONE, runTool, startOfZonedDay, tools } from "@viewing/core";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Avatar, PageHeader } from "@/components/ui";
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

export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ week?: string }> }) {
  const week = Number((await searchParams).week ?? 0) || 0;
  const now = new Date();
  // Monday of the selected week, in agency time.
  const weekday = new Intl.DateTimeFormat("en-US", { timeZone: AGENCY_TIMEZONE, weekday: "short" }).format(now);
  const weekdayIndex = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(weekday);
  const days = Array.from({ length: 7 }, (_, i) => startOfZonedDay(now, i - weekdayIndex + week * 7));
  const from = days[0]!;
  const to = startOfZonedDay(now, 7 - weekdayIndex + week * 7);
  const appointments = await runTool(tools.listAppointments, await getToolContext(), { from, to });
  const today = startOfZonedDay(now).getTime();

  const dayLabel = (d: Date) => new Intl.DateTimeFormat("en-GB", { timeZone: AGENCY_TIMEZONE, weekday: "short", day: "numeric" }).format(d);
  const rangeLabel = `${new Intl.DateTimeFormat("en-GB", { timeZone: AGENCY_TIMEZONE, day: "numeric", month: "short" }).format(from)} – ${new Intl.DateTimeFormat("en-GB", { timeZone: AGENCY_TIMEZONE, day: "numeric", month: "short", year: "numeric" }).format(days[6]!)}`;

  return (
    <>
      <PageHeader
        crumbs={[{ label: "Calendar" }]}
        actions={
          <div className="flex items-center gap-1">
            <span className="mr-2 text-muted">{rangeLabel}</span>
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
      <div className="flex-1 overflow-auto">
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
