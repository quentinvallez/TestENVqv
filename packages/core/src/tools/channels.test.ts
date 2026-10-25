import { and, db, eq, newId, schema } from "@viewing/db";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { sendMessage } from "../channels";
import { tools } from "../registry";
import { runTool, type ToolContext } from "../tool";

describe.skipIf(!process.env.DATABASE_URL)("channels", () => {
  const agencyId = newId("org");
  const ctx: ToolContext = { db, agencyId, actor: { type: "user", id: null } };

  beforeAll(async () => {
    await db.insert(schema.organization).values({ id: agencyId, name: "Vastgoed Test", slug: agencyId, createdAt: new Date() });
    await runTool(tools.seedDemoData, ctx, {});
  });
  afterAll(async () => {
    await db.delete(schema.organization).where(eq(schema.organization.id, agencyId));
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  const immowebLead = (messageId: string) => ({
    from: { name: "Immoweb", email: "noreply@immoweb.be" },
    subject: "Nieuwe aanvraag voor uw zoekertje",
    text: "Naam: Ruben Vos\nE-mail: ruben.vos@example.be\nTelefoon: 0486 55 44 33\nBericht: Kan ik dit appartement bezoeken?\n\nhttps://www.immoweb.be/nl/zoekertje/appartement/te-koop/berchem/2600/21004871",
    messageId,
    useAi: false,
  });

  it("turns an Immoweb email into a lead for the listing's agent with a drafted reply", async () => {
    const result = await runTool(tools.receiveEmail, ctx, immowebLead("<lead-1@immoweb.be>"));
    expect(result.kind).toBe("portal_lead");
    if (result.kind !== "portal_lead") return;
    const lead = await db.query.leads.findFirst({ where: eq(schema.leads.id, result.leadId), with: { listing: true, agent: true } });
    expect(lead).toMatchObject({ source: "immoweb", stage: "new", intent: "buy" });
    expect(lead!.listing!.reference).toBe("ANT-1042");
    expect(lead!.agent!.name).toBe("Sofie Peeters");
    const conversation = await runTool(tools.getConversation, ctx, { conversationId: result.conversationId });
    expect(conversation!.messages.at(-1)!.body).toBe("Kan ik dit appartement bezoeken?");
    expect(conversation!.draft).not.toBeNull();
  });

  it("ignores the same email delivered twice and adds a second request to the same lead", async () => {
    const again = await runTool(tools.receiveEmail, ctx, immowebLead("<lead-1@immoweb.be>"));
    expect(again).toMatchObject({ kind: "portal_lead", duplicate: true });
    const second = await runTool(tools.receiveEmail, ctx, immowebLead("<lead-2@immoweb.be>"));
    expect(second).toMatchObject({ kind: "portal_lead", newLead: false });
    const leads = await db.select().from(schema.leads).where(and(eq(schema.leads.agencyId, agencyId), eq(schema.leads.source, "immoweb")));
    expect(leads.filter((l) => l.message === "Kan ik dit appartement bezoeken?")).toHaveLength(1);
  });

  it("matches a WhatsApp number to a contact saved in national format", async () => {
    const [contact] = await db.insert(schema.contacts).values({ agencyId, firstName: "Eva", phone: "0477 12 34 56" }).returning();
    await runTool(tools.receiveWhatsApp, ctx, { messages: [{ id: "wamid.eva1", from: "32477123456", name: "Eva", text: "Is het huis nog vrij?", timestamp: new Date() }], statuses: [], useAi: false });
    const [conversation] = await db.select().from(schema.conversations).where(eq(schema.conversations.contactId, contact!.id));
    expect(conversation).toMatchObject({ channel: "whatsapp", provider: "whatsapp_business" });
    const [updated] = await db.select().from(schema.contacts).where(eq(schema.contacts.id, contact!.id));
    expect(updated!.whatsappOptIn).toBe(true);
  });

  it("stores messages as simulated while no channel is connected", async () => {
    const [contact] = await db.insert(schema.contacts).values({ agencyId, firstName: "Nora", email: "nora@example.be" }).returning();
    const { conversationFor } = await import("../channels");
    const conversation = await conversationFor(ctx, { contactId: contact!.id });
    expect(conversation).toMatchObject({ channel: "email", provider: "email" });
    const sent = await sendMessage(ctx, { conversationId: conversation.id, body: "Dag Nora", kind: "reminder" });
    expect(sent).toMatchObject({ delivery: "simulated", transport: "none" });
    const [message] = await db.select().from(schema.messages).where(eq(schema.messages.id, sent.messageId));
    expect(message!.metadata).toMatchObject({ kind: "reminder" });
  });

  it("sends email through Mailgun EU from the agency's forwarding address", async () => {
    vi.stubEnv("MAILGUN_API_KEY", "key-test");
    vi.stubEnv("MAILGUN_DOMAIN", "mail.example.be");
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ id: "<x>" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const [contact] = await db.insert(schema.contacts).values({ agencyId, firstName: "Bart", email: "bart@example.be" }).returning();
    const { conversationFor } = await import("../channels");
    const conversation = await conversationFor(ctx, { contactId: contact!.id, subject: "Uw bezoek" });
    const sent = await sendMessage(ctx, { conversationId: conversation.id, body: "Dag Bart" });
    expect(sent).toMatchObject({ delivery: "sent", transport: "mailgun" });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.eu.mailgun.net/v3/mail.example.be/messages");
    const form = init.body as URLSearchParams;
    expect(form.get("to")).toBe('"Bart" <bart@example.be>');
    expect(form.get("h:Reply-To")).toMatch(/@mail\.example\.be$/);
    expect(form.get("subject")).toBe("Uw bezoek");
  });

  it("falls back to email when the WhatsApp window is closed and no template is given", async () => {
    vi.stubEnv("WHATSAPP_PHONE_NUMBER_ID", "1055");
    vi.stubEnv("WHATSAPP_ACCESS_TOKEN", "token");
    const [contact] = await db.insert(schema.contacts).values({ agencyId, firstName: "Ilse", email: "ilse@example.be", phone: "+32470998877", whatsappOptIn: true }).returning();
    const { conversationFor } = await import("../channels");
    const whatsapp = await conversationFor(ctx, { contactId: contact!.id });
    expect(whatsapp.channel).toBe("whatsapp");
    const sent = await sendMessage(ctx, { conversationId: whatsapp.id, body: "Herinnering", kind: "reminder" });
    expect(sent.conversationId).not.toBe(whatsapp.id);
    expect(sent.delivery).toBe("simulated");

    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ messages: [{ id: "wamid.out1" }] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const templated = await sendMessage(ctx, { conversationId: whatsapp.id, body: "Herinnering", whatsappTemplate: { name: "viewing_reminder", language: "nl", params: ["Ilse", "Kerkstraat 1", "di 28 okt 14:00", "Sofie"] } });
    expect(templated).toMatchObject({ delivery: "sent", transport: "whatsapp_cloud", conversationId: whatsapp.id });
    const payload = JSON.parse((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(payload).toMatchObject({ to: "32470998877", type: "template", template: { name: "viewing_reminder", language: { code: "nl" } } });

    await runTool(tools.receiveWhatsApp, ctx, { messages: [], statuses: [{ id: "wamid.out1", status: "failed", error: "Number not on WhatsApp" }] });
    const [message] = await db.select().from(schema.messages).where(eq(schema.messages.id, templated.messageId));
    expect(message!.delivery).toBe("failed");
  });

  it("ignores mail from the agency's own agents", async () => {
    const result = await runTool(tools.receiveEmail, ctx, { from: { name: "Sofie", email: "sofie@demo-agency.be" }, subject: "Afwezig", text: "Ik ben afwezig.", useAi: false });
    expect(result).toMatchObject({ kind: "ignored", reason: "from_agent" });
  });
});
