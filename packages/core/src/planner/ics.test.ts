import { describe, expect, it } from "vitest";
import { icsCalendar } from "./ics";

describe("icsCalendar", () => {
  const event = { uid: "apt_1@viewing", start: new Date("2026-10-31T09:00:00Z"), end: new Date("2026-10-31T09:30:00Z"), summary: "Bezoek: Sophie D.", location: "Kerkstraat 12, Gent" };

  it("writes UTC times, escapes commas and uses CRLF", () => {
    const ics = icsCalendar("Bezoeken", [event], new Date("2026-10-27T12:00:00Z"));
    expect(ics).toContain("DTSTART:20261031T090000Z\r\nDTEND:20261031T093000Z\r\n");
    expect(ics).toContain("LOCATION:Kerkstraat 12\\, Gent\r\n");
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
  });

  it("folds long lines at 75 octets", () => {
    const ics = icsCalendar("Bezoeken", [{ ...event, description: "é".repeat(100) }]);
    expect(ics).toContain("\r\n é");
    for (const l of ics.split("\r\n")) expect(new TextEncoder().encode(l).length).toBeLessThanOrEqual(75);
  });
});
