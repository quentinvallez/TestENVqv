import { describe, expect, it } from "vitest";
import { invitesClient, requestStatus, type RequestFacts } from "./requests";

const HOUR = 3600 * 1000;
const now = new Date("2026-11-20T15:00:00Z");
const ago = (hours: number) => new Date(now.getTime() - hours * HOUR);

const base: RequestFacts = {
  leadStage: "new",
  createdAt: ago(2),
  hasEmail: true,
  hasPhone: true,
  listingStatus: "active",
  hasUpcomingViewing: false,
  hasPastViewing: false,
  invitedAt: null,
  remindedAt: null,
  reminders: 0,
  maxReminders: 2,
  lastDeliveryFailed: false,
  pendingDraft: false,
  question: false,
};
const status = (facts: Partial<RequestFacts>) => requestStatus({ ...base, ...facts }, now);

describe("requestStatus", () => {
  it("is contacted for a day after the booking link, then not planned yet", () => {
    expect(status({ leadStage: "invited", invitedAt: ago(3) })).toEqual({ stage: "contacted", reason: null });
    expect(status({ leadStage: "invited", invitedAt: ago(25) })).toEqual({ stage: "not_planned", reason: null });
  });

  it("stays not planned through both reminders, and closes 3 days after the second", () => {
    expect(status({ leadStage: "invited", invitedAt: ago(50), remindedAt: ago(20), reminders: 1 }).stage).toBe("not_planned");
    expect(status({ leadStage: "invited", invitedAt: ago(100), remindedAt: ago(73), reminders: 1 }).stage).toBe("not_planned");
    expect(status({ leadStage: "invited", invitedAt: ago(150), remindedAt: ago(73), reminders: 2 })).toEqual({ stage: "closed", reason: "no_response" });
  });

  it("closes a week after the booking link when no reminder went out", () => {
    expect(status({ leadStage: "invited", invitedAt: ago(6 * 24) }).stage).toBe("not_planned");
    expect(status({ leadStage: "invited", invitedAt: ago(7 * 24) })).toEqual({ stage: "closed", reason: "no_response" });
  });

  it("starts the clock again when new times are sent after the reminder", () => {
    expect(status({ leadStage: "invited", invitedAt: ago(2), remindedAt: ago(80), reminders: 2 }).stage).toBe("contacted");
  });

  it("is planned with an upcoming viewing, visited after it", () => {
    expect(status({ leadStage: "booked", invitedAt: ago(30), hasUpcomingViewing: true }).stage).toBe("planned");
    expect(status({ leadStage: "visited", hasPastViewing: true }).stage).toBe("visited");
    expect(status({ leadStage: "offer" }).stage).toBe("visited");
  });

  it("needs a person for our own drafts and failed deliveries, before anything else", () => {
    expect(status({ leadStage: "booked", hasUpcomingViewing: true, pendingDraft: true })).toEqual({ stage: "needs_you", reason: "draft" });
    expect(status({ leadStage: "invited", invitedAt: ago(1), lastDeliveryFailed: true })).toEqual({ stage: "needs_you", reason: "not_delivered" });
  });

  it("says why nothing went out automatically", () => {
    expect(status({ hasEmail: false })).toEqual({ stage: "needs_you", reason: "phone_only" });
    expect(status({ hasEmail: false, pendingDraft: true })).toEqual({ stage: "needs_you", reason: "phone_only" });
    expect(status({ hasEmail: false, hasPhone: false })).toEqual({ stage: "needs_you", reason: "not_contacted" });
    expect(status({ listingStatus: null })).toEqual({ stage: "needs_you", reason: "listing_unknown" });
    expect(status({ listingStatus: "under_offer" })).toEqual({ stage: "needs_you", reason: "listing_unavailable" });
    expect(status({})).toEqual({ stage: "needs_you", reason: "not_contacted" });
    expect(status({ question: true })).toEqual({ stage: "needs_you", reason: "question" });
  });

  it("gives the automatic email a few minutes before asking for a person", () => {
    expect(status({ createdAt: new Date(now.getTime() - 60_000) }).stage).toBe("contacted");
    expect(status({ createdAt: new Date(now.getTime() - 60_000), hasEmail: false }).stage).toBe("needs_you");
  });

  it("treats a request marked contacted by phone as contacted", () => {
    expect(status({ leadStage: "invited", hasEmail: false })).toEqual({ stage: "contacted", reason: null });
  });

  it("keeps closed requests closed", () => {
    expect(status({ leadStage: "lost", pendingDraft: true })).toEqual({ stage: "closed", reason: "not_interested" });
    expect(status({ leadStage: "won" })).toEqual({ stage: "closed", reason: "won" });
  });
});

describe("invitesClient", () => {
  it("counts our replies and booking links, not reminders, confirmations or system notes", () => {
    const out = (kind?: string, authorType = "agent") => ({ direction: "outbound", authorType, metadata: kind ? { kind } : {} });
    expect(invitesClient(out("portal_reply"))).toBe(true);
    expect(invitesClient(out())).toBe(true);
    expect(invitesClient(out("no_show"))).toBe(true);
    expect(invitesClient(out("nudge"))).toBe(false);
    expect(invitesClient(out("reminder"))).toBe(false);
    expect(invitesClient(out("booking_confirmation"))).toBe(false);
    expect(invitesClient(out(undefined, "system"))).toBe(false);
    expect(invitesClient({ direction: "inbound", authorType: "contact", metadata: {} })).toBe(false);
  });
});
