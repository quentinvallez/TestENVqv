import { db, eq, newId, schema } from "@viewing/db";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { sealCredentials } from "../integrations/oauth";
import { tools } from "../registry";
import { runTool, type ToolContext } from "../tool";

/** Reading portal leads straight from an agent's Outlook, against recorded-shape Graph responses. */
describe.skipIf(!process.env.DATABASE_URL)("Lead emails from Outlook", () => {
  const agencyId = newId("org");
  const ctx: ToolContext = { db, agencyId, actor: { type: "user", id: null } };
  let agentId: string;
  let connectionId: string;
  const calls: { url: string; method: string; body: unknown; auth: string | null }[] = [];
  let inbox: { id: string; receivedDateTime: string; from: { emailAddress: { name: string; address: string } }; subject: string; text: string; parentFolderId?: string }[] = [];
  let rules = [{ id: "rule-1", displayName: "Portal leads → planner" }];

  function graph(url: string, init: RequestInit = {}) {
    const body = typeof init.body === "string" ? JSON.parse(init.body) : null;
    calls.push({ url, method: init.method ?? "GET", body, auth: new Headers(init.headers).get("authorization") });
    const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
    if (url.endsWith("/v1.0/subscriptions") && init.method === "POST") return json({ id: "sub-1", expirationDateTime: body.expirationDateTime }, 201);
    if (url.includes("/v1.0/subscriptions/")) return init.method === "DELETE" ? new Response(null, { status: 204 }) : json({ id: "sub-1" });
    if (/\/me\/mailFolders\/(sentitems|drafts|outbox)\?/.test(url)) return json({ id: `folder-${url.split("/mailFolders/")[1]!.split("?")[0]}` });
    if (url.endsWith("/me/sendMail")) return new Response(null, { status: 202 });
    if (url.endsWith("/mailFolders/inbox/messageRules")) return json({ value: rules });
    if (url.includes("/mailFolders/inbox/messageRules/") && init.method === "DELETE") {
      rules = rules.filter((r) => !url.endsWith(r.id));
      return new Response(null, { status: 204 });
    }
    if (url.includes("/me/messages?")) {
      const since = new URL(url).searchParams.get("$filter")!.split(" ge ")[1]!;
      return json({ value: inbox.filter((m) => m.receivedDateTime >= since).map(({ id, receivedDateTime, from, parentFolderId }) => ({ id, receivedDateTime, from, parentFolderId: parentFolderId ?? "folder-inbox" })) });
    }
    if (url.includes("/me/messages/")) {
      const id = decodeURIComponent(url.split("/me/messages/")[1]!.split("?")[0]!);
      const m = inbox.find((x) => x.id === id)!;
      return json({ ...m, body: { contentType: "text", content: m.text }, internetMessageId: `<${id}@mail>`, text: undefined });
    }
    return json({ error: "unexpected" }, 500);
  }

  beforeAll(async () => {
    await db.insert(schema.organization).values({ id: agencyId, name: "Mailbox test", slug: agencyId, createdAt: new Date() });
    await db.insert(schema.agencySettings).values({ agencyId, websiteUrl: "https://www.immo-zone.be" });
    const [agent] = await db.insert(schema.agents).values({ agencyId, name: "Quentin", email: "quentin@immo-zone.be" }).returning();
    agentId = agent!.id;
  });
  afterAll(async () => {
    await db.delete(schema.organization).where(eq(schema.organization.id, agencyId));
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  function stub() {
    vi.stubEnv("CALENDAR_TOKEN_KEY", "k".repeat(40));
    vi.stubEnv("APP_URL", "https://testenvqv.vercel.app");
    vi.stubGlobal("fetch", vi.fn(graph));
  }

  it("needs Outlook connected with permission to read lead emails", async () => {
    stub();
    await expect(runTool(tools.startMailboxLeads, ctx, { connectionId: "cal_missing" })).rejects.toThrow(/Connect Outlook/);
    const [row] = await db.insert(schema.calendarConnections).values({
      agencyId,
      agentId,
      provider: "microsoft",
      accountEmail: "quentin@immo-zone.be",
      credentials: sealCredentials({ accessToken: "access-1", refreshToken: "refresh-1", expiresAt: Date.now() + 3600_000 }),
      scopes: ["calendar", "mail", "rules"],
      syncState: { portalRule: { ruleId: "rule-1", forwardTo: "x@mail.example.be", createdAt: new Date().toISOString() } },
    }).returning();
    connectionId = row!.id;
    await expect(runTool(tools.startMailboxLeads, ctx, { connectionId })).rejects.toThrow(/Connect Outlook again/);
  });

  it("starts with a new-email subscription and removes the forwarding rule, so leads don't come twice", async () => {
    stub();
    await db.update(schema.calendarConnections).set({ scopes: ["calendar", "mail", "rules", "leads"] }).where(eq(schema.calendarConnections.agentId, agentId));
    const started = await runTool(tools.startMailboxLeads, ctx, { connectionId });
    expect(started).toMatchObject({ notified: true, removedForwardingRule: true });
    const subscription = calls.find((c) => c.method === "POST" && c.url.endsWith("/subscriptions"))!;
    expect(subscription.body).toMatchObject({ changeType: "created", resource: "me/messages", notificationUrl: "https://testenvqv.vercel.app/api/channels/outlook/notifications" });
    expect(rules).toEqual([]);
    const status = await runTool(tools.portalLeadsStatus, ctx, {});
    expect(status.mailboxes[0]).toMatchObject({ canRead: true, forwarding: null, reading: { instant: true, leads: 0 } });
    expect(status.websiteDomain).toBe("immo-zone.be");
  });

  it("opens only lead emails, takes each in once, and never reads anything else", async () => {
    stub();
    const at = (min: number) => new Date(Date.now() + min * 60_000).toISOString();
    inbox = [
      { id: "m-client", receivedDateTime: at(1), from: { emailAddress: { name: "An", address: "an@example.be" } }, subject: "Private", text: "Naam: An\nE-mail: an@example.be" },
      {
        id: "m-immoweb",
        receivedDateTime: at(2),
        from: { emailAddress: { name: "Immoweb", address: "noreply@immoweb.be" } },
        subject: "Nieuwe aanvraag voor een bezoek",
        text: "Naam: Jan Peeters\nE-mail: jan.peeters@example.be\nTelefoon: 0470 12 34 56\nBericht: Ik wil graag bezoeken.",
      },
      // Sent by the mailbox itself (in Sent Items), even from a lead-like address: never opened.
      { id: "m-sent", receivedDateTime: at(2), from: { emailAddress: { name: "Immo Zone", address: "info@immo-zone.be" } }, subject: "Re: bezoek", text: "Naam: X\nE-mail: x@example.be", parentFolderId: "folder-sentitems" },
      { id: "m-newsletter", receivedDateTime: at(3), from: { emailAddress: { name: "Zimmo", address: "news@zimmo.be" } }, subject: "Uw maandoverzicht", text: "Statistieken van deze maand." },
    ];
    const read = await runTool(tools.syncMailboxLeads, ctx, { connectionId, useAi: false });
    expect(read).toMatchObject({ listed: 4, opened: 2, leads: 1, ignored: 1, failed: 0 });
    const opened = calls.filter((c) => c.url.includes("/me/messages/")).map((c) => c.url);
    expect(opened.some((u) => u.includes("m-client") || u.includes("m-sent"))).toBe(false);
    const leads = await db.select().from(schema.leads).where(eq(schema.leads.agencyId, agencyId));
    expect(leads).toHaveLength(1);
    expect(leads[0]).toMatchObject({ source: "immoweb" });
    // No conversation was made from the private email.
    const contacts = await db.select().from(schema.contacts).where(eq(schema.contacts.agencyId, agencyId));
    expect(contacts.map((c) => c.email)).toEqual(["jan.peeters@example.be"]);

    // The next notification lists the same emails again (overlap): nothing is opened or taken twice.
    const before = calls.length;
    const again = await runTool(tools.syncMailboxLeads, ctx, { connectionId, useAi: false });
    expect(again).toMatchObject({ listed: 4, opened: 0, leads: 0 });
    expect(calls.slice(before).some((c) => c.url.includes("/me/messages/"))).toBe(false);
    const status = await runTool(tools.portalLeadsStatus, ctx, {});
    expect(status.mailboxes[0]!.reading).toMatchObject({ leads: 1, error: null });
  });

  it("finds the mailbox for a notification only with the right subscription", async () => {
    const { mailboxForSubscription } = await import("../inbound");
    const found = await mailboxForSubscription("sub-1");
    expect(found).toMatchObject({ agencyId, connectionId });
    expect(found!.clientState).toMatch(/^[0-9a-f]{48}$/);
    expect(await mailboxForSubscription("sub-unknown")).toBeNull();
  });

  it("renews the subscription daily and stops cleanly", async () => {
    stub();
    const renewed = await runTool(tools.renewMailboxLeads, ctx, { useAi: false });
    expect(renewed.mailboxes).toEqual([{ connectionId, agentId, renewed: true, leads: 0 }]);
    expect(calls.some((c) => c.method === "PATCH" && c.url.endsWith("/subscriptions/sub-1"))).toBe(true);
    expect(await runTool(tools.stopMailboxLeads, ctx, { connectionId })).toEqual({ stopped: true });
    expect(calls.at(-1)).toMatchObject({ method: "DELETE" });
    expect((await runTool(tools.portalLeadsStatus, ctx, {})).mailboxes[0]!.reading).toBeNull();
    expect(await runTool(tools.syncMailboxLeads, ctx, { connectionId })).toMatchObject({ reading: false });
  });
  it("reads the office mailbox (info@) too, and replies go from it when the listing's agent has no mailbox", async () => {
    stub();
    const [office] = await db
      .insert(schema.calendarConnections)
      .values({
        agencyId,
        agentId: null,
        provider: "microsoft",
        accountEmail: "info@immo-zone.be",
        credentials: sealCredentials({ accessToken: "office-1", refreshToken: "r", expiresAt: Date.now() + 3600_000 }),
        scopes: ["mail", "leads"],
      })
      .returning();
    await runTool(tools.startMailboxLeads, ctx, { connectionId: office!.id });
    const status = await runTool(tools.portalLeadsStatus, ctx, {});
    expect(status.offices).toHaveLength(1);
    expect(status.offices[0]).toMatchObject({ agentName: "Office mailbox", accountEmail: "info@immo-zone.be", reading: { instant: true }, canForward: false, sendsForAgents: true });
    expect(status.mailboxes.map((m) => m.accountEmail)).toEqual(["quentin@immo-zone.be"]);

    // Leads also arrive at a second address (verkoop@): read too, but replies keep going from the first one.
    const [second] = await db
      .insert(schema.calendarConnections)
      .values({
        agencyId,
        agentId: null,
        provider: "microsoft",
        accountEmail: "verkoop@immo-zone.be",
        credentials: sealCredentials({ accessToken: "office-2", refreshToken: "r", expiresAt: Date.now() + 3600_000 }),
        scopes: ["mail", "leads"],
      })
      .returning();
    await runTool(tools.startMailboxLeads, ctx, { connectionId: second!.id });
    const both = await runTool(tools.portalLeadsStatus, ctx, {});
    expect(both.offices.map((o) => [o.accountEmail, o.sendsForAgents, Boolean(o.reading)])).toEqual([
      ["info@immo-zone.be", true, true],
      ["verkoop@immo-zone.be", false, true],
    ]);

    // A colleague without a connected mailbox: the client email leaves from info@, replies still reach the colleague.
    const [sofie] = await db.insert(schema.agents).values({ agencyId, name: "Sofie", email: "sofie@immo-zone.be" }).returning();
    const [contact] = await db.insert(schema.contacts).values({ agencyId, firstName: "Lies", email: "lies@example.be" }).returning();
    const { conversationFor, sendMessage } = await import("../channels");
    const conversation = await conversationFor(ctx, { contactId: contact!.id, agentId: sofie!.id, subject: "Bezoek" });
    expect(conversation.provider).toBe("outlook");
    const sent = await sendMessage(ctx, { conversationId: conversation.id, body: "Dag Lies" });
    expect(sent).toMatchObject({ delivery: "sent", transport: "outlook" });
    const mail = calls.filter((c) => c.url.endsWith("/me/sendMail")).at(-1)!;
    expect(mail.auth).toBe("Bearer office-1");
    expect((mail.body as { message: { replyTo: { emailAddress: { address: string } }[] } }).message.replyTo[0]!.emailAddress.address).toBe("sofie@immo-zone.be");

    // Quentin has his own Outlook: his client emails still leave from his address.
    const [jan] = await db.insert(schema.contacts).values({ agencyId, firstName: "Jan", email: "jan2@example.be" }).returning();
    const own = await conversationFor(ctx, { contactId: jan!.id, agentId, subject: "Bezoek" });
    await sendMessage(ctx, { conversationId: own.id, body: "Dag Jan" });
    expect(calls.filter((c) => c.url.endsWith("/me/sendMail")).at(-1)!.auth).toBe("Bearer access-1");

    // Disconnecting the office mailbox stops its subscription.
    const before = calls.length;
    await runTool(tools.disconnectCalendar, ctx, { connectionId: office!.id });
    await runTool(tools.disconnectCalendar, ctx, { connectionId: second!.id });
    expect(calls.slice(before).some((c) => c.method === "DELETE" && c.url.includes("/subscriptions/"))).toBe(true);
    expect((await runTool(tools.portalLeadsStatus, ctx, {})).offices).toEqual([]);
  });
});
