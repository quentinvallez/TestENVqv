import { AGENCY_TIMEZONE, zonedDay, zonedTime } from "../time";

export type Interval = { start: Date; end: Date };

/** Weekly working hours in the agency's local time; weekday 0 = Sunday. */
export type WorkingHours = { weekday: number; startMinute: number; endMinute: number };

export type SlotOptions = {
  workingHours: WorkingHours[];
  /** Existing appointments and calendar events that block time. */
  busy: Interval[];
  from: Date;
  to: Date;
  slotMinutes: number;
  /** Kept free before and after every busy interval, e.g. travel between viewings. */
  bufferMinutes: number;
  /** Slots start on this grid within the working window. */
  stepMinutes?: number;
  /** Minimum time between now and the start of a bookable slot. */
  minNoticeMinutes?: number;
  now?: Date;
  timeZone?: string;
};

const MINUTE = 60_000;

function localTime(day: { year: number; month: number; day: number }, minuteOfDay: number, timeZone: string) {
  return zonedTime({ ...day, hour: Math.floor(minuteOfDay / 60), minute: minuteOfDay % 60 }, timeZone);
}

/**
 * Bookable slots for one agent: working hours, minus busy time widened by the
 * buffer, minus anything too soon. Pure, so it is easy to test and reuse.
 */
export function computeSlots(options: SlotOptions): Interval[] {
  const {
    workingHours,
    from,
    to,
    slotMinutes,
    bufferMinutes,
    stepMinutes = 30,
    minNoticeMinutes = 120,
    now = new Date(),
    timeZone = AGENCY_TIMEZONE,
  } = options;

  const blocked = options.busy
    .map((b) => ({ start: b.start.getTime() - bufferMinutes * MINUTE, end: b.end.getTime() + bufferMinutes * MINUTE }))
    .sort((a, b) => a.start - b.start);
  const earliest = Math.max(from.getTime(), now.getTime() + minNoticeMinutes * MINUTE);
  const slots: Interval[] = [];

  for (let offset = 0; ; offset++) {
    const day = zonedDay(from, offset, timeZone);
    const dayStart = zonedTime(day, timeZone);
    if (dayStart.getTime() >= to.getTime()) break;
    const weekday = new Date(Date.UTC(day.year, day.month - 1, day.day)).getUTCDay();

    for (const window of workingHours.filter((w) => w.weekday === weekday)) {
      const windowEnd = localTime(day, window.endMinute, timeZone).getTime();
      for (let minute = window.startMinute; minute + slotMinutes <= window.endMinute; minute += stepMinutes) {
        const start = localTime(day, minute, timeZone).getTime();
        const end = start + slotMinutes * MINUTE;
        if (end > windowEnd || start < earliest || end > to.getTime()) continue;
        if (blocked.some((b) => b.start < end && b.end > start)) continue;
        slots.push({ start: new Date(start), end: new Date(end) });
      }
    }
  }
  return slots.sort((a, b) => a.start.getTime() - b.start.getTime());
}
