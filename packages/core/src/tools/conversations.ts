import { and, asc, desc, eq, inArray, schema } from "@viewing/db";
import { z } from "zod";
import { defineTool } from "../tool";

const { conversations, messages, contacts } = schema;

export const listConversations = defineTool({
  name: "conversations_list",
  description: "List recent conversations with contacts across email, WhatsApp and SMS, including their messages.",
  mutates: false,
  input: z.object({ limit: z.number().int().min(1).max(50).default(20) }),
  run: async (ctx, input) => {
    const rows = await ctx.db
      .select({
        id: conversations.id,
        channel: conversations.channel,
        lastMessageAt: conversations.lastMessageAt,
        firstName: contacts.firstName,
        lastName: contacts.lastName,
      })
      .from(conversations)
      .leftJoin(contacts, eq(contacts.id, conversations.contactId))
      .where(eq(conversations.agencyId, ctx.agencyId))
      .orderBy(desc(conversations.lastMessageAt))
      .limit(input.limit);
    if (rows.length === 0) return [];

    const allMessages = await ctx.db
      .select()
      .from(messages)
      .where(and(eq(messages.agencyId, ctx.agencyId), inArray(messages.conversationId, rows.map((r) => r.id))))
      .orderBy(asc(messages.sentAt));
    return rows.map((row) => ({ ...row, messages: allMessages.filter((m) => m.conversationId === row.id) }));
  },
});
