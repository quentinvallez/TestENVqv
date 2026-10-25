import { and, desc, eq, schema } from "@viewing/db";
import type { Channel } from "@viewing/db/schema";
import { recordEvent } from "../events";
import type { ToolContext } from "../tool";

// Placeholder for the shared sending layer: same signatures as the real
// channels module (email and WhatsApp delivery), which replaces this file.
// Until then every message is stored as "simulated".

const { conversations, contacts, messages } = schema;

export type WhatsappTemplate = { name: string; language: "nl" | "fr" | "en"; params: string[] };

/** The contact's conversation on their preferred channel (WhatsApp if opted in with a phone, else email), created if needed. */
export async function conversationFor(
  ctx: ToolContext,
  input: { contactId: string; channel?: Channel; listingId?: string | null; agentId?: string | null; leadId?: string | null; subject?: string | null },
) {
  const [contact] = await ctx.db.select().from(contacts).where(and(eq(contacts.agencyId, ctx.agencyId), eq(contacts.id, input.contactId)));
  if (!contact) throw new Error("Contact not found");
  const channel = input.channel ?? (contact.whatsappOptIn && contact.phone ? "whatsapp" : "email");
  const [existing] = await ctx.db
    .select()
    .from(conversations)
    .where(and(eq(conversations.agencyId, ctx.agencyId), eq(conversations.contactId, contact.id), eq(conversations.channel, channel)))
    .orderBy(desc(conversations.lastMessageAt))
    .limit(1);
  if (existing) return existing;
  const [created] = await ctx.db
    .insert(conversations)
    .values({
      agencyId: ctx.agencyId,
      contactId: contact.id,
      leadId: input.leadId,
      listingId: input.listingId,
      agentId: input.agentId,
      channel,
      provider: channel === "whatsapp" ? "whatsapp_business" : channel === "sms" ? "sms" : "outlook",
      subject: channel === "email" ? (input.subject ?? null) : null,
      status: "open",
      unread: false,
      lastMessageAt: new Date(),
    })
    .returning();
  return created!;
}

/** Stores an outbound message in the conversation and delivers it on its channel. */
export async function sendMessage(
  ctx: ToolContext,
  input: { conversationId: string; body: string; subject?: string; kind?: string; whatsappTemplate?: WhatsappTemplate; metadata?: Record<string, unknown> },
): Promise<{ messageId: string; delivery: "sent" | "failed" | "simulated"; error?: string }> {
  const [conversation] = await ctx.db
    .select()
    .from(conversations)
    .where(and(eq(conversations.agencyId, ctx.agencyId), eq(conversations.id, input.conversationId)));
  if (!conversation) throw new Error("Conversation not found");
  const [message] = await ctx.db
    .insert(messages)
    .values({
      agencyId: ctx.agencyId,
      conversationId: conversation.id,
      direction: "outbound",
      delivery: "simulated",
      authorType: ctx.actor.type,
      subject: input.subject,
      body: input.body,
      metadata: { ...input.metadata, ...(input.kind && { kind: input.kind }) },
    })
    .returning();
  await ctx.db.update(conversations).set({ lastMessageAt: message!.sentAt }).where(eq(conversations.id, conversation.id));
  await recordEvent(ctx, {
    type: "message.sent",
    subjectType: "conversation",
    subjectId: conversation.id,
    data: { channel: conversation.channel, kind: input.kind, delivery: "simulated" },
  });
  return { messageId: message!.id, delivery: "simulated" };
}
