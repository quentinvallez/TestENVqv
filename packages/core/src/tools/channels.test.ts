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
    // Leads first land as drafts here; the auto-reply test switches the (default) automatic reply back on.
    await runTool(tools.updateAutomationSettings, ctx, { replyToPortalLeadsAutomatically: false });
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

  it("invites email clients to WhatsApp and switches them over once they write first", async () => {
    vi.stubEnv("WHATSAPP_PHONE_NUMBER_ID", "1055");
    vi.stubEnv("WHATSAPP_ACCESS_TOKEN", "token");
    vi.stubEnv("WHATSAPP_VERIFY_NUMBER", "+32 470 00 11 22");
    const { conversationFor } = await import("../channels");
    const { agencyForWhatsApp } = await import("../inbound");
    const [contact] = await db.insert(schema.contacts).values({ agencyId, firstName: "Wout", email: "wout@example.be", phone: "0499 11 22 33", language: "nl" }).returning();
    const email = await conversationFor(ctx, { contactId: contact!.id });
    expect(email.channel).toBe("email");
    const sent = await sendMessage(ctx, { conversationId: email.id, body: "Beste Wout, hier zijn enkele momenten.", kind: "portal_reply" });
    const [message] = await db.select().from(schema.messages).where(eq(schema.messages.id, sent.messageId));
    expect(message!.body).toContain("Liever via WhatsApp?");
    const link = message!.body.match(/https:\/\/wa\.me\/\S+/)![0];
    expect(link).toContain("https://wa.me/32470001122?text=");
    const prefilled = new URL(link).searchParams.get("text")!;

    // They write from another number than the one the portal gave: the reference still finds them.
    expect(await agencyForWhatsApp("1055", "32488776655", prefilled)).toBe(agencyId);
    await runTool(tools.receiveWhatsApp, ctx, { messages: [{ id: "wamid.wout1", from: "32488776655", name: "Wout", text: prefilled, timestamp: new Date() }], statuses: [], useAi: false });
    const [after] = await db.select().from(schema.contacts).where(eq(schema.contacts.id, contact!.id));
    expect(after).toMatchObject({ phone: "+32488776655", whatsappOptIn: true });
    const conversations = await db.select().from(schema.conversations).where(eq(schema.conversations.contactId, contact!.id));
    expect(conversations.map((c) => c.channel).sort()).toEqual(["email", "whatsapp"]);
    expect((await conversationFor(ctx, { contactId: contact!.id })).channel).toBe("whatsapp");

    // Once on WhatsApp, emails stop inviting; agencies can also turn it off.
    const again = await sendMessage(ctx, { conversationId: email.id, body: "Nog een vraag?" });
    expect((await db.select().from(schema.messages).where(eq(schema.messages.id, again.messageId)))[0]!.body).toBe("Nog een vraag?");
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

  it("sends by email when WhatsApp isn't connected or refuses the message", async () => {
    const [contact] = await db.insert(schema.contacts).values({ agencyId, firstName: "Jens", email: "jens@example.be", phone: "+32470112233", whatsappOptIn: true }).returning();
    const { conversationFor } = await import("../channels");
    const whatsapp = await conversationFor(ctx, { contactId: contact!.id });
    expect(whatsapp.channel).toBe("whatsapp");

    // No WhatsApp number connected: email instead of "only saved".
    vi.stubEnv("MAILGUN_API_KEY", "key-test");
    vi.stubEnv("MAILGUN_DOMAIN", "mail.example.be");
    const mailgun = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", mailgun);
    const notConnected = await sendMessage(ctx, { conversationId: whatsapp.id, body: "Herinnering", kind: "reminder" });
    expect(notConnected).toMatchObject({ delivery: "sent", transport: "mailgun" });
    expect(notConnected.conversationId).not.toBe(whatsapp.id);
    const [first] = await db.select().from(schema.messages).where(eq(schema.messages.id, notConnected.messageId));
    expect(first!.metadata).toMatchObject({ fallbackFrom: "whatsapp", fallbackReason: "whatsapp_not_connected", kind: "reminder" });

    // Connected, but Meta refuses it right away.
    vi.stubEnv("WHATSAPP_PHONE_NUMBER_ID", "1055");
    vi.stubEnv("WHATSAPP_ACCESS_TOKEN", "token");
    const refusing = vi.fn(async (url: string) =>
      String(url).includes("graph.facebook.com") ? new Response(JSON.stringify({ error: { message: "Template paused" } }), { status: 400 }) : new Response("{}", { status: 200 }),
    );
    vi.stubGlobal("fetch", refusing);
    const refused = await sendMessage(ctx, { conversationId: whatsapp.id, body: "Herinnering", whatsappTemplate: { name: "viewing_reminder", language: "nl", params: ["Jens", "Kerkstraat 1", "di 28 okt 14:00", "Sofie"] } });
    expect(refused).toMatchObject({ delivery: "sent", transport: "mailgun" });
    const [second] = await db.select().from(schema.messages).where(eq(schema.messages.id, refused.messageId));
    expect(second!.metadata).toMatchObject({ fallbackReason: "whatsapp_error" });
  });

  it("re-sends by email when WhatsApp fails a message later, once", async () => {
    vi.stubEnv("WHATSAPP_PHONE_NUMBER_ID", "1055");
    vi.stubEnv("WHATSAPP_ACCESS_TOKEN", "token");
    vi.stubEnv("MAILGUN_API_KEY", "key-test");
    vi.stubEnv("MAILGUN_DOMAIN", "mail.example.be");
    const fetchMock = vi.fn(async (url: string) =>
      String(url).includes("graph.facebook.com") ? new Response(JSON.stringify({ messages: [{ id: "wamid.late1" }] }), { status: 200 }) : new Response("{}", { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const [contact] = await db.insert(schema.contacts).values({ agencyId, firstName: "Lotte", email: "lotte@example.be", phone: "+32470445566", whatsappOptIn: true }).returning();
    const { conversationFor } = await import("../channels");
    const whatsapp = await conversationFor(ctx, { contactId: contact!.id });
    const sent = await sendMessage(ctx, { conversationId: whatsapp.id, body: "Uw bezoek morgen", kind: "reminder", whatsappTemplate: { name: "viewing_reminder", language: "nl", params: ["Lotte", "Kerkstraat 1", "di 28 okt 14:00", "Sofie"] } });
    expect(sent).toMatchObject({ delivery: "sent", transport: "whatsapp_cloud" });

    const failed = { messages: [], statuses: [{ id: "wamid.late1", status: "failed" as const, error: "Message undeliverable" }] };
    await runTool(tools.receiveWhatsApp, ctx, failed);
    await runTool(tools.receiveWhatsApp, ctx, failed);
    const [original] = await db.select().from(schema.messages).where(eq(schema.messages.id, sent.messageId));
    expect(original!.delivery).toBe("failed");
    const recoveredBy = original!.metadata.recoveredBy as string;
    const [email] = await db.select().from(schema.messages).where(eq(schema.messages.id, recoveredBy));
    expect(email).toMatchObject({ body: "Uw bezoek morgen", delivery: "sent" });
    expect(email!.metadata).toMatchObject({ kind: "reminder", fallbackReason: "whatsapp_failed", retryOf: sent.messageId });
    const mails = fetchMock.mock.calls.filter((c) => String(c[0]).includes("mailgun"));
    expect(mails).toHaveLength(1);

    // Recovered, so it doesn't count as undelivered.
    const undelivered = await runTool(tools.listUndeliveredMessages, ctx, {});
    expect(undelivered.failed.map((m) => m.messageId)).not.toContain(sent.messageId);
  });

  it("sends from the agency address when the agent's mailbox refuses", async () => {
    vi.stubEnv("MAILGUN_API_KEY", "key-test");
    vi.stubEnv("MAILGUN_DOMAIN", "mail.example.be");
    vi.stubEnv("CALENDAR_TOKEN_KEY", "k".repeat(32));
    const { encrypt } = await import("../crypto");
    const [agent] = await db.select().from(schema.agents).where(eq(schema.agents.agencyId, agencyId)).limit(1);
    const [connection] = await db
      .insert(schema.calendarConnections)
      .values({
        agencyId,
        agentId: agent!.id,
        provider: "microsoft",
        accountEmail: "agent@outlook.example",
        scopes: ["calendar", "mail"],
        status: "active",
        credentials: encrypt(JSON.stringify({ accessToken: "a", refreshToken: "r", expiresAt: Date.now() + 3600_000 })),
      } as typeof schema.calendarConnections.$inferInsert)
      .returning();
    const fetchMock = vi.fn(async (url: string) =>
      String(url).includes("graph.microsoft.com") ? new Response(JSON.stringify({ error: { code: "InvalidAuthenticationToken" } }), { status: 401 }) : new Response("{}", { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const [contact] = await db.insert(schema.contacts).values({ agencyId, firstName: "Kato", email: "kato@example.be" }).returning();
    const { conversationFor } = await import("../channels");
    const conversation = await conversationFor(ctx, { contactId: contact!.id, agentId: agent!.id, subject: "Uw bezoek" });
    const sent = await sendMessage(ctx, { conversationId: conversation.id, body: "Dag Kato" });
    expect(sent).toMatchObject({ delivery: "sent", transport: "mailgun" });
    const form = fetchMock.mock.calls.map((c) => (c as unknown as [string, RequestInit])[1]?.body).find((b) => b instanceof URLSearchParams) as URLSearchParams;
    expect(form.get("from")).toMatch(/@mail\.example\.be>$/);
    const [message] = await db.select().from(schema.messages).where(eq(schema.messages.id, sent.messageId));
    expect(message!.metadata.mailboxError).toBeTruthy();
    await db.delete(schema.calendarConnections).where(eq(schema.calendarConnections.id, connection!.id));
  });

  it("marks a bounced email as not delivered and lists it for the office", async () => {
    vi.stubEnv("MAILGUN_API_KEY", "key-test");
    vi.stubEnv("MAILGUN_DOMAIN", "mail.example.be");
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 200 })));
    const [contact] = await db.insert(schema.contacts).values({ agencyId, firstName: "Senne", lastName: "Mertens", email: "senne@typo.example" }).returning();
    const { conversationFor } = await import("../channels");
    const conversation = await conversationFor(ctx, { contactId: contact!.id });
    const sent = await sendMessage(ctx, { conversationId: conversation.id, body: "Uw bezoek", kind: "reminder" });
    const [stored] = await db.select().from(schema.messages).where(eq(schema.messages.id, sent.messageId));

    const { agencyForEmailMessageId, parseMailgunFailure } = await import("../inbound");
    const event = {
      "event-data": {
        event: "failed",
        severity: "permanent",
        recipient: "senne@typo.example",
        message: { headers: { "message-id": stored!.externalId!.replace(/^<|>$/g, "") } },
        "delivery-status": { code: 550, message: "5.1.1 The email account that you tried to reach does not exist", description: "" },
      },
    };
    const failure = parseMailgunFailure(event)!;
    expect(parseMailgunFailure({ "event-data": { ...event["event-data"], severity: "temporary" } })).toBeNull();
    expect(await agencyForEmailMessageId(failure.messageId)).toBe(agencyId);
    expect(await runTool(tools.markEmailBounced, ctx, failure)).toMatchObject({ found: true, duplicate: false });
    expect(await runTool(tools.markEmailBounced, ctx, failure)).toMatchObject({ duplicate: true });

    const undelivered = await runTool(tools.listUndeliveredMessages, ctx, {});
    const row = undelivered.failed.find((m) => m.messageId === sent.messageId);
    expect(row).toMatchObject({ client: "Senne Mertens", kind: "reminder", channel: "email" });
    expect(row!.reason).toMatch(/^The email bounced: 5\.1\.1/);
    expect(undelivered.simulated).toBeGreaterThan(0);

    // Another agency's bounce can't touch this message.
    const other = { ...ctx, agencyId: newId("org") };
    expect(await runTool(tools.markEmailBounced, other, failure)).toMatchObject({ found: false });
  });

  it("answers a portal visit request on its own with times and the booking link, unless the agency set it to ask first", async () => {
    const lead = (n: number, ref = "21004871") => ({
      ...immowebLead(`<auto-${n}@immoweb.be>`),
      text: `Naam: Klant ${n}\nE-mail: klant${n}@example.be\nBericht: Kan ik dit appartement bezoeken?\n\nhttps://www.immoweb.be/nl/zoekertje/appartement/te-koop/berchem/2600/${ref}`,
    });
    const draftOnly = await runTool(tools.receiveEmail, ctx, lead(1));
    if (draftOnly.kind !== "portal_lead") throw new Error("not a portal lead");
    expect(draftOnly.autoReplied).toBeNull();

    await runTool(tools.updateAutomationSettings, ctx, { replyToPortalLeadsAutomatically: true });
    const auto = await runTool(tools.receiveEmail, ctx, lead(2));
    if (auto.kind !== "portal_lead") throw new Error("not a portal lead");
    expect(auto.autoReplied).toMatchObject({ status: "executed", delivery: "simulated" });
    const conversation = await runTool(tools.getConversation, ctx, { conversationId: auto.conversationId });
    const reply = conversation!.messages.at(-1)!;
    expect(reply).toMatchObject({ direction: "outbound", authorType: "agent", delivery: "simulated" });
    expect(reply.body).toContain(`/book/${auto.listingId}`);
    expect(reply.body).toMatch(/Beste Klant/);
    expect(conversation!.draft).toBeNull();
    const [proposal] = await db.select().from(schema.proposals).where(eq(schema.proposals.id, auto.proposalId!));
    expect(proposal).toMatchObject({ status: "executed", generatedBy: "template" });
    const lead2 = await db.query.leads.findFirst({ where: eq(schema.leads.id, auto.leadId) });
    expect(lead2!.stage).toBe("invited");

    // A listing under option gets no times or link, and the reply waits for approval.
    await db.update(schema.listings).set({ status: "under_offer" }).where(eq(schema.listings.id, auto.listingId!));
    const option = await runTool(tools.receiveEmail, ctx, lead(3));
    if (option.kind !== "portal_lead") throw new Error("not a portal lead");
    expect(option.autoReplied).toBeNull();
    const draft = (await runTool(tools.getConversation, ctx, { conversationId: option.conversationId }))!.draft!;
    expect(draft.input.body).toContain("onder optie");
    expect(draft.input.body).not.toContain("/book/");
    await db.update(schema.listings).set({ status: "active" }).where(eq(schema.listings.id, auto.listingId!));
    await runTool(tools.updateAutomationSettings, ctx, { replyToPortalLeadsAutomatically: false });
  });

  it("emails the agent when a client books on the website, without a connected mailbox", async () => {
    const { publicContext } = await import("../public");
    const client = publicContext(agencyId);
    const [listing] = await db.select().from(schema.listings).where(and(eq(schema.listings.agencyId, agencyId), eq(schema.listings.reference, "ANT-1042")));
    const { slots } = await runTool(tools.availableSlots, ctx, { listingId: listing!.id });
    const booked = await runTool(tools.bookViewing, client, { listingId: listing!.id, startsAt: slots[2]!.start, contact: { firstName: "Wout", email: "wout@example.be" } });
    const alerts = await db.select().from(schema.events).where(and(eq(schema.events.agencyId, agencyId), eq(schema.events.type, "agent.alerted"), eq(schema.events.subjectId, booked.appointmentId)));
    expect(alerts).toHaveLength(1);
    expect(alerts[0]!.data).toMatchObject({ action: "booked", delivery: "simulated" });

    vi.stubEnv("MAILGUN_API_KEY", "key-test");
    vi.stubEnv("MAILGUN_DOMAIN", "mail.example.be");
    const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await runTool(tools.cancelAppointment, client, { appointmentId: booked.appointmentId });
    const mail = fetchMock.mock.calls.map((c) => (c as unknown as [string, RequestInit])[1].body as URLSearchParams).find((f) => f.get("subject")?.startsWith("Bezoek geannuleerd"));
    expect(mail!.get("to")).toContain("sofie@demo-agency.be");
    expect(mail!.get("text")).toContain("Wout");

    // An agent cancelling in the app gets no email about it.
    const before = fetchMock.mock.calls.length;
    const again = await runTool(tools.bookViewing, client, { listingId: listing!.id, startsAt: slots[4]!.start, contact: { firstName: "Wout", email: "wout@example.be" } });
    const afterBooking = fetchMock.mock.calls.length;
    expect(afterBooking).toBeGreaterThan(before);
    await runTool(tools.cancelAppointment, ctx, { appointmentId: again.appointmentId });
    expect(fetchMock.mock.calls.slice(afterBooking).some((c) => ((c as unknown as [string, RequestInit])[1].body as URLSearchParams).get("subject")?.startsWith("Bezoek geannuleerd"))).toBe(false);
  });

  it("keeps Gmail's forwarding code for Settings and ignores other portal mail", async () => {
    const gmail = await runTool(tools.receiveEmail, ctx, {
      from: { name: "Gmail Team", email: "forwarding-noreply@google.com" },
      subject: "(#140253455) Gmail Forwarding Confirmation - Receive Mail from sofie.peeters@gmail.com",
      text: "Confirmation code: 140253455\n\nTo allow this, click: https://mail-settings.google.com/mail/vf-%5BANGjdJ8x%5D-abc\n",
      useAi: false,
    });
    expect(gmail).toMatchObject({ kind: "ignored", reason: "gmail_forwarding_confirmation" });
    const status = await runTool(tools.portalLeadsStatus, ctx, {});
    expect(status.gmailForwarding).toMatchObject({ code: "140253455", account: "sofie.peeters@gmail.com" });
    expect(status.gmailForwarding!.link).toMatch(/^https:\/\/mail-settings\.google\.com\/mail\/vf-/);
    expect(status.portals.find((p) => p.portal === "immoweb")!.count).toBeGreaterThan(0);

    const invoice = await runTool(tools.receiveEmail, ctx, { from: { name: "Immoweb", email: "facturation@immoweb.be" }, subject: "Uw factuur", text: "Bedrag: 120 EUR", useAi: false });
    expect(invoice).toMatchObject({ kind: "ignored", reason: "portal_not_a_lead" });
    const forwarded = await runTool(tools.receiveEmail, ctx, {
      from: { name: "Sofie", email: "sofie.peeters@outlook.com" },
      subject: "FW: Uw maandoverzicht",
      text: "Van: Zimmo <news@zimmo.be>\nOnderwerp: Uw maandoverzicht\n\nUw zoekertjes kregen 120 views.",
      useAi: false,
    });
    expect(forwarded).toMatchObject({ kind: "ignored", reason: "portal_not_a_lead" });
  });

  it("forwards the original portal email to the listing's agent when the portal sent it to us directly", async () => {
    vi.stubEnv("MAILGUN_API_KEY", "key-test");
    vi.stubEnv("MAILGUN_DOMAIN", "mail.example.be");
    const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const forms = () => fetchMock.mock.calls.map((c) => (c as unknown as [string, RequestInit])[1].body as URLSearchParams);
    const lead = (id: string, from = { name: "Immoweb", email: "noreply@immoweb.be" }) => ({
      ...immowebLead(id),
      from,
      subject: "Nieuwe aanvraag voor uw zoekertje",
      text: immowebLead(id).text.replace(/ruben\.vos/g, `lotte${id.length}`).replace("Ruben Vos", "Lotte Claes"),
    });

    await runTool(tools.receiveEmail, ctx, lead("<copy-1@immoweb.be>"));
    const copy = forms().find((f) => f.get("subject") === "Fwd: Nieuwe aanvraag voor uw zoekertje")!;
    expect(copy.get("to")).toContain("sofie@demo-agency.be");
    expect(copy.get("h:Reply-To")).toMatch(/^lotte\d+@example\.be$/);
    expect(copy.get("text")).toContain("Kan ik dit appartement bezoeken?");
    expect(copy.get("text")).toContain("/inbox?c=");

    // Forwarded by the agent's own mailbox: they already have it, no copy.
    const before = forms().length;
    await runTool(tools.receiveEmail, ctx, { ...lead("<copy-22@immoweb.be>"), from: { name: "Sofie", email: "sofie.peeters@outlook.com" } });
    expect(forms().slice(before).some((f) => f.get("subject")?.startsWith("Fwd:"))).toBe(false);

    // Turned off: no copy either.
    await runTool(tools.updateAutomationSettings, ctx, { portalLeadCopies: false });
    const off = forms().length;
    await runTool(tools.receiveEmail, ctx, lead("<copy-333@immoweb.be>"));
    expect(forms().slice(off).some((f) => f.get("subject")?.startsWith("Fwd:"))).toBe(false);
    await runTool(tools.updateAutomationSettings, ctx, { portalLeadCopies: true });
  });

  it("ignores mail from the agency's own agents", async () => {
    const result = await runTool(tools.receiveEmail, ctx, { from: { name: "Sofie", email: "sofie@demo-agency.be" }, subject: "Afwezig", text: "Ik ben afwezig.", useAi: false });
    expect(result).toMatchObject({ kind: "ignored", reason: "from_agent" });
  });
});
