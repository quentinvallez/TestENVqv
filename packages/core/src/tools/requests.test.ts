import { and, db, eq, inArray, newId, schema } from "@viewing/db";
import { expandShortLinks } from "../channels/short-links";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runAutomations } from "../automations/jobs";
import { tools } from "../registry";
import { runTool, type ToolContext } from "../tool";

const HOUR = 3600 * 1000;
const DAY = 24 * HOUR;

describe.skipIf(!process.env.DATABASE_URL)("viewing requests board", () => {
  const agencyId = newId("org");
  const ctx: ToolContext = { db, agencyId, actor: { type: "user", id: null } };
  let listingId: string;
  const page = "https://www.vastgoed-requests.be/nl/te-koop/berchem/appartement/1042";

  beforeAll(async () => {
    await db.insert(schema.organization).values({ id: agencyId, name: "Vastgoed Requests", slug: agencyId, createdAt: new Date() });
    await runTool(tools.seedDemoData, ctx, {});
    await db
      .insert(schema.agencySettings)
      .values({ agencyId, websiteUrl: "https://www.vastgoed-requests.be" })
      .onConflictDoUpdate({ target: schema.agencySettings.agencyId, set: { websiteUrl: "https://www.vastgoed-requests.be" } });
    const [listing] = await db.select().from(schema.listings).where(and(eq(schema.listings.agencyId, agencyId), eq(schema.listings.reference, "ANT-1042")));
    listingId = listing!.id;
    await db.update(schema.listings).set({ websiteUrl: page, status: "active" }).where(eq(schema.listings.id, listingId));
  });
  afterAll(async () => {
    await db.delete(schema.organization).where(eq(schema.organization.id, agencyId));
  });

  const form = (n: number, message: string, extra = "") => ({
    from: { name: "Website", email: "noreply@vastgoed-requests.be" },
    subject: "Contactformulier",
    text: `Naam: Klant ${n}\nE-mail: klant${n}@example.be\n${extra}Bericht: ${message}\n\nPagina: ${page}/`,
    messageId: `<form-${n}@vastgoed-requests.be>`,
    useAi: false,
  });
  const board = async () => (await runTool(tools.listRequests, ctx, {})).items;
  const item = async (id: string) => (await board()).find((i) => i.id === id);
  /** Moves everything sent in a request's conversations back in time. */
  const backdate = async (conversationId: string, by: number) => {
    const rows = await db.select().from(schema.messages).where(eq(schema.messages.conversationId, conversationId));
    for (const m of rows) await db.update(schema.messages).set({ sentAt: new Date(m.sentAt.getTime() - by) }).where(eq(schema.messages.id, m.id));
    const [conversation] = await db.update(schema.conversations).set({ lastMessageAt: new Date(Date.now() - by) }).where(eq(schema.conversations.id, conversationId)).returning();
    const [lead] = await db.select().from(schema.leads).where(eq(schema.leads.id, conversation!.leadId!));
    await db.update(schema.leads).set({ createdAt: new Date(lead!.createdAt.getTime() - by) }).where(eq(schema.leads.id, lead!.id));
  };

  it("takes a website form that asks to visit, sends the booking link, reminds after 24 and 72 hours, then closes as no response", async () => {
    const result = await runTool(tools.receiveEmail, ctx, form(1, "Is de tuin op het zuiden? Ik kom de woning graag bezoeken."));
    expect(result.kind).toBe("website_form");
    if (result.kind !== "website_form") return;
    expect(result.listingId).toBe(listingId);
    const lead = await db.query.leads.findFirst({ where: eq(schema.leads.id, result.leadId) });
    expect(lead).toMatchObject({ source: "website", stage: "invited" });
    expect(result.autoReplied).toMatchObject({ status: "executed" });
    expect(await item(result.leadId)).toMatchObject({ stage: "contacted", source: "website", listing: { id: listingId } });

    // A day later, still nothing booked: not planned yet, and the run sends one reminder with times and the link.
    await backdate(result.conversationId, 30 * HOUR);
    expect((await item(result.leadId))!.stage).toBe("not_planned");
    await runAutomations({ ...ctx, actor: { type: "system", id: null } }, new Date(), { useAi: false });
    const sent = await db.select().from(schema.messages).where(eq(schema.messages.conversationId, result.conversationId));
    const reminders = sent.filter((m) => m.metadata.kind === "nudge");
    expect(reminders).toHaveLength(1);
    expect(await expandShortLinks(db, reminders[0]!.body)).toContain(`/book/${listingId}`);
    expect(await item(result.leadId)).toMatchObject({ stage: "not_planned", remindedAt: reminders[0]!.sentAt });

    // The second reminder two days after the first (72 hours after the link), then no more.
    await backdate(result.conversationId, 2 * DAY);
    await runAutomations({ ...ctx, actor: { type: "system", id: null } }, new Date(), { useAi: false });
    const nudges = async () => (await db.select().from(schema.messages).where(eq(schema.messages.conversationId, result.conversationId))).filter((m) => m.metadata.kind === "nudge");
    expect(await nudges()).toHaveLength(2);
    expect(await item(result.leadId)).toMatchObject({ stage: "not_planned", reminders: 2 });
    await backdate(result.conversationId, 2 * DAY);
    await runAutomations({ ...ctx, actor: { type: "system", id: null } }, new Date(), { useAi: false });
    expect(await nudges()).toHaveLength(2);

    // Three days after the last reminder: closed, no response.
    await backdate(result.conversationId, 1 * DAY);
    expect(await item(result.leadId)).toMatchObject({ stage: "closed", reason: "no_response" });
  });

  it("puts a question without a visit request, and a phone-only portal lead, in front of a person", async () => {
    const question = await runTool(tools.receiveEmail, ctx, form(2, "Wat is het kadastraal inkomen?"));
    if (question.kind !== "website_form") throw new Error("not a website form");
    expect(question.autoReplied).toBeNull();
    expect(await item(question.leadId)).toMatchObject({ stage: "needs_you", reason: "draft" });

    const phoneOnly = await runTool(tools.receivePortalLead, ctx, { portal: "zimmo", name: "Bart Bel", phone: "0477 11 22 33", listingId, visitRequested: true, useAi: false });
    expect(await item(phoneOnly.leadId)).toMatchObject({ stage: "needs_you", reason: "phone_only", source: "zimmo" });

    // The agent called: contacted. Then the client says no: closed.
    await runTool(tools.markRequest, ctx, { id: phoneOnly.leadId, action: "handled" });
    expect(await item(phoneOnly.leadId)).toMatchObject({ stage: "contacted" });
    await runTool(tools.markRequest, ctx, { id: phoneOnly.leadId, action: "not_interested" });
    expect(await item(phoneOnly.leadId)).toMatchObject({ stage: "closed", reason: "not_interested" });
    await runTool(tools.markRequest, ctx, { id: phoneOnly.leadId, action: "reopen" });
    expect((await item(phoneOnly.leadId))!.stage).toBe("contacted");

    // Handling the question by hand drops the draft.
    await runTool(tools.markRequest, ctx, { id: question.leadId, action: "handled" });
    expect((await item(question.leadId))!.stage).toBe("contacted");
    const pending = await db.select().from(schema.proposals).where(and(eq(schema.proposals.conversationId, question.conversationId), eq(schema.proposals.status, "pending")));
    expect(pending).toHaveLength(0);
  });

  it("shows a booking from the website widget as planned, and only this agency's requests", async () => {
    const { slots } = await runTool(tools.availableSlots, ctx, { listingId, days: 14 });
    const booked = await runTool(tools.bookViewing, { ...ctx, actor: { type: "contact", id: null } }, {
      listingId,
      startsAt: slots[0]!.start,
      contact: { firstName: "Widget", email: "widget@example.be", whatsappOptIn: false },
      source: "website",
    });
    const items = await board();
    const mine = items.find((i) => i.viewing?.id === booked.appointmentId);
    expect(mine).toMatchObject({ stage: "planned", source: "website" });

    const other: ToolContext = { db, agencyId: newId("org"), actor: { type: "user", id: null } };
    expect((await runTool(tools.listRequests, other, {})).items).toHaveLength(0);
    const ids = items.filter((i) => i.kind === "lead").map((i) => i.id);
    const leads = await db.select({ agencyId: schema.leads.agencyId }).from(schema.leads).where(inArray(schema.leads.id, ids));
    expect(leads.every((l) => l.agencyId === agencyId)).toBe(true);
  });
});
