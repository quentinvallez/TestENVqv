import { and, asc, desc, eq, schema } from "@viewing/db";
import { z } from "zod";
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
    return { ...conversation, lead: lead ?? null, draft: conversation.proposals[0] ?? null };
  },
});

export const replyToConversation = defineTool({
  name: "conversations_reply",
  description:
    "Send a reply in a conversation on its own channel. Can also cancel an appointment and move the lead to another stage in the same step. Offered times are informational; the client books them through the link in the message.",
  mutates: true,
  input: z.object({
    conversationId: z.string(),
    body: z.string().trim().min(1).max(5000),
    offeredSlots: z.array(z.string()).default([]),
    cancelAppointmentId: z.string().optional(),
    leadStage: z.enum(["invited", "booked", "visited", "follow_up", "offer"]).optional(),
  }),
  run: async (ctx, input) => {
    const [conversation] = await ctx.db
      .select()
      .from(conversations)
      .where(and(eq(conversations.agencyId, ctx.agencyId), eq(conversations.id, input.conversationId)));
    if (!conversation) throw new Error("Conversation not found");

    if (input.cancelAppointmentId) {
      await cancelAppointment.run(ctx, { appointmentId: input.cancelAppointmentId, reason: "Client cancelled by message", reopenLead: true });
    }
    // Real delivery arrives with the Outlook, Gmail and WhatsApp connections; until then the message is stored only.
    const [message] = await ctx.db
      .insert(messages)
      .values({
        agencyId: ctx.agencyId,
        conversationId: conversation.id,
        direction: "outbound",
        body: input.body,
        delivery: "simulated",
        authorType: ctx.actor.type,
        metadata: input.offeredSlots.length ? { offeredSlots: input.offeredSlots } : {},
      })
      .returning();
    await ctx.db
      .update(conversations)
      .set({ status: "waiting", unread: false, lastMessageAt: message!.sentAt })
      .where(eq(conversations.id, conversation.id));
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
    await recordEvent(ctx, {
      type: "message.sent",
      subjectType: "conversation",
      subjectId: conversation.id,
      data: { channel: conversation.channel, offeredSlots: input.offeredSlots.length, delivery: "simulated" },
    });
    return { messageId: message!.id, delivery: "simulated" as const };
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

export const receiveMessage = defineTool({
  name: "messages_receive",
  description:
    "Take in a message from a client (email, WhatsApp or SMS), attach it to the right contact and conversation, and let the planner sort it and draft a reply.",
  mutates: true,
  input: z.object({
    channel: z.enum(["email", "whatsapp", "sms"]),
    provider: z.enum(["outlook", "gmail", "whatsapp_business", "sms"]),
    from: z.object({ name: z.string().trim().min(1), email: z.string().trim().toLowerCase().email().optional(), phone: z.string().trim().optional() }),
    subject: z.string().trim().optional(),
    body: z.string().trim().min(1).max(10000),
    listingId: z.string().optional(),
    useAi: z.boolean().default(true),
  }),
  run: async (ctx, input) => {
    const [firstName, ...rest] = input.from.name.split(" ");
    const match = input.from.email ? eq(contacts.email, input.from.email) : input.from.phone ? eq(contacts.phone, input.from.phone) : undefined;
    let [contact] = match ? await ctx.db.select().from(contacts).where(and(eq(contacts.agencyId, ctx.agencyId), match)) : [];
    contact ??= (
      await ctx.db
        .insert(contacts)
        .values({ agencyId: ctx.agencyId, firstName, lastName: rest.join(" ") || null, email: input.from.email, phone: input.from.phone, whatsappOptIn: input.channel === "whatsapp" })
        .returning()
    )[0]!;

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
        })
        .returning()
    )[0]!;

    const [message] = await ctx.db
      .insert(messages)
      .values({ agencyId: ctx.agencyId, conversationId: conversation.id, direction: "inbound", authorType: "contact", subject: input.subject, body: input.body })
      .returning();
    await ctx.db
      .update(conversations)
      .set({ unread: true, status: "open", lastMessageAt: message!.sentAt, ...(input.listingId && { listingId: input.listingId }) })
      .where(eq(conversations.id, conversation.id));
    await recordEvent(
      { ...ctx, actor: { type: "contact", id: contact.id } },
      { type: "message.received", subjectType: "conversation", subjectId: conversation.id, data: { channel: input.channel } },
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

