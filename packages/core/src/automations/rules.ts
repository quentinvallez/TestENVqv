import type { AppointmentStatus, AutomationSettings, LeadStage } from "@viewing/db/schema";
import { AGENCY_TIMEZONE, startOfZonedDay, zonedDay } from "../time";

// When each automatic job is due. Pure functions of the data and the current
// time, so the jobs can run every few minutes or once a day and do the same.

const HOUR = 3600 * 1000;
const DAY = 24 * HOUR;

/** Local hour from which the day-before reminder goes out. */
export const REMINDER_HOUR = 17;
/** No reminder for a viewing this close; the client just got the confirmation or it is too late to help. */
export const REMINDER_MIN_NOTICE = 2 * HOUR;
/** Booked less than this before the start: the confirmation is reminder enough. */
export const REMINDER_MIN_BOOKED_AHEAD = 12 * HOUR;
/** A viewing still open this long after its end is taken as done. */
export const COMPLETE_AFTER = 1 * HOUR;
/** Older viewings and messages are left alone, so turning a job on doesn't flood the inbox. */
export const LOOKBACK = 7 * DAY;
export const MAX_NUDGES = 2;

export const defaultAutomationSettings: Required<AutomationSettings> = {
  reminders: true,
  followUps: true,
  noShows: true,
  nudges: true,
  nudgeAfterDays: 3,
};

export function automationSettings(stored: AutomationSettings | null | undefined): Required<AutomationSettings> {
  return { ...defaultAutomationSettings, ...stored };
}

const localHour = (date: Date) =>
  Number(new Intl.DateTimeFormat("en-GB", { timeZone: AGENCY_TIMEZONE, hour: "2-digit", hourCycle: "h23" }).format(date));

const sameDay = (a: { year: number; month: number; day: number }, b: typeof a) => a.year === b.year && a.month === b.month && a.day === b.day;

type AppointmentFacts = { status: AppointmentStatus; startsAt: Date; endsAt: Date; createdAt: Date; contactId: string | null };

const open = (status: AppointmentStatus) => status === "scheduled" || status === "confirmed";

/**
 * The reminder goes out from 17:00 Brussels time the day before, or as soon as
 * the viewing is less than 24 hours away (for runs that missed the evening).
 */
export function reminderDue(apt: AppointmentFacts, now: Date): boolean {
  if (!open(apt.status) || !apt.contactId) return false;
  const until = apt.startsAt.getTime() - now.getTime();
  if (until < REMINDER_MIN_NOTICE) return false;
  if (apt.startsAt.getTime() - apt.createdAt.getTime() < REMINDER_MIN_BOOKED_AHEAD) return false;
  if (until <= DAY) return true;
  return sameDay(zonedDay(apt.startsAt), zonedDay(now, 1)) && localHour(now) >= REMINDER_HOUR;
}

/** A viewing nobody marked is taken as completed an hour after it ended; the agent can still mark a no-show. */
export function completionDue(apt: AppointmentFacts, now: Date): boolean {
  if (!open(apt.status)) return false;
  const since = now.getTime() - apt.endsAt.getTime();
  return since >= COMPLETE_AFTER && since <= LOOKBACK;
}

/** The follow-up is drafted the day after the viewing, unless the agency already wrote to the client since. */
export function followUpDue(apt: AppointmentFacts & { lastOutboundAt: Date | null }, now: Date): boolean {
  if (apt.status !== "completed" || !apt.contactId) return false;
  if (apt.endsAt >= startOfZonedDay(now)) return false;
  if (now.getTime() - apt.endsAt.getTime() > LOOKBACK) return false;
  return !apt.lastOutboundAt || apt.lastOutboundAt < apt.endsAt;
}

/** Stages where a lead is still deciding whether to come or to go further. */
export const nudgeStages: LeadStage[] = ["new", "invited", "follow_up"];

/** A nudge when our last message, a real one to the client, has gone unanswered for `afterDays` days. */
export function nudgeDue(
  facts: {
    lastMessage: { direction: "inbound" | "outbound"; authorType: string | null; sentAt: Date } | null;
    leadStage: LeadStage | null;
    hasPendingDraft: boolean;
    hasUpcomingAppointment: boolean;
    nudgesSoFar: number;
  },
  now: Date,
  afterDays: number,
): boolean {
  const last = facts.lastMessage;
  if (!last || last.direction !== "outbound" || last.authorType === "system") return false;
  if (!facts.leadStage || !nudgeStages.includes(facts.leadStage)) return false;
  if (facts.hasPendingDraft || facts.hasUpcomingAppointment || facts.nudgesSoFar >= MAX_NUDGES) return false;
  const since = now.getTime() - last.sentAt.getTime();
  return since >= afterDays * DAY && since <= LOOKBACK + afterDays * DAY;
}
