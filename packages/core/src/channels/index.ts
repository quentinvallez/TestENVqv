import { and, desc, eq, schema } from "@viewing/db";
import type { Channel, ChannelProvider } from "@viewing/db/schema";
import { recordEvent } from "../events";
import { authorizedFetch } from "../integrations/oauth";
import type { ToolContext } from "../tool";
import { buildMime, mailDomain, mailgunConfigured, newMessageId, sendWithMailgun, type OutgoingEmail } from "./email";
import { automationSettings } from "../automations/rules";
import { toLang } from "../planner/language";
import { sendWhatsApp, serviceWindowMs, whatsappConfig, type WhatsAppTemplate } from "./whatsapp";
import { whatsappInviteLine } from "./whatsapp-invite";

export type { WhatsAppTemplate } from "./whatsapp";
export { normalizePhone, samePhone } from "./phone";

/*
 * The one way messages leave the platform. Tools and background jobs call
 * sendMessage; it stores the outbound message, delivers it on the
 * conversation's channel and records message.sent or message.failed. Without a
 * connected provider the message is stored as "simulated", never as sent.
 */

const { conversations, messages, contacts, calendarConnections, agencySettings } = schema;

export type Delivery = "sent" | "failed" | "simulated";
export type Transport = "gmail" | "outlook" | "mailgun" | "whatsapp_cloud" | "none";
export type SendResult = { messageId: string; conversationId: string; delivery: Delivery; transport: Transport; error?: string };

type Mailbox = typeof calendarConnections.$inferSelect;

/** The agent's connected mailbox they allowed us to send from, if any. */
async function agentMailbox(ctx: ToolContext, agentId: string | null): Promise<Mailbox | null> {
  if (!agentId) return null;
  const rows = await ctx.db
    .select()
    .from(calendarConnections)
    .where(and(eq(calendarConnections.agencyId, ctx.agencyId), eq(calendarConnections.agentId, agentId), eq(calendarConnections.status, "active")))
    .orderBy(calendarConnections.createdAt);
  return rows.find((c) => c.scopes.includes("mail")) ?? null;
}

function emailProvider(mailbox: Mailbox | null): ChannelProvider {
  return mailbox ? (mailbox.provider === "google" ? "gmail" : "outlook") : "email";
}

/**
 * The agency's forwarding address, e.g. "vastgoed-peeters-k3f9@mail.example.be".
 * Client replies and Immoweb/Zimmo lead emails sent there land in the inbox.
 * Created on first use; null while no mail domain is configured.
 */
export async function inboundAddress(ctx: ToolContext): Promise<string | null> {
  const domain = mailDomain();
  const [row] = await ctx.db.select({ alias: agencySettings.inboundEmailAlias }).from(agencySettings).where(eq(agencySettings.agencyId, ctx.agencyId));
  let alias = row?.alias;
  if (!alias) {
    const agency = await ctx.db.query.organization.findFirst({ where: eq(schema.organization.id, ctx.agencyId), columns: { name: true, slug: true } });
    const base = (agency?.slug || agency?.name || "agency")
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 30);
    alias = `${base || "agency"}-${Math.random().toString(36).slice(2, 6)}`;
    await ctx.db
      .insert(agencySettings)
      .values({ agencyId: ctx.agencyId, inboundEmailAlias: alias })
      .onConflictDoUpdate({ target: agencySettings.agencyId, set: { inboundEmailAlias: alias } });
  }
  return domain ? `${alias}@${domain}` : null;
}

/**
 * The contact's conversation on the given channel, or on their preferred one
 * (WhatsApp when they opted in and have a phone, otherwise email). Created if
 * there is none yet.
 */
export async function conversationFor(
  ctx: ToolContext,
  input: { contactId: string; channel?: Channel; listingId?: string | null; agentId?: string | null; leadId?: string | null; subject?: string | null },
) {
  const [contact] = await ctx.db.select().from(contacts).where(and(eq(contacts.agencyId, ctx.agencyId), eq(contacts.id, input.contactId)));
  if (!contact) throw new Error("Contact not found");
  const channel: Channel = input.channel ?? (contact.whatsappOptIn && contact.phone ? "whatsapp" : "email");
  const [existing] = await ctx.db
    .select()
    .from(conversations)
    .where(and(eq(conversations.agencyId, ctx.agencyId), eq(conversations.contactId, contact.id), eq(conversations.channel, channel)))
    .orderBy(desc(conversations.lastMessageAt))
    .limit(1);
  if (existing) return existing;
  const provider: ChannelProvider = channel === "whatsapp" ? "whatsapp_business" : channel === "sms" ? "sms" : emailProvider(await agentMailbox(ctx, input.agentId ?? null));
  const [created] = await ctx.db
    .insert(conversations)
    .values({
      agencyId: ctx.agencyId,
      contactId: contact.id,
      leadId: input.leadId ?? null,
      listingId: input.listingId ?? null,
      agentId: input.agentId ?? null,
      channel,
      provider,
      subject: channel === "email" ? (input.subject ?? null) : null,
    })
    .returning();
  return created!;
}

/** How a reply in this conversation would leave right now, for the composer: "Send via Gmail" or "not connected yet". */
export async function deliveryRoute(ctx: ToolContext, conversation: { channel: Channel; agentId: string | null }): Promise<{ ready: boolean; via: string }> {
  if (conversation.channel === "whatsapp") return { ready: Boolean(await whatsappConfig(ctx)), via: "WhatsApp" };
  if (conversation.channel === "sms") return { ready: false, via: "SMS" };
  const mailbox = await agentMailbox(ctx, conversation.agentId);
  if (mailbox) return { ready: true, via: mailbox.provider === "google" ? `Gmail (${mailbox.accountEmail})` : `Outlook (${mailbox.accountEmail})` };
  return { ready: mailgunConfigured() && Boolean(mailDomain()), via: "agency email" };
}

export type SendInput = {
  conversationId: string;
  body: string;
  /** Email subject; defaults to "Re: " + the conversation's subject. */
  subject?: string;
  /** What the message is for, e.g. "reply", "reminder", "no_show", "follow_up". Stored in metadata.kind. */
  kind?: string;
  /** Used for WhatsApp when the 24-hour service window is closed. */
  whatsappTemplate?: WhatsAppTemplate;
  metadata?: Record<string, unknown>;
};

/** The "Prefer WhatsApp?" line for a client email, when the agency has a WhatsApp number and keeps the invitation on. */
async function whatsappInviteFor(ctx: ToolContext, contact: { id: string; language: string | null }) {
  const [settings] = await ctx.db.select({ automations: schema.agencySettings.automations }).from(schema.agencySettings).where(eq(schema.agencySettings.agencyId, ctx.agencyId));
  if (!automationSettings(settings?.automations).whatsappInvite) return null;
  const config = await whatsappConfig(ctx);
  if (!config?.displayNumber) return null;
  return whatsappInviteLine(config.displayNumber, contact.id, toLang(contact.language));
}

/**
 * Stores and delivers an outbound message on the conversation's channel.
 * WhatsApp outside the 24-hour window needs an approved template; without one
 * the message goes by email when the contact has an address, else it fails
 * with "whatsapp_window_closed". The client should hear from us whatever
 * breaks: WhatsApp that isn't connected or refuses the message falls back to
 * email, and a connected Gmail/Outlook that refuses (e.g. an expired login)
 * falls back to the agency's own address through Mailgun.
 */
export async function sendMessage(ctx: ToolContext, input: SendInput): Promise<SendResult> {
  const conversation = await ctx.db.query.conversations.findFirst({
    where: and(eq(conversations.agencyId, ctx.agencyId), eq(conversations.id, input.conversationId)),
    with: { contact: true, agent: true, messages: { orderBy: desc(messages.sentAt), limit: 30 } },
  });
  if (!conversation) throw new Error("Conversation not found");
  const contact = conversation.contact;
  const lastFromClient = conversation.messages.find((m) => m.direction === "inbound" && m.authorType === "contact");

  let delivery: Delivery = "simulated";
  let transport: Transport = "none";
  let error: string | undefined;
  let externalId: string | null = null;
  let subject: string | null = null;
  let provider = conversation.provider;
  const extra: Record<string, unknown> = {};
  let body = input.body;

  if (conversation.channel === "whatsapp") {
    const config = await whatsappConfig(ctx);
    const windowOpen = Boolean(lastFromClient && Date.now() - lastFromClient.sentAt.getTime() < serviceWindowMs);
    if (!contact?.phone) {
      delivery = "failed";
      error = "no_phone";
    } else if (!config) {
      if (contact.email) return sendByEmailInstead(ctx, { ...conversation, contact }, input, "whatsapp_not_connected");
      delivery = "simulated";
    } else if (!windowOpen && !input.whatsappTemplate) {
      if (contact.email) return sendByEmailInstead(ctx, { ...conversation, contact }, input, "whatsapp_window_closed");
      delivery = "failed";
      error = "whatsapp_window_closed";
    } else {
      transport = "whatsapp_cloud";
      try {
        const message = windowOpen ? { text: input.body } : { template: input.whatsappTemplate! };
        if (!windowOpen) extra.template = input.whatsappTemplate!.name;
        externalId = await sendWhatsApp(config, contact.phone, message);
        delivery = "sent";
      } catch (e) {
        const reason = e instanceof Error ? e.message : String(e);
        if (contact.email) return sendByEmailInstead(ctx, { ...conversation, contact }, input, "whatsapp_error", reason);
        delivery = "failed";
        error = reason;
      }
    }
  } else if (conversation.channel === "email") {
    const mailbox = await agentMailbox(ctx, conversation.agentId);
    const replyTo = await inboundAddress(ctx);
    const agency = await ctx.db.query.organization.findFirst({ where: eq(schema.organization.id, ctx.agencyId), columns: { name: true } });
    const isReply = Boolean(lastFromClient);
    const base = input.subject ?? conversation.subject ?? agency?.name ?? "";
    subject = !input.subject && isReply && !/^(re|aw|antw):/i.test(base) ? `Re: ${base}` : base;
    const lastEmailId = conversation.messages.find((m) => m.externalId?.startsWith("<"))?.externalId ?? undefined;
    const messageId = newMessageId();
    const references = [conversation.externalThreadId, lastEmailId].filter((r, i, all): r is string => Boolean(r) && all.indexOf(r) === i);
    // Not on WhatsApp with us yet: end the email with a link to write us there first (WhatsApp needs the client to start).
    const invite = contact?.email && !contact.whatsappOptIn ? await whatsappInviteFor(ctx, contact) : null;
    if (invite) {
      body = `${input.body}\n\n${invite}`;
      extra.whatsappInvite = true;
    }
    if (!contact?.email) {
      delivery = "failed";
      error = "no_email";
    } else if (mailbox || (mailgunConfigured() && replyTo)) {
      const senderName = conversation.agent ? `${conversation.agent.name} · ${agency?.name ?? ""}`.trim() : (agency?.name ?? "");
      const email: OutgoingEmail = {
        from: { name: senderName, address: mailbox ? mailbox.accountEmail : replyTo! },
        to: { name: [contact.firstName, contact.lastName].filter(Boolean).join(" ") || undefined, address: contact.email },
        // Replies always come back through the forwarding address, so they reach the inbox even if the agent's mailbox isn't forwarded.
        replyTo: replyTo ?? undefined,
        subject,
        text: body,
        messageId,
        inReplyTo: lastEmailId,
        references,
      };
      transport = mailbox ? (mailbox.provider === "google" ? "gmail" : "outlook") : "mailgun";
      provider = emailProvider(mailbox);
      try {
        if (mailbox?.provider === "google") {
          await authorizedFetch(ctx, mailbox, "https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
            method: "POST",
            body: JSON.stringify({ raw: Buffer.from(buildMime(email)).toString("base64url") }),
          });
        } else if (mailbox?.provider === "microsoft") {
          await authorizedFetch(ctx, mailbox, "https://graph.microsoft.com/v1.0/me/sendMail", {
            method: "POST",
            body: JSON.stringify({
              message: {
                subject,
                body: { contentType: "Text", content: body },
                toRecipients: [{ emailAddress: { address: contact.email, name: email.to.name } }],
                replyTo: replyTo ? [{ emailAddress: { address: replyTo } }] : [],
              },
              saveToSentItems: true,
            }),
          });
        } else {
          await sendWithMailgun(email);
        }
        externalId = messageId;
        delivery = "sent";
      } catch (e) {
        delivery = "failed";
        error = e instanceof Error ? e.message : String(e);
        // The agent's own mailbox refused (expired login, revoked access): send from the agency's address instead.
        if (mailbox && mailgunConfigured() && replyTo) {
          try {
            await sendWithMailgun({ ...email, from: { name: email.from.name, address: replyTo } });
            extra.mailboxError = error;
            transport = "mailgun";
            provider = "email";
            externalId = messageId;
            delivery = "sent";
            error = undefined;
          } catch (e2) {
            error = `${error}; ${e2 instanceof Error ? e2.message : String(e2)}`;
          }
        }
      }
    }
  }
  // SMS has no provider yet and stays simulated.

  const [message] = await ctx.db
    .insert(messages)
    .values({
      agencyId: ctx.agencyId,
      conversationId: conversation.id,
      direction: "outbound",
      body,
      subject,
      delivery,
      authorType: ctx.actor.type,
      externalId,
      metadata: { ...input.metadata, ...extra, kind: input.kind ?? "reply", transport, ...(error && { error }) },
    })
    .returning();
  await ctx.db
    .update(conversations)
    .set({
      status: "waiting",
      unread: false,
      lastMessageAt: message!.sentAt,
      provider,
      ...(subject && !conversation.subject && { subject }),
      ...(externalId?.startsWith("<") && !conversation.externalThreadId && { externalThreadId: externalId }),
    })
    .where(eq(conversations.id, conversation.id));
  await recordEvent(ctx, {
    type: delivery === "failed" ? "message.failed" : "message.sent",
    subjectType: "conversation",
    subjectId: conversation.id,
    data: { messageId: message!.id, channel: conversation.channel, kind: input.kind ?? "reply", delivery, transport, ...(error && { error }) },
  });
  return { messageId: message!.id, conversationId: conversation.id, delivery, transport, ...(error && { error }) };
}

type Conversation = typeof conversations.$inferSelect;

/** The same message on the contact's email conversation, noting why it didn't go by WhatsApp. */
async function sendByEmailInstead(ctx: ToolContext, from: Conversation & { contact: { id: string } }, input: SendInput, reason: string, detail?: string): Promise<SendResult> {
  const email = await conversationFor(ctx, { contactId: from.contact.id, channel: "email", listingId: from.listingId, agentId: from.agentId, leadId: from.leadId });
  const { whatsappTemplate: _template, ...rest } = input;
  return sendMessage(ctx, { ...rest, conversationId: email.id, metadata: { ...input.metadata, fallbackFrom: "whatsapp", fallbackReason: reason, ...(detail && { whatsappError: detail }) } });
}

export type AgentEmail = {
  /** The agent to write to; null with `to` for the agency's own address. */
  agentId: string | null;
  /** Overrides the agent's address. */
  to?: string;
  /** E.g. the client, so the agent can answer a forwarded lead directly. */
  replyTo?: string | null;
  subject: string;
  text: string;
};

/**
 * An internal email to one of the agency's agents, e.g. "new viewing booked".
 * Not a client message, so no conversation: it goes from the agency's address
 * through Mailgun, or else from the agent's own connected mailbox to
 * themselves. Without either it is not sent and says "simulated".
 */
export async function emailAgent(ctx: ToolContext, input: AgentEmail): Promise<{ delivery: Delivery; transport: Transport; to: string | null; error?: string }> {
  const [agent] = input.agentId ? await ctx.db.select().from(schema.agents).where(and(eq(schema.agents.agencyId, ctx.agencyId), eq(schema.agents.id, input.agentId))) : [];
  const address = input.to ?? agent?.email;
  if (!address) return { delivery: "failed", transport: "none", to: null, error: "no_email" };
  const agency = await ctx.db.query.organization.findFirst({ where: eq(schema.organization.id, ctx.agencyId), columns: { name: true } });
  const from = await inboundAddress(ctx);
  const mailbox = mailgunConfigured() && from ? null : await agentMailbox(ctx, agent?.id ?? null);
  if (!mailbox && !(mailgunConfigured() && from)) return { delivery: "simulated", transport: "none", to: address };
  const email: OutgoingEmail = {
    from: { name: agency?.name ?? "", address: mailbox ? mailbox.accountEmail : from! },
    to: { name: agent?.name, address },
    ...(input.replyTo && { replyTo: input.replyTo }),
    subject: input.subject,
    text: input.text,
    messageId: newMessageId(),
  };
  const transport: Transport = mailbox ? (mailbox.provider === "google" ? "gmail" : "outlook") : "mailgun";
  try {
    if (mailbox?.provider === "google") {
      await authorizedFetch(ctx, mailbox, "https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
        method: "POST",
        body: JSON.stringify({ raw: Buffer.from(buildMime(email)).toString("base64url") }),
      });
    } else if (mailbox?.provider === "microsoft") {
      await authorizedFetch(ctx, mailbox, "https://graph.microsoft.com/v1.0/me/sendMail", {
        method: "POST",
        body: JSON.stringify({
          message: {
            subject: input.subject,
            body: { contentType: "Text", content: input.text },
            toRecipients: [{ emailAddress: { address, name: agent?.name } }],
            replyTo: input.replyTo ? [{ emailAddress: { address: input.replyTo } }] : [],
          },
          saveToSentItems: false,
        }),
      });
    } else {
      await sendWithMailgun(email);
    }
    return { delivery: "sent", transport, to: address };
  } catch (e) {
    return { delivery: "failed", transport, to: address, error: e instanceof Error ? e.message : String(e) };
  }
}
