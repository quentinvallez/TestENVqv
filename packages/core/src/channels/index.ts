import { and, desc, eq, schema } from "@viewing/db";
import type { Channel, ChannelProvider } from "@viewing/db/schema";
import { recordEvent } from "../events";
import { authorizedFetch } from "../integrations/oauth";
import type { ToolContext } from "../tool";
import { buildMime, mailDomain, mailgunConfigured, newMessageId, sendWithMailgun, type OutgoingEmail } from "./email";
import { sendWhatsApp, serviceWindowMs, whatsappConfig, type WhatsAppTemplate } from "./whatsapp";

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

/**
 * Stores and delivers an outbound message on the conversation's channel.
 * WhatsApp outside the 24-hour window needs an approved template; without one
 * the message goes by email when the contact has an address, else it fails
 * with "whatsapp_window_closed".
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

  if (conversation.channel === "whatsapp") {
    const config = await whatsappConfig(ctx);
    const windowOpen = Boolean(lastFromClient && Date.now() - lastFromClient.sentAt.getTime() < serviceWindowMs);
    if (!contact?.phone) {
      delivery = "failed";
      error = "no_phone";
    } else if (!config) {
      delivery = "simulated";
    } else if (!windowOpen && !input.whatsappTemplate) {
      if (contact.email) {
        const email = await conversationFor(ctx, { contactId: contact.id, channel: "email", listingId: conversation.listingId, agentId: conversation.agentId, leadId: conversation.leadId });
        return sendMessage(ctx, { ...input, conversationId: email.id, metadata: { ...input.metadata, fallbackFrom: "whatsapp" } });
      }
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
        delivery = "failed";
        error = e instanceof Error ? e.message : String(e);
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
        text: input.body,
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
                body: { contentType: "Text", content: input.body },
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
      body: input.body,
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
