import { describe, expect, it } from "vitest";
import { zonedTime } from "../time";
import { completionDue, followUpDue, nudgeDue, reminderDue } from "./rules";

const at = (day: number, hour: number, minute = 0) => zonedTime({ year: 2026, month: 11, day, hour, minute });
const HOUR = 3600 * 1000;

const viewing = (startsAt: Date, overrides: Partial<Parameters<typeof reminderDue>[0]> = {}) => ({
  status: "scheduled" as const,
  startsAt,
  endsAt: new Date(startsAt.getTime() + HOUR / 2),
  createdAt: at(1, 9),
  contactId: "con_1",
  ...overrides,
});

describe("reminderDue", () => {
  it("sends from 17:00 Brussels time the day before", () => {
    const apt = viewing(at(5, 16));
    expect(reminderDue(apt, at(4, 16, 59))).toBe(true); // already under 24 hours away
    const morning = viewing(at(5, 9, 30));
    expect(reminderDue(morning, at(4, 16, 59))).toBe(true);
    const evening = viewing(at(5, 19));
    expect(reminderDue(evening, at(4, 16))).toBe(false);
    expect(reminderDue(evening, at(4, 17))).toBe(true);
  });

  it("does not remind two days ahead, too close, or right after booking", () => {
    expect(reminderDue(viewing(at(6, 10)), at(4, 18))).toBe(false);
    expect(reminderDue(viewing(at(4, 12)), at(4, 10, 30))).toBe(false);
    expect(reminderDue(viewing(at(5, 10), { createdAt: at(4, 23) }), at(4, 23, 30))).toBe(false);
  });

  it("skips cancelled viewings and viewings without a client", () => {
    expect(reminderDue(viewing(at(5, 10), { status: "cancelled" }), at(4, 18))).toBe(false);
    expect(reminderDue(viewing(at(5, 10), { contactId: null }), at(4, 18))).toBe(false);
  });

  it("works across the clock change", () => {
    // Sunday 25 October 2026 clocks go back; a Monday 9:00 viewing is reminded Sunday evening.
    const monday = zonedTime({ year: 2026, month: 10, day: 26, hour: 9 });
    const sunday = zonedTime({ year: 2026, month: 10, day: 25, hour: 17 });
    expect(reminderDue(viewing(monday, { createdAt: new Date(monday.getTime() - 5 * 24 * HOUR) }), sunday)).toBe(true);
  });
});

describe("completionDue", () => {
  it("completes an hour after the end, within a week", () => {
    const apt = viewing(at(4, 10));
    expect(completionDue(apt, at(4, 11))).toBe(false);
    expect(completionDue(apt, at(4, 11, 30))).toBe(true);
    expect(completionDue(apt, at(12, 11))).toBe(false);
    expect(completionDue({ ...apt, status: "no_show" }, at(4, 12))).toBe(false);
  });
});

describe("followUpDue", () => {
  const done = { ...viewing(at(4, 10)), status: "completed" as const, lastOutboundAt: at(3, 10) };
  it("waits until the next day", () => {
    expect(followUpDue(done, at(4, 22))).toBe(false);
    expect(followUpDue(done, at(5, 0, 5))).toBe(true);
  });
  it("skips when the agency already wrote after the viewing", () => {
    expect(followUpDue({ ...done, lastOutboundAt: at(4, 15) }, at(5, 9))).toBe(false);
  });
});

describe("nudgeDue", () => {
  const facts = {
    lastMessage: { direction: "outbound" as const, authorType: "user", sentAt: at(1, 10) },
    leadStage: "invited" as const,
    hasPendingDraft: false,
    hasUpcomingAppointment: false,
    nudgesSoFar: 0,
  };
  it("nudges after the set number of days without an answer", () => {
    expect(nudgeDue(facts, at(3, 10), 3)).toBe(false);
    expect(nudgeDue(facts, at(4, 10), 3)).toBe(true);
  });
  it("leaves the client alone when they answered, booked, moved on or had two nudges", () => {
    expect(nudgeDue({ ...facts, lastMessage: { ...facts.lastMessage, direction: "inbound" } }, at(5, 10), 3)).toBe(false);
    expect(nudgeDue({ ...facts, hasUpcomingAppointment: true }, at(5, 10), 3)).toBe(false);
    expect(nudgeDue({ ...facts, leadStage: "offer" }, at(5, 10), 3)).toBe(false);
    expect(nudgeDue({ ...facts, nudgesSoFar: 2 }, at(5, 10), 3)).toBe(false);
    expect(nudgeDue({ ...facts, hasPendingDraft: true }, at(5, 10), 3)).toBe(false);
  });
});
