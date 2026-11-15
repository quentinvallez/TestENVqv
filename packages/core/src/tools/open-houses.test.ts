import { and, db, eq, newId, schema } from "@viewing/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { tools } from "../registry";
import { zonedDay, zonedTime } from "../time";
import { runTool, type ToolContext } from "../tool";
import { SlotUnavailableError } from "./booking";

const MINUTE = 60_000;

/** 10:00 Brussels on the first weekday at least `days` days from now. */
function weekdayAt(days: number, hour: number) {
  for (let offset = days; ; offset++) {
    const day = zonedDay(new Date(), offset);
    const weekday = new Date(Date.UTC(day.year, day.month - 1, day.day)).getUTCDay();
    if (weekday >= 1 && weekday <= 5) return zonedTime({ ...day, hour, minute: 0 });
  }
}

describe.skipIf(!process.env.DATABASE_URL)("phone bookings and open houses", () => {
  const agencyId = newId("org");
  const staff: ToolContext = { db, agencyId, actor: { type: "user", id: null } };
  const visitor: ToolContext = { db, agencyId, actor: { type: "contact", id: null } };
  let listingId: string;
  let otherListingId: string;
  let agentId: string;

  beforeAll(async () => {
    await db.insert(schema.organization).values({ id: agencyId, name: "Open house agency", slug: agencyId, createdAt: new Date() });
    await runTool(tools.seedDemoData, staff, {});
    const active = await db.select().from(schema.listings).where(and(eq(schema.listings.agencyId, agencyId), eq(schema.listings.status, "active"), eq(schema.listings.access, "agent")));
    const listing = await runTool(tools.getListing, staff, { id: active[0]!.id });
    listingId = listing!.id;
    agentId = listing!.agentId!;
    otherListingId = active.find((l) => l.id !== listingId)!.id;
    // Both listings with the same agent, so the open house blocks the other one.
    await runTool(tools.assignListingAgent, staff, { listingId: otherListingId, agentId });
  });
  afterAll(async () => {
    await db.delete(schema.organization).where(eq(schema.organization.id, agencyId));
  });

  it("books a caller who gave only a phone number, at a time agreed outside the usual hours", async () => {
    const evening = weekdayAt(3, 20); // 20:00, after working hours
    const booked = await runTool(tools.bookViewing, staff, {
      listingId,
      startsAt: evening,
      anyTime: true,
      source: "phone",
      confirmToClient: true,
      contact: { firstName: "Bart", lastName: "Peeters", phone: "0470 11 22 33", whatsappOptIn: false },
    });
    const [lead] = await db.select().from(schema.leads).where(and(eq(schema.leads.agencyId, agencyId), eq(schema.leads.contactId, booked.contactId)));
    expect(lead).toMatchObject({ source: "phone", stage: "booked" });
    // No email and no WhatsApp: nothing to confirm to.
    expect(await db.select().from(schema.conversations).where(eq(schema.conversations.contactId, booked.contactId))).toHaveLength(0);

    // The same agent can't be in two places.
    await expect(runTool(tools.bookViewing, staff, { listingId: otherListingId, startsAt: new Date(evening.getTime() + 15 * MINUTE), anyTime: true, source: "phone", contact: { firstName: "Other", phone: "0470 99 99 99" } })).rejects.toThrow(/already has an appointment/);
    // Visitors can't pick their own time.
    await expect(runTool(tools.bookViewing, visitor, { listingId, startsAt: weekdayAt(3, 21), anyTime: true, contact: { firstName: "X", email: "x@example.com" } })).rejects.toThrow();

    // Calling back with an email: same client, and this time a confirmation goes out.
    const { slots } = await runTool(tools.availableSlots, staff, { listingId: otherListingId });
    const again = await runTool(tools.bookViewing, staff, {
      listingId: otherListingId,
      startsAt: slots[0]!.start,
      source: "phone",
      confirmToClient: true,
      contact: { firstName: "Bart", phone: "+0470112233", email: "bart@example.com" },
    });
    expect(again.contactId).not.toBe(booked.contactId); // "+0470…" is not the same number
    const third = await runTool(tools.bookViewing, staff, {
      listingId: otherListingId,
      startsAt: slots[1]!.start,
      source: "phone",
      confirmToClient: true,
      contact: { firstName: "Bart", phone: "0470112233", email: "bart.peeters@example.com" },
    });
    expect(third.contactId).toBe(booked.contactId);
    const [conversation] = await db.select().from(schema.conversations).where(eq(schema.conversations.contactId, booked.contactId));
    expect(conversation).toMatchObject({ unread: false, summary: "Booked a viewing on the phone." });
    const sent = await db.select().from(schema.messages).where(and(eq(schema.messages.conversationId, conversation!.id), eq(schema.messages.direction, "outbound")));
    expect(sent).toHaveLength(1);
    expect(sent[0]!.metadata).toMatchObject({ kind: "booking_confirmation" });
  });

  it("fills an open house slot by slot, blocks the agent's other viewings, and only cancels once nobody is booked", async () => {
    const start = weekdayAt(15, 10);
    const end = new Date(start.getTime() + 60 * MINUTE);
    const planned = await runTool(tools.planOpenHouse, staff, { listingId, startsAt: start, endsAt: end, slotMinutes: 15, perSlot: 2 });
    expect(planned.capacity).toBe(8);

    // Exclusive: the listing now offers only the open house.
    const { slots } = await runTool(tools.availableSlots, visitor, { listingId, days: 21 });
    expect(slots.map((s) => s.start.getTime())).toEqual([0, 15, 30, 45].map((m) => start.getTime() + m * MINUTE));
    expect(slots[0]).toMatchObject({ openHouseId: planned.openHouseId, spotsLeft: 2 });

    const first = await runTool(tools.bookViewing, visitor, { listingId, startsAt: start, contact: { firstName: "Ann", email: "ann@example.com" } });
    await runTool(tools.bookViewing, visitor, { listingId, startsAt: start, contact: { firstName: "Bob", email: "bob@example.com" } });
    await expect(runTool(tools.bookViewing, visitor, { listingId, startsAt: start, contact: { firstName: "Cas", email: "cas@example.com" } })).rejects.toBeInstanceOf(SlotUnavailableError);
    expect(first.openHouseId).toBe(planned.openHouseId);

    const [listed] = await runTool(tools.listOpenHouses, staff, { listingId });
    expect(listed).toMatchObject({ booked: 2, placesLeft: 6 });
    expect(listed!.visitors.map((v) => v.firstName)).toEqual(["Ann", "Bob"]);

    // The agent is at the open house: no viewings elsewhere then.
    const elsewhere = await runTool(tools.availableSlots, staff, { listingId: otherListingId, days: 21 });
    expect(elsewhere.slots.some((s) => s.start < end && s.end > start)).toBe(false);
    await expect(runTool(tools.planOpenHouse, staff, { listingId: otherListingId, startsAt: start, endsAt: end })).rejects.toThrow(/already has|elsewhere/);

    // Moving a visitor to a later slot of the same open house.
    await runTool(tools.rescheduleAppointment, visitor, { appointmentId: first.appointmentId, startsAt: new Date(start.getTime() + 30 * MINUTE) });
    const [moved] = await db.select().from(schema.appointments).where(eq(schema.appointments.id, first.appointmentId));
    expect(moved).toMatchObject({ openHouseId: planned.openHouseId, endsAt: new Date(start.getTime() + 45 * MINUTE) });

    await expect(runTool(tools.cancelOpenHouse, staff, { openHouseId: planned.openHouseId })).rejects.toThrow(/2 visitors have booked/);
    for (const v of listed!.visitors) await runTool(tools.cancelAppointment, staff, { appointmentId: v.appointmentId });
    expect(await runTool(tools.cancelOpenHouse, staff, { openHouseId: planned.openHouseId })).toEqual({ changed: true });
    const after = await runTool(tools.availableSlots, visitor, { listingId, days: 21 });
    expect(after.slots.some((s) => "openHouseId" in s)).toBe(false);
    expect(after.slots.length).toBeGreaterThan(4);
  });

  it("offers open house slots next to the usual times when it isn't exclusive, and refuses one that clashes", async () => {
    const start = weekdayAt(16, 14);
    const planned = await runTool(tools.planOpenHouse, staff, { listingId, startsAt: start, endsAt: new Date(start.getTime() + 60 * MINUTE), slotMinutes: 0, perSlot: 10, exclusive: false });
    expect(planned.capacity).toBe(10);
    const { slots } = await runTool(tools.availableSlots, visitor, { listingId, days: 21 });
    expect(slots.filter((s) => "openHouseId" in s)).toHaveLength(1);
    expect(slots.length).toBeGreaterThan(1);
    await expect(runTool(tools.planOpenHouse, staff, { listingId, startsAt: new Date(start.getTime() + 15 * MINUTE), endsAt: new Date(start.getTime() + 45 * MINUTE), slotMinutes: 0 })).rejects.toThrow();
  });
});
