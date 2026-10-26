import { and, asc, desc, eq, schema, sql } from "@viewing/db";
import type { Language } from "@viewing/db/schema";
import { z } from "zod";
import { deliveryRoute, samePhone, sendMessage } from "../channels";
import { recordEvent } from "../events";
import { draftFollowUp, handleConversation } from "../planner/agent";
import { defineTool, type ToolContext } from "../tool";
import { cancelAppointment } from "./booking";

const { conversations, messages, contacts, leads, proposals } = schema;

export const inboxFolders = [
  "all",
  "priority",
  "drafts",
  "needs_reply",
  "sellers",
  "viewing_request",
  "changes",
  "question",
  "offer",
  "feedback",
  "outlook",
  "gmail",
  "email",
  "whatsapp_business",
  "done",
] as const;
export type InboxFolder = (typeof inboxFolders)[number];

type InboxItem = Awaited<ReturnType<typeof loadInbox>>[number];

async function loadInbox(ctx: ToolContext) {
  const rows = await ctx.db.query.conversations.findMany({
    where: eq(conversations.agencyId, ctx.agencyId),
    orderBy: desc(conversations.lastMessageAt),
    limit: 200,
    with: {
      contact: true,
      listing: { columns: { id: true, reference: true, street: true, houseNumber: true, city: true } },
      messages: { orderBy: desc(messages.sentAt), limit: 1 },
      proposals: { where: eq(proposals.status, "pending"), columns: { id: true, generatedBy: true, kind: true } },
    },
  });
  return rows.map((row) => ({
    ...row,
    lastMessage: row.messages[0] ?? null,
    pendingDraft: row.proposals[0] ?? null,
  }));
}

const inFolder: Record<InboxFolder, (c: InboxItem) => boolean> = {
  all: (c) => c.status !== "done",
  priority: (c) => c.status !== "done" && c.priority === "high",
  drafts: (c) => c.pendingDraft !== null,
  needs_reply: (c) => c.status === "open" && c.lastMessage?.direction === "inbound",
  sellers: (c) => c.status !== "done" && c.category === "valuation",
  viewing_request: (c) => c.status !== "done" && (c.category === "viewing_request" || c.category === "booking"),
  changes: (c) => c.status !== "done" && (c.category === "reschedule" || c.category === "cancellation"),
  question: (c) => c.status !== "done" && c.category === "question",
  offer: (c) => c.status !== "done" && c.category === "offer",
  feedback: (c) => c.status !== "done" && c.category === "feedback",
  outlook: (c) => c.status !== "done" && c.provider === "outlook",
  gmail: (c) => c.status !== "done" && c.provider === "gmail",
  email: (c) => c.status !== "done" && c.provider === "email",
  whatsapp_business: (c) => c.status !== "done" && c.provider === "whatsapp_business",
  done: (c) => c.status === "done",
};

const priorityRank = { high: 0, normal: 1, low: 2 } as const;

export const listInbox = defineTool({
  name: "inbox_list",
  description: "Conversations across email and WhatsApp in one inbox, filtered by folder, with counts per folder. Urgent and drafted conversations come first.",
  mutates: false,
  input: z.object({ folder: z.enum(inboxFolders).default("all") }),
  run: async (ctx, input) => {
    const all = await loadInbox(ctx);
    const counts = Object.fromEntries(inboxFolders.map((f) => [f, all.filter(inFolder[f]).length])) as Record<InboxFolder, number>;
    const items = all
      .filter(inFolder[input.folder])
      .sort(
        (a, b) =>
          Number(b.unread) - Number(a.unread) ||
          priorityRank[a.priority] - priorityRank[b.priority] ||
          (b.lastMessageAt?.getTime() ?? 0) - (a.lastMessageAt?.getTime() ?? 0),
      );
    return { items, counts };
  },
});

export const getConversation = defineTool({
  name: "conversations_get",
  description: "One conversation with all messages, the contact, listing, agent, the pending AI draft and the contact's next viewing.",
  mutates: false,
  input: z.object({ conversationId: z.string() }),
  run: async (ctx, input) => {
    const conversation = await ctx.db.query.conversations.findFirst({
      where: and(eq(conversations.agencyId, ctx.agencyId), eq(conversations.id, input.conversationId)),
      with: {
        contact: true,
        agent: true,
        listing: true,
        messages: { orderBy: asc(messages.sentAt) },
        proposals: { where: eq(proposals.status, "pending"), orderBy: desc(proposals.createdAt) },
      },
    });
    if (!conversation) return null;
    const lead = conversation.contactId
      ? await ctx.db.query.leads.findFirst({
          where: and(
            eq(leads.agencyId, ctx.agencyId),
            eq(leads.contactId, conversation.contactId),
            conversation.listingId ? eq(leads.listingId, conversation.listingId) : undefined,
          ),
          orderBy: desc(leads.updatedAt),
        })
      : null;
    return { ...conversation, lead: lead ?? null, draft: conversation.proposals[0] ?? null, route: await deliveryRoute(ctx, conversation) };
  },
});

export const replyToConversation = defineTool({
  name: "conversations_reply",
  description:
    "Send a reply in a conversation on its own channel (the agent's mailbox, the agency address or WhatsApp; stored as simulated when the channel isn't connected). Can also cancel an appointment and move the lead to another stage in the same step. Offered times are informational; the client books them through the link in the message.",
  mutates: true,
  input: z.object({
    conversationId: z.string(),
    body: z.string().trim().min(1).max(5000),
    offeredSlots: z.array(z.string()).default([]),
    cancelAppointmentId: z.string().optional(),
    cancelReason: z.string().trim().max(500).optional(),
    reopenLead: z.boolean().default(true).describe("After cancelling, move the lead back to 'invited' so they can pick a new time"),
    leadStage: z.enum(["invited", "booked", "visited", "follow_up", "offer"]).optional(),
    subject: z.string().trim().max(300).optional(),
    kind: z.string().max(40).optional().describe('What the message is for, e.g. "reply", "reminder", "no_show", "follow_up"'),
    whatsappTemplate: z
      .object({ name: z.string(), language: z.enum(["nl", "fr", "en"]), params: z.array(z.string()) })
      .optional()
      .describe("Approved WhatsApp template used when the 24-hour window is closed"),
    metadata: z.record(z.string(), z.unknown()).optional(),
  }),
  run: async (ctx, input) => {
    const [conversation] = await ctx.db
      .select()
      .from(conversations)
      .where(and(eq(conversations.agencyId, ctx.agencyId), eq(conversations.id, input.conversationId)));
    if (!conversation) throw new Error("Conversation not found");

    if (input.cancelAppointmentId) {
      await cancelAppointment.run(ctx, { appointmentId: input.cancelAppointmentId, reason: input.cancelReason ?? "Client cancelled by message", reopenLead: input.reopenLead });
    }
    const sent = await sendMessage(ctx, {
      conversationId: conversation.id,
      body: input.body,
      subject: input.subject,
      kind: input.kind,
      whatsappTemplate: input.whatsappTemplate,
      metadata: { ...input.metadata, ...(input.offeredSlots.length && { offeredSlots: input.offeredSlots }) },
    });
    if (input.leadStage && conversation.contactId) {
      await ctx.db
        .update(leads)
        .set({ stage: input.leadStage })
        .where(
          and(
            eq(leads.agencyId, ctx.agencyId),
            eq(leads.contactId, conversation.contactId),
            conversation.listingId ? eq(leads.listingId, conversation.listingId) : undefined,
          ),
        );
    }
    return sent;
  },
});

export const updateConversation = defineTool({
  name: "conversations_update",
  description: "Mark a conversation read or unread, or move it to done or back to open.",
  mutates: true,
  input: z.object({ conversationId: z.string(), unread: z.boolean().optional(), status: z.enum(["open", "waiting", "done"]).optional() }),
  run: async (ctx, input) => {
    const changes = { ...(input.unread !== undefined && { unread: input.unread }), ...(input.status && { status: input.status }) };
    if (Object.keys(changes).length === 0) return { changed: false };
    await ctx.db.update(conversations).set(changes).where(and(eq(conversations.agencyId, ctx.agencyId), eq(conversations.id, input.conversationId)));
    if (input.status) {
      await recordEvent(ctx, { type: "conversation.status_changed", subjectType: "conversation", subjectId: input.conversationId, data: { status: input.status } });
    }
    return { changed: true };
  },
});

/**
 * The agency's contact with this email address or phone number (written in any
 * form), or a new one. Phones are compared on their last nine digits first,
 * then exactly in international form.
 */
export async function findOrCreateContact(
  ctx: ToolContext,
  input: { name: string; email?: string | null; phone?: string | null; language?: Language | null; whatsappOptIn?: boolean },
) {
  let contact: typeof contacts.$inferSelect | undefined;
  if (input.email) {
    [contact] = await ctx.db.select().from(contacts).where(and(eq(contacts.agencyId, ctx.agencyId), eq(contacts.email, input.email.toLowerCase()))).limit(1);
  }
  if (!contact && input.phone && input.phone.replace(/\D/g, "").length >= 8) {
    const tail = input.phone.replace(/\D/g, "").slice(-9);
    const candidates = await ctx.db
      .select()
      .from(contacts)
      .where(and(eq(contacts.agencyId, ctx.agencyId), sql`right(regexp_replace(${contacts.phone}, '\\D', '', 'g'), 9) = ${tail}`))
      .limit(10);
    contact = candidates.find((c) => samePhone(c.phone, input.phone));
  }
  if (contact) {
    // Fill in what we learned, never overwrite what the agency entered.
    const fill = {
      ...(!contact.email && input.email && { email: input.email.toLowerCase() }),
      ...(!contact.phone && input.phone && { phone: input.phone }),
      ...(!contact.language && input.language && { language: input.language }),
      ...(input.whatsappOptIn && !contact.whatsappOptIn && { whatsappOptIn: true }),
    };
    if (Object.keys(fill).length) [contact] = await ctx.db.update(contacts).set(fill).where(eq(contacts.id, contact.id)).returning();
    return contact!;
  }
  const [firstName, ...rest] = input.name.trim().split(/\s+/);
  const [created] = await ctx.db
    .insert(contacts)
    .values({
      agencyId: ctx.agencyId,
      firstName,
      lastName: rest.join(" ") || null,
      email: input.email?.toLowerCase(),
      phone: input.phone,
      language: input.language ?? undefined,
      whatsappOptIn: input.whatsappOptIn ?? false,
    })
    .returning();
  return created!;
}

export const receiveMessage = defineTool({
  name: "messages_receive",
  description:
    "Take in a message from a client (email, WhatsApp or SMS), attach it to the right contact and conversation, and let the planner sort it and draft a reply.",
  mutates: true,
  input: z.object({
    channel: z.enum(["email", "whatsapp", "sms"]),
    provider: z.enum(["outlook", "gmail", "email", "whatsapp_business", "sms"]),
    from: z.object({ name: z.string().trim().min(1), email: z.string().trim().toLowerCase().email().optional(), phone: z.string().trim().optional() }),
    subject: z.string().trim().optional(),
    body: z.string().trim().min(1).max(10000),
    listingId: z.string().optional(),
    /** Id at the provider (email Message-ID, WhatsApp message id); a message seen before is ignored. */
    externalId: z.string().max(500).optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
    useAi: z.boolean().default(true),
  }),
  run: async (ctx, input) => {
    if (input.externalId) {
      const [seen] = await ctx.db
        .select({ conversationId: messages.conversationId })
        .from(messages)
        .where(and(eq(messages.agencyId, ctx.agencyId), eq(messages.externalId, input.externalId)))
        .limit(1);
      if (seen) return { conversationId: seen.conversationId, triage: null, proposalId: null, duplicate: true };
    }
    const contact = await findOrCreateContact(ctx, { name: input.from.name, email: input.from.email, phone: input.from.phone, whatsappOptIn: input.channel === "whatsapp" });

    let [conversation] = await ctx.db
      .select()
      .from(conversations)
      .where(and(eq(conversations.agencyId, ctx.agencyId), eq(conversations.contactId, contact.id), eq(conversations.channel, input.channel)))
      .orderBy(desc(conversations.lastMessageAt))
      .limit(1);
    const [lead] = await ctx.db.select().from(leads).where(and(eq(leads.agencyId, ctx.agencyId), eq(leads.contactId, contact.id))).orderBy(desc(leads.updatedAt)).limit(1);
    conversation ??= (
      await ctx.db
        .insert(conversations)
        .values({
          agencyId: ctx.agencyId,
          contactId: contact.id,
          leadId: lead?.id,
          listingId: input.listingId ?? lead?.listingId,
          agentId: lead?.agentId,
          channel: input.channel,
          provider: input.provider,
          subject: input.subject,
          externalThreadId: input.channel === "email" ? input.externalId : undefined,
        })
        .returning()
    )[0]!;

    const [message] = await ctx.db
      .insert(messages)
      .values({
        agencyId: ctx.agencyId,
        conversationId: conversation.id,
        direction: "inbound",
        authorType: "contact",
        subject: input.subject,
        body: input.body,
        externalId: input.externalId,
        metadata: input.metadata ?? {},
      })
      .returning();
    await ctx.db
      .update(conversations)
      .set({ unread: true, status: "open", lastMessageAt: message!.sentAt, ...(input.listingId && { listingId: input.listingId }) })
      .where(eq(conversations.id, conversation.id));
    await recordEvent(
      { ...ctx, actor: { type: "contact", id: contact.id } },
      { type: "message.received", subjectType: "conversation", subjectId: conversation.id, data: { channel: input.channel, messageId: message!.id } },
    );

    // "Code 123456" from the owner's own WhatsApp verifies a pending home valuation.
    if (input.channel === "whatsapp" && input.from.phone) {
      const { verifyFromWhatsApp } = await import("./valuations");
      if (await verifyFromWhatsApp(ctx, input.from.phone, input.body)) return { conversationId: conversation.id, triage: null, proposalId: null, verifiedValuation: true };
    }
    const result = await handleConversation({ ...ctx, actor: { type: "agent", id: "planner" } }, conversation.id, { useAi: input.useAi });
    if (result.proposalId) {
      await recordEvent(
        { ...ctx, actor: { type: "agent", id: "planner" } },
        { type: "planner.drafted", subjectType: "conversation", subjectId: conversation.id, data: { category: result.triage.category, by: result.triage.by } },
      );
    }
    return { conversationId: conversation.id, ...result };
  },
});

export const plannerRedraft = defineTool({
  name: "planner_redraft",
  description: "Ask the planner to read a conversation again and write a fresh draft reply.",
  mutates: true,
  input: z.object({ conversationId: z.string() }),
  run: async (ctx, input) => {
    const plannerCtx = { ...ctx, actor: { type: "agent" as const, id: "planner" } };
    const result = await handleConversation(plannerCtx, input.conversationId);
    await recordEvent(plannerCtx, { type: "planner.drafted", subjectType: "conversation", subjectId: input.conversationId, data: { category: result.triage.category, by: result.triage.by } });
    return result;
  },
});

export const plannerFollowUp = defineTool({
  name: "planner_follow_up",
  description: "Draft a personal follow-up message for a client after a completed viewing.",
  mutates: true,
  input: z.object({ appointmentId: z.string(), useAi: z.boolean().default(true) }),
  run: async (ctx, input) => {
    const plannerCtx = { ...ctx, actor: { type: "agent" as const, id: "planner" } };
    const result = await draftFollowUp(plannerCtx, input.appointmentId, { useAi: input.useAi });
    await recordEvent(plannerCtx, { type: "planner.follow_up_drafted", subjectType: "appointment", subjectId: input.appointmentId, data: {} });
    return result;
  },
});

