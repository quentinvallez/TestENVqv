import { and, desc, eq, inArray, isNull, notInArray, or, schema, sql } from "@viewing/db";
import { z } from "zod";
import { conversationFor, emailAgent, inboundAddress, repliesToAgent, sendMessage } from "../channels";
import { automationSettings } from "../automations/rules";
import { mailDomain, mailgunConfigured } from "../channels/email";
import { forwardedSender, parsePortalEmail, portalNames, portalOfAddress, portals } from "../channels/portals";
import { pageKey, parseWebsiteForm } from "../channels/website-form";
import { samePhone } from "../channels/phone";
import { metaErrorText, platformWhatsapp, sendWhatsApp, whatsappConfig, whatsappProblem } from "../channels/whatsapp";
import { contactForInviteRef, parseInviteRef } from "../channels/whatsapp-invite";
import { canEncrypt, encrypt } from "../crypto";
import { recordEvent } from "../events";
import { exchangeCode, oauthConfigured, sealCredentials } from "../integrations/oauth";
import { defineTool, type ToolContext } from "../tool";
import { checkSender, forwardingCheckToken, markForwardingCheck, parseGmailForwardingConfirmation, storeGmailForwarding } from "./portal-forwarding";

/** An address at one of the portals' domains (or a subdomain). */
const fromPortal = (address: string | null) => Boolean(portalOfAddress(address));

import { findOrCreateContact, receiveMessage } from "./conversations";

const { agents, agencySettings, calendarConnections, contacts, conversations, leads, listings, messages } = schema;


/** Stands in for the client's text when they only ticked "I want to visit"; in their language, so the planner answers in it. */
const visitNote = {
  nl: (portal: string, where: string) => `Aanvraag via ${portal}: wil ${where} graag bezoeken (geen bericht).`,
  fr: (portal: string, where: string) => `Demande via ${portal} : souhaite visiter ${where} (sans message).`,
  en: (portal: string, where: string) => `Request via ${portal}: would like a viewing of ${where} (no message).`,
  de: (portal: string, where: string) => `Anfrage über ${portal}: möchte ${where} besichtigen (ohne Nachricht).`,
};

/**
 * When the portals send leads straight to the inbox address, the agency still
 * gets each portal email: the original, forwarded to the listing's agent (or
 * the agency's copy address when no agent is known), with Reply-To the client.
 */
async function forwardLeadCopy(
  ctx: ToolContext,
  lead: { leadId: string; agentId: string | null; conversationId: string; clientEmail: string | null },
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
      `Request added to your planner: ${absoluteUrl(`/requests/${lead.leadId}`)}`,
      `---------- Forwarded message ----------\nFrom: ${original.from.name ? `${original.from.name} <${original.from.email}>` : original.from.email}\nSubject: ${original.subject}`,
      original.text.trim(),
    ].join("\n\n"),
  });
  await recordEvent(ctx, { type: "portal_lead.copied", subjectType: "conversation", subjectId: lead.conversationId, data: { to, delivery: sent.delivery } });
  return sent;
}

/** Where a request came from, as the client's message names it. */
const sourceNames = { ...portalNames, website: "website" } as const;

export const receivePortalLead = defineTool({
  name: "portal_leads_receive",
  description:
    "Take in a viewing request from Immoweb, Zimmo, Immovlan, Immoscoop or the contact form on the agency's own website: match the listing by its portal code, page address or the agency's reference, create or update the contact and lead for the listing's agent, and let the planner answer with free viewing times and the booking link.",
  mutates: true,
  input: z.object({
    portal: z.enum([...portals, "website"]),
    name: z.string().trim().nullish(),
    email: z.string().trim().toLowerCase().email().nullish(),
    phone: z.string().trim().nullish(),
    message: z.string().trim().max(5000).nullish(),
    portalRef: z.string().trim().nullish().describe("The listing's code at the portal, e.g. Immoweb's 8-digit id"),
    agencyReference: z.string().trim().nullish(),
    listingId: z.string().optional().describe("When the caller already knows the listing"),
    listingUrl: z.string().nullish().describe("The listing's page on the agency's website (contact forms)"),
    language: z.enum(["nl", "fr", "en", "de"]).nullish(),
    visitRequested: z.boolean().default(false).describe("The portal marked the request as a visit request"),
    externalId: z.string().max(500).optional(),
    useAi: z.boolean().default(true),
  }),
  run: async (ctx, input) => {
    if (!input.email && !input.phone) throw new Error("A portal lead needs an email address or a phone number");
    const refs = [input.portalRef, input.agencyReference].filter((r): r is string => Boolean(r));
    const [listing] = input.listingId
      ? await ctx.db.select().from(listings).where(and(eq(listings.agencyId, ctx.agencyId), eq(listings.id, input.listingId)))
      : input.listingUrl
      ? await ctx.db.select().from(listings).where(and(eq(listings.agencyId, ctx.agencyId), eq(listings.websiteUrl, input.listingUrl))).limit(1)
      : refs.length
      ? await ctx.db
          .select()
          .from(listings)
          .where(
            and(
              eq(listings.agencyId, ctx.agencyId),
              or(
                ...(input.portalRef && input.portal !== "website" ? [sql`${listings.portalRefs}->>${input.portal} = ${input.portalRef}`] : []),
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
    const sourceName = sourceNames[input.portal];
    const received = await receiveMessage.run(ctx, {
      channel: "email",
      provider: "email",
      from: { name, email: input.email ?? undefined, phone: input.phone ?? undefined },
      subject: `${input.portal === "website" ? "Website form" : sourceName}: ${where}`,
      body: input.message || (input.visitRequested ? visitNote[input.language ?? "en"](sourceName, where) : `Request via ${sourceName} for ${where}, without a message.`),
      listingId: listing?.id,
      externalId: input.externalId,
      metadata: { portal: input.portal, portalRef: input.portalRef ?? null, leadId: lead!.id },
      useAi: input.useAi,
    });
    return { leadId: lead!.id, contactId: contact.id, listingId: listing?.id ?? null, agentId: lead!.agentId, newLead: !existing, ...received };
  },
});

/** The request in a mail sent by the agency's website contact form, matched against its listing pages. */
async function websiteFormLead(ctx: ToolContext, email: { from: { name: string | null; email: string }; replyTo: string | null; subject: string; text: string; messageId: string | null; inReplyTo: string | null; references: string[]; strippedText: string | null }) {
  const [settings] = await ctx.db.select({ websiteUrl: agencySettings.websiteUrl }).from(agencySettings).where(eq(agencySettings.agencyId, ctx.agencyId));
  if (!settings?.websiteUrl) return null;
  const pages = await ctx.db
    .select({ url: listings.websiteUrl })
    .from(listings)
    .where(and(eq(listings.agencyId, ctx.agencyId), sql`${listings.websiteUrl} is not null`));
  const lead = parseWebsiteForm({ ...email, recipient: "" }, { url: settings.websiteUrl, listingUrls: pages.map((p) => p.url!) });
  if (!lead) return null;
  // Stored page addresses may differ in form (www, trailing slash): pass the stored one.
  const listingUrl = lead.listingUrl ? (pages.find((p) => pageKey(p.url!) === pageKey(lead.listingUrl!))?.url ?? null) : null;
  return { ...lead, listingUrl };
}

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
    fromMailbox: z
      .boolean()
      .default(false)
      .describe("Read from an agent's own Outlook rather than sent to the inbox address: only a lead is taken in, and the agency already has the original"),
  }),
  run: async (ctx, input) => {
    const recipient = (await inboundAddress(ctx)) ?? "";
    const portalLead = parsePortalEmail({ ...input, recipient });
    if (portalLead) {
      const { portal, ...lead } = portalLead;
      const result = await receivePortalLead.run(ctx, { portal, ...lead, externalId: input.messageId ?? undefined, useAi: input.useAi });
      // Sent straight by the portal (not forwarded by the agency's own mailbox, which already has it): send the agency its copy.
      const direct = fromPortal(input.from.email) && !input.fromMailbox;
      if (direct && !("duplicate" in result && result.duplicate)) {
        await forwardLeadCopy(ctx, { leadId: result.leadId, agentId: result.agentId, conversationId: result.conversationId, clientEmail: lead.email }, { subject: input.subject, text: input.text, from: input.from });
      }
      return { kind: "portal_lead" as const, portal, ...result };
    }

    // The contact form on the agency's own website: a request like a portal's, answered with the booking link when it asks to visit.
    const websiteLead = await websiteFormLead(ctx, input);
    if (websiteLead) {
      const result = await receivePortalLead.run(ctx, { portal: "website", ...websiteLead, externalId: input.messageId ?? undefined, useAi: input.useAi });
      return { kind: "website_form" as const, ...result };
    }

    // From a mailbox we read (office or agent) we only take in leads: anything else is theirs, not ours to read.
    if (input.fromMailbox) return { kind: "ignored" as const, reason: "not_a_lead" };

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
    // A reply to one of our emails, which also went to the agent's own mailbox: the agent answers it there.
    const answers = [input.inReplyTo, ...input.references].filter((id): id is string => Boolean(id));
    const replyToOurs =
      answers.length > 0 &&
      (await repliesToAgent(ctx)) &&
      Boolean((await ctx.db.select({ id: messages.id }).from(messages).where(and(eq(messages.agencyId, ctx.agencyId), eq(messages.direction, "outbound"), inArray(messages.externalId, answers))).limit(1))[0]);
    const result = await receiveMessage.run(ctx, {
      channel: "email",
      provider: "email",
      from: { name: input.from.name || input.from.email.split("@")[0]!, email: input.from.email },
      subject: input.subject || undefined,
      body: body.slice(0, 10000),
      externalId: input.messageId ?? undefined,
      metadata: input.inReplyTo ? { inReplyTo: input.inReplyTo, ...(replyToOurs && { copyOnly: true }) } : undefined,
      useAi: input.useAi,
      copyOnly: replyToOurs,
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
  // Already went by email too: point to that copy instead of sending it twice.
  if (typeof message.metadata?.emailCopy === "string") {
    await ctx.db.update(messages).set({ metadata: { ...message.metadata, recoveredBy: message.metadata.emailCopy } }).where(eq(messages.id, message.id));
    return null;
  }
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
  description:
    "Finish connecting an agent's Google or Microsoft account after they approved access: stores the encrypted tokens for calendar and mailbox. Without agentId it connects the agency's office mailbox (e.g. info@), used to read lead emails and to send replies when the listing's agent has no mailbox.",
  mutates: true,
  input: z.object({ agentId: z.string().nullable(), provider: z.enum(["google", "microsoft"]), code: z.string(), redirectUri: z.string().url() }),
  run: async (ctx, input) => {
    if (input.agentId) {
      const [agent] = await ctx.db.select({ id: agents.id }).from(agents).where(and(eq(agents.agencyId, ctx.agencyId), eq(agents.id, input.agentId)));
      if (!agent) throw new Error("Agent not found");
    }
    const { credentials, email, capabilities } = await exchangeCode(input.provider, input.code, input.redirectUri);
    if (!email) throw new Error("The account did not share its email address");
    if (!credentials.refreshToken) throw new Error("No offline access was granted; please connect again");
    if (capabilities.length === 0) throw new Error("Calendar access was not granted");
    const values = { accountEmail: email, credentials: sealCredentials(credentials), scopes: capabilities, status: "active" as const, syncState: {} };
    let connection: { id: string } | undefined;
    if (input.agentId) {
      [connection] = await ctx.db
        .insert(calendarConnections)
        .values({ agencyId: ctx.agencyId, agentId: input.agentId, provider: input.provider, ...values })
        .onConflictDoUpdate({ target: [calendarConnections.agentId, calendarConnections.provider], set: values })
        .returning({ id: calendarConnections.id });
    } else {
      // One office mailbox per agency: a new one replaces the old (whose lead reading stops first).
      const [old] = await ctx.db
        .select({ id: calendarConnections.id, provider: calendarConnections.provider, syncState: calendarConnections.syncState })
        .from(calendarConnections)
        .where(and(eq(calendarConnections.agencyId, ctx.agencyId), isNull(calendarConnections.agentId)));
      if (old && old.provider === "microsoft" && old.syncState.leadReading) {
        const { stopMailboxLeads } = await import("./mailbox-leads");
        await stopMailboxLeads.run(ctx, { connectionId: old.id }).catch((error) => console.error("Stopping lead reading failed", error));
      }
      [connection] = old
        ? await ctx.db.update(calendarConnections).set({ provider: input.provider, ...values }).where(eq(calendarConnections.id, old.id)).returning({ id: calendarConnections.id })
        : await ctx.db.insert(calendarConnections).values({ agencyId: ctx.agencyId, agentId: null, provider: input.provider, ...values }).returning({ id: calendarConnections.id });
    }
    await recordEvent(ctx, {
      type: input.agentId ? "calendar.connected" : "office_mailbox.connected",
      ...(input.agentId ? { subjectType: "agent" as const, subjectId: input.agentId } : { subjectType: "agency" as const, subjectId: ctx.agencyId }),
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
    const [connection] = await ctx.db
      .select({ agentId: calendarConnections.agentId, provider: calendarConnections.provider, syncState: calendarConnections.syncState })
      .from(calendarConnections)
      .where(and(eq(calendarConnections.agencyId, ctx.agencyId), eq(calendarConnections.id, input.connectionId)));
    // Stop Outlook's new-email notifications first, while we still hold the token.
    if (connection?.provider === "microsoft" && connection.syncState.leadReading) {
      const { stopMailboxLeads } = await import("./mailbox-leads");
      await stopMailboxLeads.run(ctx, { connectionId: input.connectionId }).catch((error) => console.error("Stopping lead reading failed", error));
    }
    const [removed] = await ctx.db
      .delete(calendarConnections)
      .where(and(eq(calendarConnections.agencyId, ctx.agencyId), eq(calendarConnections.id, input.connectionId)))
      .returning({ agentId: calendarConnections.agentId, provider: calendarConnections.provider });
    if (!removed) throw new Error("Connection not found");
    await recordEvent(ctx, {
      type: removed.agentId ? "calendar.disconnected" : "office_mailbox.disconnected",
      ...(removed.agentId ? { subjectType: "agent" as const, subjectId: removed.agentId } : { subjectType: "agency" as const, subjectId: ctx.agencyId }),
      data: { provider: removed.provider },
    });
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

const sampleParams = {
  nl: ["Quentin", "do 19 nov. om 14:00", "Kerkstraat 1, Gent", "Sofie", "https://testenvqv.vercel.app/a/test"],
  fr: ["Quentin", "jeu. 19 nov. à 14:00", "Kerkstraat 1, Gent", "Sofie", "https://testenvqv.vercel.app/a/test"],
  en: ["Quentin", "Thu 19 Nov at 14:00", "Kerkstraat 1, Gent", "Sofie", "https://testenvqv.vercel.app/a/test"],
  de: ["Quentin", "Do. 19. Nov. um 14:00", "Kerkstraat 1, Gent", "Sofie", "https://testenvqv.vercel.app/a/test"],
};

/**
 * Settings → WhatsApp → Check: what Meta says about the number and token, the
 * last WhatsApp messages and why any went by email instead, and optionally a
 * real booking_confirmed template to a phone, with Meta's answer word for word.
 */
export const checkWhatsApp = defineTool({
  name: "channels_check_whatsapp",
  description:
    "Check the WhatsApp connection: the number and token as Meta sees them, recent WhatsApp messages with their delivery status and errors, and optionally send the booking_confirmed template to a test phone.",
  mutates: true,
  input: z.object({ phone: z.string().trim().max(30).optional(), language: z.enum(["nl", "fr", "en", "de"]).default("nl") }),
  run: async (ctx, input) => {
    const config = await whatsappConfig(ctx);
    const recentSends = await ctx.db
      .select({ sentAt: messages.sentAt, delivery: messages.delivery, metadata: messages.metadata })
      .from(messages)
      .innerJoin(conversations, eq(conversations.id, messages.conversationId))
      .where(and(eq(messages.agencyId, ctx.agencyId), eq(conversations.channel, "whatsapp"), eq(messages.direction, "outbound")))
      .orderBy(desc(messages.sentAt))
      .limit(8);
    const recentFallbacks = await ctx.db
      .select({ sentAt: messages.sentAt, metadata: messages.metadata })
      .from(messages)
      .where(and(eq(messages.agencyId, ctx.agencyId), sql`${messages.metadata}->>'fallbackFrom' = 'whatsapp'`))
      .orderBy(desc(messages.sentAt))
      .limit(8);
    const text = (v: unknown) => (typeof v === "string" && v ? v : null);
    const recent = {
      sent: recentSends.map((m) => {
        const error = text(m.metadata.error);
        return { at: m.sentAt.toISOString(), delivery: m.delivery, status: text(m.metadata.status), template: text(m.metadata.template), error, explained: whatsappProblem(error) };
      }),
      byEmailInstead: recentFallbacks.map((m) => {
        const error = text(m.metadata.whatsappError);
        return { at: m.sentAt.toISOString(), reason: text(m.metadata.fallbackReason), error, explained: whatsappProblem(error) };
      }),
    };
    if (!config) return { connected: false as const, recent };

    const fields = ["display_phone_number", "verified_name", "name_status", "code_verification_status", "quality_rating", "platform_type", "status", "account_mode"];
    const lookup = async (list: string[]) => {
      const response = await fetch(`https://graph.facebook.com/v21.0/${config.phoneNumberId}?fields=${list.join(",")}`, { headers: { authorization: `Bearer ${config.accessToken}` } });
      return { ok: response.ok, body: (await response.json().catch(() => ({}))) as Record<string, unknown> & { error?: { code?: number; message?: string; error_data?: { details?: string } } } };
    };
    // Not every field exists on every API version or number: fall back to the two that always do.
    let number = await lookup(fields);
    if (!number.ok && number.body.error?.code === 100) number = await lookup(["display_phone_number", "verified_name"]);
    const numberError = number.ok ? null : number.body.error ? metaErrorText(number.body.error) : "no answer from Meta";
    const { id: _id, error: _error, ...numberInfo } = number.body;

    let test: { sent: boolean; messageId?: string; error?: string; explained?: string | null } | null = null;
    if (input.phone) {
      try {
        const messageId = await sendWhatsApp(config, input.phone, { template: { name: "booking_confirmed", language: input.language, params: sampleParams[input.language] } });
        test = { sent: true, messageId };
      } catch (e) {
        const error = e instanceof Error ? e.message : String(e);
        test = { sent: false, error, explained: whatsappProblem(error) };
      }
      await recordEvent(ctx, { type: "whatsapp.tested", subjectType: "agency", subjectId: ctx.agencyId, data: { language: input.language, sent: test.sent } });
    }
    return {
      connected: true as const,
      source: config.own ? ("own" as const) : ("platform" as const),
      phoneNumberId: config.phoneNumberId,
      number: number.ok ? numberInfo : null,
      numberError,
      numberExplained: whatsappProblem(numberError),
      test,
      recent,
    };
  },
});

export const listAgentsWithoutMailbox = defineTool({
  name: "agents_list_without_mailbox",
  description:
    "Active agents whose client emails don't leave from their own Gmail or Outlook: never connected, or the connection stopped working. Their emails go from the agency's inbox address instead.",
  mutates: false,
  input: z.object({}),
  run: async (ctx) => {
    const team = await ctx.db.select({ id: agents.id, name: agents.name }).from(agents).where(and(eq(agents.agencyId, ctx.agencyId), eq(agents.active, true))).orderBy(agents.name);
    const connections = await ctx.db
      .select({ agentId: calendarConnections.agentId, scopes: calendarConnections.scopes, status: calendarConnections.status })
      .from(calendarConnections)
      .where(eq(calendarConnections.agencyId, ctx.agencyId));
    const missing = team
      .map((agent) => {
        const mail = connections.filter((c) => c.agentId === agent.id && c.scopes.includes("mail"));
        if (mail.some((c) => c.status === "active")) return null;
        return { agentId: agent.id, name: agent.name, reason: mail.length ? ("stopped" as const) : ("not_connected" as const) };
      })
      .filter((a): a is NonNullable<typeof a> => a !== null);
    return { agents: missing, total: team.length, canConnect: oauthConfigured("google") || oauthConfigured("microsoft") };
  },
});
