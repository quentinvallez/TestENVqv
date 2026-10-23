export const AGENCY_TIMEZONE = "Europe/Brussels";

/** Offset in ms between the wall-clock time in `timeZone` and UTC at `date`. */
function zoneOffset(date: Date, timeZone: string): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })
      .formatToParts(date)
      .map((p) => [p.type, Number(p.value)]),
  );
  const asUtc = Date.UTC(parts.year!, parts.month! - 1, parts.day!, parts.hour!, parts.minute!, parts.second!);
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

/** The instant at which the wall clock in `timeZone` shows the given local time. */
export function zonedTime(
  local: { year: number; month: number; day: number; hour?: number; minute?: number },
  timeZone = AGENCY_TIMEZONE,
): Date {
  const guess = Date.UTC(local.year, local.month - 1, local.day, local.hour ?? 0, local.minute ?? 0);
  const first = guess - zoneOffset(new Date(guess), timeZone);
  // Re-check once so times right after a DST switch land correctly.
  return new Date(guess - zoneOffset(new Date(first), timeZone));
}

/** Calendar date (in `timeZone`) of an instant, shifted by `dayOffset` days. */
export function zonedDay(date: Date, dayOffset = 0, timeZone = AGENCY_TIMEZONE) {
  const [year, month, day] = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" })
    .format(date)
    .split("-")
    .map(Number);
  const shifted = new Date(Date.UTC(year!, month! - 1, day! + dayOffset));
  return { year: shifted.getUTCFullYear(), month: shifted.getUTCMonth() + 1, day: shifted.getUTCDate() };
}

/** Start of the day (in `timeZone`) containing `date`, shifted by `dayOffset` days. */
export function startOfZonedDay(date: Date, dayOffset = 0, timeZone = AGENCY_TIMEZONE): Date {
  return zonedTime(zonedDay(date, dayOffset, timeZone), timeZone);
}
