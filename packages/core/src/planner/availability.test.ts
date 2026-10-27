import { describe, expect, it } from "vitest";
import { zonedTime } from "../time";
import { computeSlots, expandWindows, type WorkingHours } from "./availability";

const weekdays9to12: WorkingHours[] = [1, 2, 3, 4, 5].map((weekday) => ({ weekday, startMinute: 9 * 60, endMinute: 12 * 60 }));
const brussels = (day: number, hour: number, minute = 0, month = 10) => zonedTime({ year: 2026, month, day, hour, minute });
const times = (slots: { start: Date }[]) =>
  slots.map((s) => new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Brussels", hour: "2-digit", minute: "2-digit" }).format(s.start));

const base = {
  workingHours: weekdays9to12,
  slotMinutes: 30,
  bufferMinutes: 0,
  minNoticeMinutes: 0,
  now: new Date("2026-01-01T00:00:00Z"),
};

describe("computeSlots", () => {
  it("fills working hours on a 30-minute grid in Brussels time", () => {
    // Tuesday 20 October 2026
    const slots = computeSlots({ ...base, busy: [], from: brussels(20, 0), to: brussels(21, 0) });
    expect(times(slots)).toEqual(["09:00", "09:30", "10:00", "10:30", "11:00", "11:30"]);
  });

  it("skips weekends", () => {
    // Saturday 24 and Sunday 25 October
    expect(computeSlots({ ...base, busy: [], from: brussels(24, 0), to: brussels(26, 0) })).toEqual([]);
  });

  it("blocks busy time plus the travel buffer on both sides", () => {
    const slots = computeSlots({
      ...base,
      bufferMinutes: 15,
      busy: [{ start: brussels(20, 10), end: brussels(20, 10, 30) }],
      from: brussels(20, 0),
      to: brussels(21, 0),
    });
    // 09:30 ends at 10:00, within 15 min of the viewing; 10:30 starts right after it.
    expect(times(slots)).toEqual(["09:00", "11:00", "11:30"]);
  });

  it("respects the minimum notice", () => {
    const slots = computeSlots({ ...base, minNoticeMinutes: 120, now: brussels(20, 8, 15), busy: [], from: brussels(20, 0), to: brussels(21, 0) });
    expect(times(slots)[0]).toBe("10:30");
  });

  it("keeps local hours across the October DST switch", () => {
    // Clocks go back on Sunday 25 October 2026; Monday 26 is in winter time.
    const slots = computeSlots({ ...base, busy: [], from: brussels(23, 0), to: brussels(27, 0) });
    const monday = slots.filter((s) => s.start.getTime() >= brussels(26, 0).getTime());
    expect(times(monday)[0]).toBe("09:00");
    expect(monday[0]!.start.toISOString()).toBe("2026-10-26T08:00:00.000Z");
    expect(slots.find((s) => s.start.getTime() < brussels(24, 0).getTime())!.start.toISOString()).toBe("2026-10-23T07:00:00.000Z");
  });

  it("supports longer slots and split days", () => {
    const slots = computeSlots({
      ...base,
      slotMinutes: 60,
      workingHours: [
        { weekday: 2, startMinute: 9 * 60, endMinute: 11 * 60 },
        { weekday: 2, startMinute: 14 * 60, endMinute: 15 * 60 },
      ],
      busy: [],
      from: brussels(20, 0),
      to: brussels(21, 0),
    });
    expect(times(slots)).toEqual(["09:00", "09:30", "10:00", "14:00"]);
  });

  it("keeps only slots inside the times the occupants allow", () => {
    const slots = computeSlots({
      ...base,
      busy: [],
      allowed: [{ start: brussels(20, 10), end: brussels(20, 11, 15) }],
      from: brussels(20, 0),
      to: brussels(21, 0),
    });
    // 11:00 would end at 11:30, past the window.
    expect(times(slots)).toEqual(["10:00", "10:30"]);
  });

  it("offers nothing when the occupants allow no time", () => {
    expect(computeSlots({ ...base, busy: [], allowed: [], from: brussels(20, 0), to: brussels(21, 0) })).toEqual([]);
  });

  it("puts viewings at the same house back to back, without the travel buffer", () => {
    const slots = computeSlots({
      ...base,
      bufferMinutes: 15,
      busy: [],
      busyNoBuffer: [{ start: brussels(20, 10), end: brussels(20, 10, 30) }],
      from: brussels(20, 0),
      to: brussels(21, 0),
    });
    expect(times(slots)).toEqual(["09:00", "09:30", "10:30", "11:00", "11:30"]);
  });
});

describe("expandWindows", () => {
  it("turns weekly local windows into instants, across the October DST switch", () => {
    // Saturdays 10:00-12:00, from Friday 23 to Monday 2 November 2026; clocks go back on Sunday 25 October.
    const saturdays = expandWindows([{ weekday: 6, startMinute: 600, endMinute: 720 }], brussels(23, 0), brussels(2, 0, 0, 11));
    expect(saturdays.map((w) => w.start.toISOString())).toEqual(["2026-10-24T08:00:00.000Z", "2026-10-31T09:00:00.000Z"]);
    expect(times(saturdays)).toEqual(["10:00", "10:00"]);
  });
});
