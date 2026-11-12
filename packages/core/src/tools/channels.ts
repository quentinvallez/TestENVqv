import { and, desc, eq, inArray, notInArray, or, schema, sql } from "@viewing/db";
import { z } from "zod";
import { conversationFor, emailAgent, inboundAddress, sendMessage } from "../channels";
import { automationSettings } from "../automations/rules";
import { mailDomain, mailgunConfigured } from "../channels/email";
import { parsePortalEmail } from "../channels/portals";
import { samePhone } from "../channels/phone";
import { platformWhatsapp } from "../channels/whatsapp";
import { contactForInviteRef, parseInviteRef } from "../channels/whatsapp-invite";
import { canEncrypt, encrypt } from "../crypto";
import { recordEvent } from "../events";
import { exchangeCode, oauthConfigured, sealCredentials } from "../integrations/oauth";
import { defineTool, type ToolContext } from "../tool";
import { checkSender, forwardingCheckToken, markForwardingCheck, parseGmailForwardingConfirmation, portalDomains, storeGmailForwarding } from "./portal-forwarding";

/** An address at immoweb.be, zimmo.be or immovlan.be (or a subdomain). */
const fromPortal = (address: string | null) => Boolean(address && portalDomains.some((d) => new RegExp(`[@.]${d.replace(".", "\\.")}$`, "i").test(address)));

/** The original sender of a forwarded mail ("Van: Immoweb <noreply@immoweb.be>" in the first lines), if any. */
function forwardedSender(text: string): string | null {
  const line = text.slice(0, 2000).match(/^\s*(?:from|van|de|von)\s*:\s*(.+)$/im)?.[1];
  return line?.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0]?.toLowerCase() ?? null;
}
import { findOrCreateContact, receiveMessage } from "./conversations";

const { agents, agencySettings, calendarConnections, contacts, leads, listings, messages } = schema;

const portals = ["immoweb", "zimmo", "immovlan"] as const;
const portalNames = { immoweb: "Immoweb", zimmo: "Zimmo", immovlan: "Immovlan" } as const;

/** Stands in for the client's text when they only ticked "I want to visit"; in their language, so the planner answers in it. */
const visitNote = {
  nl: (portal: string, where: string) => `Aanvraag via ${portal}: wil ${where} graag bezoeken (geen bericht).`,
  fr: (portal: string, where: string) => `Demande via ${portal} : souhaite visiter ${where} (sans message).`,
  en: (portal: string, where: string) => `Request via ${portal}: would like a viewing of ${where} (no message).`,
};

/**
 * When the portals send leads straight to the inbox address, the agency still
 * gets each portal email: the original, forwarded to the listing's agent (or
 * the agency's copy address when no agent is known), with Reply-To the client.
 */
async function forwardLeadCopy(
  ctx: ToolContext,
  lead: { agentId: string | null; conversationId: string; clientEmail: string | null },
  original: { subject: string; text: string; from: { name: string | null; email: string } },
) {
  const [settings] = await ctx.db.select({ automations: agencySettings.automations, channels: agencySettings.channels }).from(agencySettings).where(eq(agencySettings.agencyId, ctx.agencyId));
  if (!automationSettings(settings?.automations).portalLeadCopies) return null;
  const [agent] = lead.agentId ? await ctx.db.select({ email: agents.email }).from(agents).where(and(eq(agents.agencyId, ctx.agencyId), eq(agents.id, lead.agentId))) : [];
  const to = agent?.email ?? settings?.channels.leadCopyAddress ?? null;
  if (!to) return null;
  const { absoluteUrl } = await import("../planner/agent");
  const sent = await emailAgent(ctx, {
    agentId: agent?.email ? lead.agentId : null,
    to,
    replyTo: lead.clientEmail,
    subject: /^(fwd?|tr|doorst)\s*:/i.test(original.subject) ? original.subject : `Fwd: ${original.subject}`,
    text: [
      `Lead added to your planner: ${absoluteUrl(`/inbox?c=${lead.conversationId}`)}`,
      `---------- Forwarded message ----------\nFrom: ${original.from.name ? `${original.from.name} <${original.from.email}>` : original.from.email}\nSubject: ${original.subject}`,
      original.text.trim(),
    ].join("\n\n"),
  });
  await recordEvent(ctx, { type: "portal_lead.copied", subjectType: "conversation", subjectId: lead.conversationId, data: { to, delivery: sent.delivery } });
  return sent;
}

export const receivePortalLead = defineTool({
  name: "portal_leads_receive",
  description:
    "Take in a lead from Immoweb, Zimmo or Immovlan: match the listing by its portal code or the agency's reference, create or update the contact and lead for the listing's agent, and let the planner draft a reply with free viewing times.",
  mutates: true,
  input: z.object({
    portal: z.enum(portals),
    name: z.string().trim().nullish(),
    email: z.string().trim().toLowerCase().email().nullish(),
    phone: z.string().trim().nullish(),
    message: z.string().trim().max(5000).nullish(),
    portalRef: z.string().trim().nullish().describe("The listing's code at the portal, e.g. Immoweb's 8-digit id"),
    agencyReference: z.string().trim().nullish(),
    listingId: z.string().optional().describe("When the caller already knows the listing"),
    language: z.enum(["nl", "fr", "en"]).nullish(),
    visitRequested: z.boolean().default(false).describe("The portal marked the request as a visit request"),
    externalId: z.string().max(500).optional(),
    useAi: z.boolean().default(true),
  }),
  run: async (ctx, input) => {
    if (!input.email && !input.phone) throw new Error("A portal lead needs an email address or a phone number");
    const refs = [input.portalRef, input.agencyReference].filter((r): r is string => Boolean(r));
    const [listing] = input.listingId
      ? await ctx.db.select().from(listings).where(and(eq(listings.agencyId, ctx.agencyId), eq(listings.id, input.listingId)))
      : refs.length
      ? await ctx.db
          .select()
          .from(listings)
          .where(
            and(
              eq(listings.agencyId, ctx.agencyId),
              or(
                ...(input.portalRef ? [sql`${listings.portalRefs}->>${input.portal} = ${input.portalRef}`] : []),
                inArray(sql`upper(${listings.reference})`, refs.map((r) => r.toUpperCase())),
              ),
            ),
          )
          .orderBy(desc(listings.updatedAt))
          .limit(1)
      : [];

    const contact = await findOrCreateContact(ctx, {
      name: input.name || input.email?.split("@")[0] || input.phone || "Unknown",
      email: input.email,
      phone: input.phone,
      language: input.language,
    });

    // One open lead per client and listing: a second request for the same home adds to the conversation.
    const [existing] = await ctx.db
      .select()
      .from(leads)
      .where(
        and(
          eq(leads.agencyId, ctx.agencyId),
          eq(leads.contactId, contact.id),
          listing ? eq(leads.listingId, listing.id) : sql`${leads.listingId} is null`,
          notInArray(leads.stage, ["won", "lost"]),
        ),
      )
      .limit(1);
    let lead = existing;
    if (lead) {
      [lead] = await ctx.db.update(leads).set({ updatedAt: new Date() }).where(eq(leads.id, lead.id)).returning();
    } else {
      [lead] = await ctx.db
        .insert(leads)
        .values({
          agencyId: ctx.agencyId,
          contactId: contact.id,
          listingId: listing?.id,
          agentId: listing?.agentId,
          source: input.portal,
          intent: listing?.transaction === "rent" ? "rent" : "buy",
          message: input.message,
        })
        .returning();
      await recordEvent(ctx, {
        type: "lead.created",
        subjectType: "lead",
        subjectId: lead!.id,
        data: { source: input.portal, listingId: listing?.id ?? null, matched: Boolean(listing) },
      });
    }

    const name = input.name || [contact.firstName, contact.lastName].filter(Boolean).join(" ") || input.email || input.phone!;
    const where = listing ? [listing.street, listing.houseNumber].filter(Boolean).join(" ") || listing.reference : (input.portalRef ?? "unknown listing");
    const received = await receiveMessage.run(ctx, {
      channel: "email",
      provider: "email",
      from: { name, email: input.email ?? undefined, phone: input.phone ?? undefined },
      subject: `${portalNames[input.portal]}: ${where}`,
      body: input.message || (input.visitRequested ? visitNote[input.language ?? "nl"](portalNames[input.portal], where) : `Request via ${portalNames[input.portal]} for ${where}, without a message.`),
      listingId: listing?.id,
      externalId: input.externalId,
      metadata: { portal: input.portal, portalRef: input.portalRef ?? null, leadId: lead!.id },
      useAi: input.useAi,
    });
    return { leadId: lead!.id, contactId: contact.id, listingId: listing?.id ?? null, agentId: lead!.agentId, newLead: !existing, ...received };
  },
});

export const receiveEmail = defineTool({
  name: "messages_receive_email",
  description:
    "Take in an email sent to the agency's forwarding address: a portal lead notification becomes a lead, anything else a message in the client's conversation.",
  mutates: true,
  input: z.object({
    from: z.object({ name: z.string().nullable(), email: z.string().trim().toLowerCase() }),
    replyTo: z.string().nullable().default(null),
    subject: z.string().default(""),
    text: z.string().default(""),
    strippedText: z.string().nullable().default(null),
    messageId: z.string().nullable().default(null),
    inReplyTo: z.string().nullable().default(null),
    references: z.array(z.string()).default([]),
    useAi: z.boolean().default(true),
  }),
  run: async (ctx, input) => {
    const recipient = (await inboundAddress(ctx)) ?? "";
    const portalLead = parsePortalEmail({ ...input, recipient });
    if (portalLead) {
      const { portal, ...lead } = portalLead;
      const result = await receivePortalLead.run(ctx, { portal, ...lead, externalId: input.messageId ?? undefined, useAi: input.useAi });
      // Sent straight by the portal (not forwarded by the agency's own mailbox, which already has it): send the agency its copy.
      const direct = fromPortal(input.from.email);
      if (direct && !("duplicate" in result && result.duplicate)) {
        await forwardLeadCopy(ctx, { agentId: result.agentId, conversationId: result.conversationId, clientEmail: lead.email }, { subject: input.subject, text: input.text, from: input.from });
      }
      return { kind: "portal_lead" as const, portal, ...result };
    }

    // Our forwarding test, forwarded back by an agent's Outlook rule (not sent straight to us).
    const checkToken = input.from.email !== checkSender() ? forwardingCheckToken(input) : null;
    if (checkToken && (await markForwardingCheck(ctx, checkToken))) return { kind: "ignored" as const, reason: "forwarding_check" };

    // Gmail asks to confirm forwarding by mailing the address itself: keep the code for Settings, it isn't a client.
    const gmailConfirmation = parseGmailForwardingConfirmation(input);
    if (gmailConfirmation) {
      await storeGmailForwarding(ctx, gmailConfirmation);
      return { kind: "ignored" as const, reason: "gmail_forwarding_confirmation" };
    }
    // The forwarding rule sends everything from the portals: invoices, newsletters and statistics are not clients.
    if (fromPortal(input.from.email) || fromPortal(forwardedSender(input.text))) return { kind: "ignored" as const, reason: "portal_not_a_lead" };

    // Mail from the agency's own agents (out-of-office replies, internal forwards) is not a client message.
    const [fromAgent] = await ctx.db.select({ id: agents.id }).from(agents).where(and(eq(agents.agencyId, ctx.agencyId), eq(agents.email, input.from.email)));
    if (fromAgent) return { kind: "ignored" as const, reason: "from_agent" };
    if (/^(mailer-daemon|postmaster|no-?reply)@/i.test(input.from.email)) return { kind: "ignored" as const, reason: "automatic" };

    const body = (input.strippedText || input.text).trim();
    if (!body) return { kind: "ignored" as const, reason: "empty" };
    const result = await receiveMessage.run(ctx, {
      channel: "email",
      provider: "email",
      from: { name: input.from.name || input.from.email.split("@")[0]!, email: input.from.email },
      subject: input.subject || undefined,
      body: body.slice(0, 10000),
      externalId: input.messageId ?? undefined,
      metadata: input.inReplyTo ? { inReplyTo: input.inReplyTo } : undefined,
      useAi: input.useAi,
    });
    return { kind: "message" as const, ...result };
  },
});

/**
 * A client who followed the "Prefer WhatsApp?" link in our email: their number
 * goes on their contact (so this message lands in their history) and WhatsApp
 * becomes their channel from now on.
 */
async function linkInvitedContact(ctx: ToolContext, text: string, phone: string) {
  const ref = parseInviteRef(text);
  const contact = ref ? await contactForInviteRef(ctx.db, ref, ctx.agencyId) : null;
  if (!contact || (contact.whatsappOptIn && samePhone(contact.phone, phone))) return;
  await ctx.db.update(contacts).set({ phone, whatsappOptIn: true }).where(and(eq(contacts.agencyId, ctx.agencyId), eq(contacts.id, contact.id)));
  await recordEvent(ctx, { type: "contact.whatsapp_opted_in", subjectType: "contact", subjectId: contact.id, data: { via: "email_invite", replacedPhone: contact.phone && !samePhone(contact.phone, phone) ? true : false } });
}

/**
 * WhatsApp accepted a message and failed it later (number not on WhatsApp,
 * template paused, …): send the same text by email once, so the client still
 * hears from us. The failed message keeps its status and points to the email.
 */
async function resendByEmail(ctx: ToolContext, messageId: string, error: string | null) {
  const message = await ctx.db.query.messages.findFirst({
    where: and(eq(messages.agencyId, ctx.agencyId), eq(messages.id, messageId)),
    with: { conversation: { with: { contact: true } } },
  });
  const contact = message?.conversation.contact;
  if (!message || message.direction !== "outbound" || message.metadata?.recoveredBy || !contact?.email) return null;
  const email = await conversationFor(ctx, {
    contactId: contact.id,
    channel: "email",
    listingId: message.conversation.listingId,
    agentId: message.conversation.agentId,
    leadId: message.conversation.leadId,
  });
  const sent = await sendMessage(ctx, {
    conversationId: email.id,
    body: message.body,
    kind: typeof message.metadata?.kind === "string" ? message.metadata.kind : undefined,
    metadata: { fallbackFrom: "whatsapp", fallbackReason: "whatsapp_failed", ...(error && { whatsappError: error }), retryOf: message.id },
  });
  if (sent.delivery !== "failed") {
    await ctx.db
      .update(messages)
      .set({ metadata: { ...message.metadata, recoveredBy: sent.messageId } })
      .where(eq(messages.id, message.id));
  }
  return sent;
}

export const receiveWhatsApp = defineTool({
  name: "messages_receive_whatsapp",
  description: "Take in WhatsApp messages and delivery updates for the agency's business number.",
  mutates: true,
  input: z.object({
    messages: z.array(z.object({ id: z.string(), from: z.string(), name: z.string().nullable(), text: z.string(), timestamp: z.coerce.date() })),
    statuses: z.array(z.object({ id: z.string(), status: z.enum(["sent", "delivered", "read", "failed"]), error: z.string().nullable() })),
    useAi: z.boolean().default(true),
  }),
  run: async (ctx, input) => {
    const received = [];
    for (const m of input.messages) {
      const phone = `+${m.from.replace(/\D/g, "")}`;
      await linkInvitedContact(ctx, m.text, phone);
      received.push(
        await receiveMessage.run(ctx, {
          channel: "whatsapp",
          provider: "whatsapp_business",
          from: { name: m.name || phone, phone },
          body: m.text.slice(0, 10000) || "[empty]",
          externalId: m.id,
          useAi: input.useAi,
        }),
      );
    }
    for (const s of input.statuses) {
      const [message] = await ctx.db
        .select({ id: messages.id, metadata: messages.metadata, conversationId: messages.conversationId })
        .from(messages)
        .where(and(eq(messages.agencyId, ctx.agencyId), eq(messages.externalId, s.id)));
      if (!message) continue;
      await ctx.db
        .update(messages)
        .set({ ...(s.status === "failed" && { delivery: "failed" as const }), metadata: { ...message.metadata, status: s.status, ...(s.error && { error: s.error }) } })
        .where(eq(messages.id, message.id));
      if (s.status === "failed") {
        await recordEvent(ctx, { type: "message.failed", subjectType: "conversation", subjectId: message.conversationId, data: { messageId: message.id, channel: "whatsapp", error: s.error } });
        await resendByEmail(ctx, message.id, s.error);
      }
    }
    return { received: received.length, statuses: input.statuses.length };
  },
});

/** Mailgun's reasons are long; keep the part an office can act on. */
const bounceReason = (reason: string | null) => (reason ?? "").replace(/\s+/g, " ").trim().slice(0, 300) || null;

export const markEmailBounced = defineTool({
  name: "messages_mark_bounced",
  description:
    "Mark a client email as not delivered after the mail provider reported a permanent failure (address doesn't exist, mailbox full for good, blocked as spam). The message shows as failed in the inbox and on the dashboard.",
  mutates: true,
  input: z.object({
    messageId: z.string().describe("The Message-ID header of the email we sent, with or without angle brackets"),
    recipient: z.string().nullable(),
    reason: z.string().nullable(),
  }),
  run: async (ctx, input) => {
    const id = input.messageId.trim().replace(/^<|>$/g, "");
    const [message] = await ctx.db
      .select({ id: messages.id, metadata: messages.metadata, conversationId: messages.conversationId, delivery: messages.delivery })
      .from(messages)
      .where(and(eq(messages.agencyId, ctx.agencyId), eq(messages.direction, "outbound"), inArray(messages.externalId, [`<${id}>`, id])));
    if (!message) return { found: false as const };
    if (message.delivery === "failed" && message.metadata?.bounced) return { found: true as const, messageId: message.id, duplicate: true };
    const reason = bounceReason(input.reason);
    await ctx.db
      .update(messages)
      .set({ delivery: "failed", metadata: { ...message.metadata, bounced: true, error: reason ?? "bounced", ...(input.recipient && { bouncedAddress: input.recipient }) } })
      .where(eq(messages.id, message.id));
    await recordEvent(ctx, { type: "message.failed", subjectType: "conversation", subjectId: message.conversationId, data: { messageId: message.id, channel: "email", error: reason, bounced: true } });
    return { found: true as const, messageId: message.id, duplicate: false };
  },
});

const failureLabels: Record<string, string> = {
  no_email: "No email address for this client",
  no_phone: "No phone number for this client",
  whatsapp_window_closed: "WhatsApp only allows a template after 24 hours, and there is no email address",
};

/** Plain words for why a message didn't arrive, for the office. */
export function failureLabel(metadata: Record<string, unknown> | null): string {
  const error = typeof metadata?.error === "string" ? metadata.error : null;
  if (metadata?.bounced) return `The email bounced${error && error !== "bounced" ? `: ${error}` : ""}`;
  if (error && failureLabels[error]) return failureLabels[error];
  const transport = metadata?.transport;
  const via = transport === "whatsapp_cloud" ? "WhatsApp" : transport === "gmail" ? "Gmail" : transport === "outlook" ? "Outlook" : transport === "mailgun" ? "The agency email" : "The channel";
  return `${via} refused it${error ? `: ${error.slice(0, 200)}` : ""}`;
}

export const listUndeliveredMessages = defineTool({
  name: "messages_list_undelivered",
  description:
    "Client messages from the last 14 days that didn't reach the client and weren't sent another way, with why; plus how many were only saved because no channel is connected. For the dashboard warning.",
  mutates: false,
  input: z.object({ days: z.number().int().min(1).max(60).default(14), limit: z.number().int().min(1).max(50).default(10) }),
  run: async (ctx, input) => {
    const since = new Date(Date.now() - input.days * 24 * 3600 * 1000);
    const base = and(eq(messages.agencyId, ctx.agencyId), eq(messages.direction, "outbound"), sql`${messages.sentAt} >= ${since}`);
    const failed = await ctx.db
      .select({
        id: messages.id,
        conversationId: messages.conversationId,
        sentAt: messages.sentAt,
        metadata: messages.metadata,
        channel: schema.conversations.channel,
        firstName: contacts.firstName,
        lastName: contacts.lastName,
      })
      .from(messages)
      .innerJoin(schema.conversations, eq(schema.conversations.id, messages.conversationId))
      .leftJoin(contacts, eq(contacts.id, schema.conversations.contactId))
      .where(and(base, eq(messages.delivery, "failed"), sql`${messages.metadata}->>'recoveredBy' is null`))
      .orderBy(desc(messages.sentAt))
      .limit(input.limit + 1);
    const [simulated] = await ctx.db
      .select({ count: sql<number>`count(*)::int` })
      .from(messages)
      .where(and(base, eq(messages.delivery, "simulated")));
    return {
      failed: failed.slice(0, input.limit).map((m) => ({
        messageId: m.id,
        conversationId: m.conversationId,
        sentAt: m.sentAt,
        channel: m.channel,
        client: [m.firstName, m.lastName].filter(Boolean).join(" ") || null,
        kind: typeof m.metadata?.kind === "string" ? m.metadata.kind : "reply",
        reason: failureLabel(m.metadata),
      })),
      more: failed.length > input.limit,
      simulated: simulated?.count ?? 0,
    };
  },
});

export const listConnections = defineTool({
  name: "connections_list",
  description: "An agent's connected Google or Outlook accounts (calendar and mailbox), and which providers the platform can connect.",
  mutates: false,
  input: z.object({ agentId: z.string() }),
  run: async (ctx, input) => {
    const rows = await ctx.db
      .select({
        id: calendarConnections.id,
        provider: calendarConnections.provider,
        accountEmail: calendarConnections.accountEmail,
        scopes: calendarConnections.scopes,
        status: calendarConnections.status,
        createdAt: calendarConnections.createdAt,
      })
      .from(calendarConnections)
      .where(and(eq(calendarConnections.agencyId, ctx.agencyId), eq(calendarConnections.agentId, input.agentId)))
      .orderBy(calendarConnections.createdAt);
    return { connections: rows, available: { google: oauthConfigured("google"), microsoft: oauthConfigured("microsoft") } };
  },
});

export const connectCalendar = defineTool({
  name: "calendar_connect",
  description: "Finish connecting an agent's Google or Microsoft account after they approved access: stores the encrypted tokens for calendar and mailbox.",
  mutates: true,
  input: z.object({ agentId: z.string(), provider: z.enum(["google", "microsoft"]), code: z.string(), redirectUri: z.string().url() }),
  run: async (ctx, input) => {
    const [agent] = await ctx.db.select({ id: agents.id }).from(agents).where(and(eq(agents.agencyId, ctx.agencyId), eq(agents.id, input.agentId)));
    if (!agent) throw new Error("Agent not found");
    const { credentials, email, capabilities } = await exchangeCode(input.provider, input.code, input.redirectUri);
    if (!email) throw new Error("The account did not share its email address");
    if (!credentials.refreshToken) throw new Error("No offline access was granted; please connect again");
    if (capabilities.length === 0) throw new Error("Calendar access was not granted");
    const values = { accountEmail: email, credentials: sealCredentials(credentials), scopes: capabilities, status: "active" as const, syncState: {} };
    const [connection] = await ctx.db
      .insert(calendarConnections)
      .values({ agencyId: ctx.agencyId, agentId: agent.id, provider: input.provider, ...values })
      .onConflictDoUpdate({ target: [calendarConnections.agentId, calendarConnections.provider], set: values })
      .returning();
    await recordEvent(ctx, {
      type: "calendar.connected",
      subjectType: "agent",
      subjectId: agent.id,
      data: { provider: input.provider, accountEmail: email, scopes: capabilities },
    });
    return { connectionId: connection!.id, accountEmail: email, scopes: capabilities };
  },
});

export const disconnectCalendar = defineTool({
  name: "calendar_disconnect",
  description: "Disconnect an agent's Google or Outlook account. Viewings already in their calendar stay there.",
  mutates: true,
  input: z.object({ connectionId: z.string() }),
  run: async (ctx, input) => {
    const [removed] = await ctx.db
      .delete(calendarConnections)
      .where(and(eq(calendarConnections.agencyId, ctx.agencyId), eq(calendarConnections.id, input.connectionId)))
      .returning({ agentId: calendarConnections.agentId, provider: calendarConnections.provider });
    if (!removed) throw new Error("Connection not found");
    await recordEvent(ctx, { type: "calendar.disconnected", subjectType: "agent", subjectId: removed.agentId, data: { provider: removed.provider } });
    return { disconnected: true };
  },
});

export const channelsStatus = defineTool({
  name: "channels_status",
  description: "How the agency's messages go out and come in: the forwarding address for replies and portal leads, email sending, WhatsApp number and connected mailboxes.",
  mutates: false,
  input: z.object({}),
  run: async (ctx) => {
    const address = await inboundAddress(ctx);
    const [settings] = await ctx.db.select({ channels: agencySettings.channels }).from(agencySettings).where(eq(agencySettings.agencyId, ctx.agencyId));
    const own = settings?.channels.whatsapp;
    const platform = platformWhatsapp();
    const mailboxes = await ctx.db
      .select({ agentName: agents.name, provider: calendarConnections.provider, accountEmail: calendarConnections.accountEmail, scopes: calendarConnections.scopes, status: calendarConnections.status })
      .from(calendarConnections)
      .innerJoin(agents, eq(agents.id, calendarConnections.agentId))
      .where(eq(calendarConnections.agencyId, ctx.agencyId));
    const [{ portalLeads } = { portalLeads: 0 }] = await ctx.db
      .select({ portalLeads: sql<number>`count(*)::int` })
      .from(leads)
      .where(and(eq(leads.agencyId, ctx.agencyId), inArray(leads.source, [...portals])));
    return {
      inboundAddress: address,
      email: { agencySending: mailgunConfigured(), domain: mailDomain() },
      whatsapp: own
        ? { status: "own" as const, number: own.displayNumber }
        : platform
          ? { status: "platform" as const, number: platform.displayNumber }
          : { status: "none" as const, number: null },
      canStoreTokens: canEncrypt(),
      mailboxes: mailboxes.map((m) => ({ ...m, sends: m.scopes.includes("mail") && m.status === "active" })),
      portalLeads,
    };
  },
});

export const connectWhatsApp = defineTool({
  name: "settings_connect_whatsapp",
  description: "Connect the agency's own WhatsApp Business number (Cloud API phone number id and a permanent access token), or disconnect it.",
  mutates: true,
  input: z.union([
    z.object({ phoneNumberId: z.string().trim().regex(/^\d{6,20}$/), displayNumber: z.string().trim().min(6).max(30), accessToken: z.string().trim().min(20) }),
    z.object({ disconnect: z.literal(true) }),
  ]),
  run: async (ctx, input) => {
    const [row] = await ctx.db.select({ channels: agencySettings.channels }).from(agencySettings).where(eq(agencySettings.agencyId, ctx.agencyId));
    const channels = { ...row?.channels };
    if ("disconnect" in input) {
      delete channels.whatsapp;
    } else {
      // Check the token works for that number before storing it.
      const response = await fetch(`https://graph.facebook.com/v21.0/${input.phoneNumberId}?fields=display_phone_number`, { headers: { authorization: `Bearer ${input.accessToken}` } });
      if (!response.ok) throw new Error("WhatsApp refused this phone number id and token");
      const [taken] = await ctx.db
        .select({ agencyId: agencySettings.agencyId })
        .from(agencySettings)
        .where(sql`${agencySettings.channels}->'whatsapp'->>'phoneNumberId' = ${input.phoneNumberId} and ${agencySettings.agencyId} <> ${ctx.agencyId}`);
      if (taken) throw new Error("This WhatsApp number is already connected to another agency");
      channels.whatsapp = { phoneNumberId: input.phoneNumberId, displayNumber: input.displayNumber, accessToken: encrypt(input.accessToken) };
    }
    await ctx.db
      .insert(agencySettings)
      .values({ agencyId: ctx.agencyId, channels })
      .onConflictDoUpdate({ target: agencySettings.agencyId, set: { channels } });
    await recordEvent(ctx, {
      type: "disconnect" in input ? "whatsapp.disconnected" : "whatsapp.connected",
      subjectType: "agency",
      subjectId: ctx.agencyId,
      data: "disconnect" in input ? {} : { displayNumber: input.displayNumber },
    });
    return { connected: !("disconnect" in input) };
  },
});
