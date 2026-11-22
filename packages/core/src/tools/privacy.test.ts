import { and, db, eq, inArray, newId, schema } from "@viewing/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { tools } from "../registry";
import { runTool, type ToolContext } from "../tool";
import { applyRetention, inactiveContacts } from "./privacy";

describe.skipIf(!process.env.DATABASE_URL)("client data (GDPR)", () => {
  const agencyId = newId("org");
  const ctx: ToolContext = { db, agencyId, actor: { type: "user", id: null } };
  const visitorCtx: ToolContext = { db, agencyId, actor: { type: "contact", id: null } };
  let listingId: string;

  beforeAll(async () => {
    await db.insert(schema.organization).values({ id: agencyId, name: "Privacy agency", slug: agencyId, createdAt: new Date() });
    await runTool(tools.seedDemoData, ctx, {});
    listingId = (await runTool(tools.listListings, ctx, { status: "active" }))[0]!.id;
  });
  afterAll(async () => {
    await db.delete(schema.organization).where(eq(schema.organization.id, agencyId));
  });

  it("exports everything about a client, then erases them and keeps past viewings without their name", async () => {
    const { slots } = await runTool(tools.availableSlots, ctx, { listingId });
    const booked = await runTool(tools.bookViewing, visitorCtx, {
      listingId,
      startsAt: slots[0]!.start,
      contact: { firstName: "Erika", lastName: "Vergeten", email: "erika@example.com", whatsappOptIn: false },
    });
    const [apt] = await db.select().from(schema.appointments).where(eq(schema.appointments.id, booked.appointmentId));
    const contactId = apt!.contactId!;
    // A past viewing too.
    const [past] = await db
      .insert(schema.appointments)
      .values({ agencyId, agentId: apt!.agentId, listingId, contactId, status: "completed", startsAt: new Date(Date.now() - 30 * 864e5), endsAt: new Date(Date.now() - 30 * 864e5 + 18e5), notes: "Erika liked the garden" })
      .returning();

    const data = await runTool(tools.exportContact, ctx, { contactId });
    expect(data.contact.email).toBe("erika@example.com");
    expect(data.appointments).toHaveLength(2);
    expect(data.interests.length).toBeGreaterThan(0);
    expect(data.messages.length).toBeGreaterThan(0); // the booking note
    expect(data.controller).toBe("Privacy agency");

    const conversationIds = (await db.select({ id: schema.conversations.id }).from(schema.conversations).where(eq(schema.conversations.contactId, contactId))).map((c) => c.id);
    expect(conversationIds.length).toBeGreaterThan(0);

    // Links in the messages they got went out short, on our own domain.
    const sent = await db.select().from(schema.messages).where(and(inArray(schema.messages.conversationId, conversationIds), eq(schema.messages.direction, "outbound")));
    expect(sent.some((m) => /\/l\/[0-9A-Za-z]{10}\b/.test(m.body))).toBe(true);
    expect(sent.some((m) => m.body.includes(`/a/${apt!.manageToken}`))).toBe(false);
    expect((await db.select().from(schema.shortLinks).where(eq(schema.shortLinks.contactId, contactId))).length).toBeGreaterThan(0);

    const counts = await runTool(tools.eraseContact, ctx, { contactId });
    expect(counts.upcomingCancelled).toBe(1);
    expect(counts.appointmentsKeptAnonymous).toBe(2);

    expect(await db.select().from(schema.contacts).where(eq(schema.contacts.id, contactId))).toHaveLength(0);
    expect(await db.select().from(schema.leads).where(eq(schema.leads.contactId, contactId))).toHaveLength(0);
    expect(await db.select().from(schema.shortLinks).where(eq(schema.shortLinks.contactId, contactId))).toHaveLength(0);
    expect(await db.select().from(schema.messages).where(inArray(schema.messages.conversationId, conversationIds))).toHaveLength(0);
    expect(await db.select().from(schema.proposals).where(and(eq(schema.proposals.agencyId, agencyId), inArray(schema.proposals.conversationId, conversationIds)))).toHaveLength(0);
    const [kept] = await db.select().from(schema.appointments).where(eq(schema.appointments.id, past!.id));
    expect(kept).toMatchObject({ contactId: null, notes: null, status: "completed" });
    const [cancelled] = await db.select().from(schema.appointments).where(eq(schema.appointments.id, booked.appointmentId));
    expect(cancelled).toMatchObject({ status: "cancelled", contactId: null });
    // The log keeps that it happened, without the person.
    const log = await db.select().from(schema.events).where(and(eq(schema.events.agencyId, agencyId), eq(schema.events.subjectId, contactId)));
    expect(log.find((e) => e.type === "contact.erased")?.data).toMatchObject({ reason: "request", leads: expect.any(Number) });
    expect(JSON.stringify(log)).not.toContain("erika");
  });

  it("erases clients nobody heard from in the retention period, but keeps owners and clients in a deal", async () => {
    const old = new Date(Date.now() - 30 * 30 * 864e5); // ~30 months ago
    const [quiet, inDeal, owner, recent] = await db
      .insert(schema.contacts)
      .values([
        { agencyId, firstName: "Quiet", email: "quiet@example.com", createdAt: old, updatedAt: old },
        { agencyId, firstName: "Deal", email: "deal@example.com", createdAt: old, updatedAt: old },
        { agencyId, firstName: "Owner", email: "owner@example.com", createdAt: old, updatedAt: old },
        { agencyId, firstName: "Recent", email: "recent@example.com" },
      ])
      .returning();
    await db.insert(schema.leads).values([
      { agencyId, contactId: quiet!.id, listingId, source: "immoweb", stage: "lost", createdAt: old, updatedAt: old },
      { agencyId, contactId: inDeal!.id, listingId, source: "immoweb", stage: "won", createdAt: old, updatedAt: old },
    ]);
    await db.insert(schema.listingOccupants).values({ agencyId, listingId, contactId: owner!.id, role: "owner" });
    // A half-filled valuation from two months ago.
    await db.insert(schema.valuations).values({
      agencyId,
      street: "Kerkstraat",
      postcode: "9000",
      city: "Gent",
      answers: { propertyType: "house", livingArea: 120, bedrooms: 3, bathrooms: 1, condition: "good", extras: [] },
      phone: "+32470000000",
      verificationCode: "1234",
      createdAt: new Date(Date.now() - 60 * 864e5),
    });

    expect(await inactiveContacts(ctx, 24, new Date())).toEqual([quiet!.id]);
    const result = await applyRetention(ctx);
    expect(result).toEqual({ erased: 1, unverifiedValuations: 1 });
    const left = (await db.select({ id: schema.contacts.id }).from(schema.contacts).where(inArray(schema.contacts.id, [quiet!.id, inDeal!.id, owner!.id, recent!.id]))).map((c) => c.id);
    expect(left.sort()).toEqual([inDeal!.id, owner!.id, recent!.id].sort());

    // Never: nothing goes.
    await runTool(tools.updateAutomationSettings, ctx, { retentionMonths: 0 });
    expect(await runTool(tools.previewRetention, ctx, {})).toMatchObject({ retentionMonths: 0, due: 0 });
  });
});
