/*
 * A read-only iCalendar feed (RFC 5545), so owners and tenants can follow the
 * viewings of their home in their own phone calendar without connecting it.
 * Pure: the route passes the events in.
 */

export type IcsEvent = { uid: string; start: Date; end: Date; summary: string; location?: string; description?: string };

const stamp = (date: Date) => date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

/** Escapes text values and folds lines longer than 75 octets, as the format requires. */
function line(name: string, value: string) {
  const escaped = value.replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
  const full = `${name}:${escaped}`;
  const bytes = new TextEncoder().encode(full);
  if (bytes.length <= 75) return full;
  const parts: string[] = [];
  let current = "";
  let size = 0;
  for (const char of full) {
    const length = new TextEncoder().encode(char).length;
    if (size + length > (parts.length ? 74 : 75)) {
      parts.push(current);
      current = "";
      size = 0;
    }
    current += char;
    size += length;
  }
  parts.push(current);
  return parts.join("\r\n ");
}

export function icsCalendar(name: string, events: IcsEvent[], now = new Date()) {
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Viewing//Occupant viewings//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH", line("X-WR-CALNAME", name)];
  for (const event of events) {
    lines.push(
      "BEGIN:VEVENT",
      line("UID", event.uid),
      `DTSTAMP:${stamp(now)}`,
      `DTSTART:${stamp(event.start)}`,
      `DTEND:${stamp(event.end)}`,
      line("SUMMARY", event.summary),
      ...(event.location ? [line("LOCATION", event.location)] : []),
      ...(event.description ? [line("DESCRIPTION", event.description)] : []),
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  return `${lines.join("\r\n")}\r\n`;
}
