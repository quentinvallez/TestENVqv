import type { LeadStage } from "@viewing/db/schema";

/*
 * Where a viewing request stands, for the requests board. A pure function of
 * what happened to the lead (messages, viewings, drafts), so the board never
 * needs its own state and can't drift from what was really sent or booked.
 */

const HOUR = 3600 * 1000;
const DAY = 24 * HOUR;

/** After this long without a booking, a contacted client counts as "not planned yet" and gets the first reminder. */
export const NOT_PLANNED_AFTER = DAY;
/** After the last reminder, this long without a booking and the request is closed as "no response". */
export const NO_RESPONSE_AFTER_REMINDER = 3 * DAY;
/** Without a reminder (switched off), the request closes this long after the booking link. */
export const NO_RESPONSE_WITHOUT_REMINDER = 7 * DAY;
/** A request this new with nothing sent yet: the automatic email is still on its way. */
export const AUTO_REPLY_GRACE = 15 * 60 * 1000;

export const requestStages = ["needs_you", "contacted", "not_planned", "planned", "visited", "closed"] as const;
export type RequestStage = (typeof requestStages)[number];

/** Why a request waits for a person (stage "needs_you"), or why it closed. */
export type RequestReason =
  | "draft" // one of our own messages waits for approval ("Ask me first")
  | "question" // they asked a question without asking to visit: the agent answers from their own mailbox
  | "phone_only" // no email address: someone has to call
  | "listing_unknown" // we couldn't tell which listing they mean
  | "listing_unavailable" // under option, sold, let or off the website
  | "not_delivered" // our email or WhatsApp didn't arrive
  | "not_contacted" // nothing went out automatically
  | "no_response" // closed: no booking after the reminder
  | "not_interested" // closed by the agency
  | "won"; // closed: the deal is done

export type RequestFacts = {
  leadStage: LeadStage;
  createdAt: Date;
  hasEmail: boolean;
  hasPhone: boolean;
  /** null: the request names no listing we know. */
  listingStatus: string | null;
  hasUpcomingViewing: boolean;
  hasPastViewing: boolean;
  /** Our latest message to the client that invited them to book (booking link, new times), not the reminder. */
  invitedAt: Date | null;
  /** The latest automatic reminder after that invitation, and how many went out. */
  remindedAt: Date | null;
  reminders: number;
  /** How many reminders go out in all (2: after 24 and 72 hours). */
  maxReminders: number;
  /** Our latest message to the client failed and nothing recovered it. */
  lastDeliveryFailed: boolean;
  /** One of our own messages (confirmation, reminder, follow-up…) waits for approval because the agency set it to "Ask me first". */
  pendingDraft: boolean;
  /** The request was a question, not a visit request, so no booking link went out. */
  question: boolean;
};

export function requestStatus(f: RequestFacts, now: Date): { stage: RequestStage; reason: RequestReason | null } {
  if (f.leadStage === "lost") return { stage: "closed", reason: "not_interested" };
  if (f.leadStage === "won") return { stage: "closed", reason: "won" };

  // No email address and nothing sent: a draft can't reach them either, someone has to call.
  if (f.leadStage === "new" && !f.invitedAt && !f.hasEmail && !f.hasUpcomingViewing) return { stage: "needs_you", reason: f.hasPhone ? "phone_only" : "not_contacted" };
  // Anything a person has to do comes first, wherever the request stood.
  // Clients' own replies are not here: they go to the agent's mailbox and are answered there.
  if (f.pendingDraft) return { stage: "needs_you", reason: "draft" };
  if (f.lastDeliveryFailed) return { stage: "needs_you", reason: "not_delivered" };

  if (f.hasUpcomingViewing || f.leadStage === "booked") return { stage: "planned", reason: null };
  if (f.hasPastViewing || f.leadStage === "visited" || f.leadStage === "follow_up" || f.leadStage === "offer") return { stage: "visited", reason: null };

  if (!f.invitedAt) {
    if (f.leadStage === "invited") return { stage: "contacted", reason: null }; // marked as contacted (by phone)
    if (now.getTime() - f.createdAt.getTime() < AUTO_REPLY_GRACE && f.hasEmail && !f.question) return { stage: "contacted", reason: null };
    if (!f.hasEmail) return { stage: "needs_you", reason: f.hasPhone ? "phone_only" : "not_contacted" };
    if (f.listingStatus === null) return { stage: "needs_you", reason: "listing_unknown" };
    if (f.listingStatus !== "active") return { stage: "needs_you", reason: "listing_unavailable" };
    return { stage: "needs_you", reason: f.question ? "question" : "not_contacted" };
  }

  const since = now.getTime() - f.invitedAt.getTime();
  if (f.remindedAt && f.remindedAt >= f.invitedAt) {
    // Closed only once the last reminder has had its time; until then the next reminder is still to come.
    if (f.reminders >= f.maxReminders && now.getTime() - f.remindedAt.getTime() >= NO_RESPONSE_AFTER_REMINDER) return { stage: "closed", reason: "no_response" };
    if (now.getTime() - f.remindedAt.getTime() >= NO_RESPONSE_WITHOUT_REMINDER) return { stage: "closed", reason: "no_response" };
    return { stage: "not_planned", reason: null };
  }
  if (since >= NO_RESPONSE_WITHOUT_REMINDER) return { stage: "closed", reason: "no_response" };
  if (since >= NOT_PLANNED_AFTER) return { stage: "not_planned", reason: null };
  return { stage: "contacted", reason: null };
}

/**
 * Our messages that don't (re)start the "contacted" clock: the reminder itself,
 * and messages about a viewing that is already booked or done. Everything else
 * we write to the client (the booking link, a reply, new times) does.
 */
const notInvites = new Set(["nudge", "reminder", "booking_confirmation", "follow_up", "occupant_booked", "occupant_rescheduled", "occupant_cancelled", "occupant_digest"]);

/** Whether an outbound message counts as contacting the client about this request. */
export function invitesClient(message: { direction: string; authorType: string | null; metadata: Record<string, unknown> }) {
  if (message.direction !== "outbound" || message.authorType === "system") return false;
  const kind = typeof message.metadata.kind === "string" ? message.metadata.kind : null;
  return !kind || !notInvites.has(kind);
}
