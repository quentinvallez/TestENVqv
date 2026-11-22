import { and, asc, desc, eq, gt, inArray, isNotNull, ne, notInArray, or, schema } from "@viewing/db";
import type { LeadSource } from "@viewing/db/schema";
import { z } from "zod";
import { recordEvent } from "../events";
import { MAX_BOOKING_REMINDERS } from "../automations/rules";
import { invitesClient, requestStatus, requestStages, type RequestReason, type RequestStage } from "../planner/requests";
import { defineTool, type ToolContext } from "../tool";

/*
 * The requests board: every viewing request (website, contact form, Immoweb,
 * Zimmo, Immovlan, Immoscoop, phone) with where it stands, worked out from what
 * was really sent and booked. Not an inbox: clients' replies go to the agent's
 * own mailbox; only what needs a person (a question, a phone-only lead, a
 * WhatsApp answer) comes up here.
 */

const { appointments, conversations, leads, messages, proposals } = schema;

const DAY = 24 * 3600 * 1000;
/** Closed requests stay on the board this long. */
const CLOSED_VISIBLE = 30 * DAY;
/** Messages and conversations older than this don't change where a request stands. */
const HISTORY = 90 * DAY;

type Message = { id: string; direction: "inbound" | "outbound"; authorType: string | null; metadata: Record<string, unknown>; delivery: string | null; sentAt: Date; body: string };
type Conversation = {
  id: string;
  contactId: string | null;
  leadId: string | null;
  listingId: string | null;
  channel: string;
  status: "open" | "waiting" | "done";
  summary: string | null;
  messages: Message[];
  proposals: { id: string; summary: string; kind: string | null }[];
};

export type RequestItem = {
  /** The lead's id, or the conversation's for a message that belongs to no request. */
  id: string;
  kind: "lead" | "message";
  stage: RequestStage;
  reason: RequestReason | null;
  source: LeadSource | null;
  contact: { id: string; name: string; email: string | null; phone: string | null; language: string | null } | null;
  listing: { id: string; reference: string; street: string | null; houseNumber: string | null; city: string | null; status: string } | null;
  agent: { id: string; name: string; color: string | null } | null;
  createdAt: Date;
  /** When the client first got our booking link (or reply), and the reminder after it. */
  invitedAt: Date | null;
  remindedAt: Date | null;
  reminders: number;
  viewing: { id: string; startsAt: Date; status: string; agentName: string | null } | null;
  /** What waits for a person, in one line. */
  draft: { id: string; summary: string } | null;
  /** The client's own words: the request, or their latest message. */
  message: string | null;
  conversationId: string | null;
  /** Latest thing that happened, for sorting. */
  activityAt: Date;
};

const realMessage = (m: Message) => m.authorType !== "system";
const latest = <T extends { sentAt: Date }>(items: T[]) => items.reduce<T | null>((a, b) => (!a || b.sentAt > a.sentAt ? b : a), null);

/** A client message that still waits for a person: it came after our latest message and nobody set the conversation aside. */
function clientWaiting(conversation: Conversation) {
  if (conversation.status !== "open") return null;
  const real = conversation.messages.filter(realMessage);
  const last = real[real.length - 1];
  if (!last || last.direction !== "inbound" || last.metadata.copyOnly) return null;
  return last;
}

async function loadBoard(ctx: ToolContext, now: Date) {
  const leadRows = await ctx.db.query.leads.findMany({
    where: and(
      eq(leads.agencyId, ctx.agencyId),
      inArray(leads.intent, ["buy", "rent"]),
      or(notInArray(leads.stage, ["won", "lost"]), gt(leads.updatedAt, new Date(now.getTime() - CLOSED_VISIBLE))),
      gt(leads.updatedAt, new Date(now.getTime() - HISTORY)),
    ),
    orderBy: desc(leads.updatedAt),
    limit: 500,
    with: {
      contact: true,
      listing: { columns: { id: true, reference: true, street: true, houseNumber: true, city: true, status: true } },
      agent: { columns: { id: true, name: true, color: true } },
    },
  });
  const contactIds = [...new Set(leadRows.map((l) => l.contactId))];
  const since = new Date(now.getTime() - HISTORY);

  const conversationRows: Conversation[] = await ctx.db.query.conversations.findMany({
    where: and(
      eq(conversations.agencyId, ctx.agencyId),
      or(
        contactIds.length ? inArray(conversations.contactId, contactIds) : undefined,
        // Anything else a person still has to look at: a client wrote, or a draft waits.
        and(eq(conversations.status, "open"), gt(conversations.lastMessageAt, since)),
      ),
    ),
    columns: { id: true, contactId: true, leadId: true, listingId: true, channel: true, status: true, summary: true },
    with: {
      messages: {
        where: gt(messages.sentAt, since),
        orderBy: asc(messages.sentAt),
        columns: { id: true, direction: true, authorType: true, metadata: true, delivery: true, sentAt: true, body: true },
      },
      proposals: { where: eq(proposals.status, "pending"), orderBy: desc(proposals.createdAt), columns: { id: true, summary: true, kind: true } },
    },
  });
  // Conversations with a pending draft but no recent messages still count.
  const withDraft = await ctx.db
    .selectDistinct({ id: proposals.conversationId })
    .from(proposals)
    .where(and(eq(proposals.agencyId, ctx.agencyId), eq(proposals.status, "pending"), isNotNull(proposals.conversationId)));
  const missing = withDraft.map((p) => p.id!).filter((id) => !conversationRows.some((c) => c.id === id));
  if (missing.length) {
    conversationRows.push(
      ...(await ctx.db.query.conversations.findMany({
        where: and(eq(conversations.agencyId, ctx.agencyId), inArray(conversations.id, missing)),
        columns: { id: true, contactId: true, leadId: true, listingId: true, channel: true, status: true, summary: true },
        with: {
          messages: { orderBy: desc(messages.sentAt), limit: 20, columns: { id: true, direction: true, authorType: true, metadata: true, delivery: true, sentAt: true, body: true } },
          proposals: { where: eq(proposals.status, "pending"), orderBy: desc(proposals.createdAt), columns: { id: true, summary: true, kind: true } },
        },
      })).map((c) => ({ ...c, messages: [...c.messages].reverse() })),
    );
  }

  const viewings = contactIds.length
    ? await ctx.db.query.appointments.findMany({
        where: and(eq(appointments.agencyId, ctx.agencyId), inArray(appointments.contactId, contactIds), eq(appointments.type, "viewing"), ne(appointments.status, "cancelled")),
        columns: { id: true, leadId: true, contactId: true, listingId: true, startsAt: true, status: true },
        with: { agent: { columns: { name: true } } },
        orderBy: asc(appointments.startsAt),
      })
    : [];

  const used = new Set<string>();
  const items: RequestItem[] = leadRows.map((lead) => {
    // A conversation belongs to the request when it names it, or is with the same client about the same (or no) listing.
    const convs = conversationRows.filter(
      (c) => c.leadId === lead.id || (c.contactId === lead.contactId && (!c.listingId || !lead.listingId || c.listingId === lead.listingId) && (!c.leadId || !leadRows.some((l) => l.id === c.leadId))),
    );
    convs.forEach((c) => used.add(c.id));
    const all = convs.flatMap((c) => c.messages).sort((a, b) => a.sentAt.getTime() - b.sentAt.getTime());
    const fromRequest = all.filter((m) => m.sentAt.getTime() >= lead.createdAt.getTime() - 60_000);
    const invite = latest(fromRequest.filter(invitesClient));
    const reminderMessages = fromRequest.filter((m) => m.direction === "outbound" && m.metadata.kind === "nudge" && (!invite || m.sentAt >= invite.sentAt));
    const reminder = latest(reminderMessages);
    const lastOut = latest(fromRequest.filter((m) => m.direction === "outbound" && realMessage(m)));
    const draftConv = convs.find((c) => c.proposals.length);
    const waiting = lastOut ? convs.map(clientWaiting).find(Boolean) : null;
    const leadViewings = viewings.filter((v) => v.leadId === lead.id || (!v.leadId && v.contactId === lead.contactId && (!lead.listingId || v.listingId === lead.listingId)));
    const upcoming = leadViewings.find((v) => v.startsAt > now && (v.status === "scheduled" || v.status === "confirmed"));
    const past = [...leadViewings].reverse().find((v) => v.startsAt <= now && v.status === "completed");
    const { stage, reason } = requestStatus(
      {
        leadStage: lead.stage,
        createdAt: lead.createdAt,
        hasEmail: Boolean(lead.contact.email),
        hasPhone: Boolean(lead.contact.phone),
        listingStatus: lead.listing?.status ?? null,
        hasUpcomingViewing: Boolean(upcoming),
        hasPastViewing: Boolean(past),
        invitedAt: invite?.sentAt ?? null,
        remindedAt: reminder?.sentAt ?? null,
        reminders: reminderMessages.length,
        maxReminders: MAX_BOOKING_REMINDERS,
        lastDeliveryFailed: lastOut?.delivery === "failed" && !lastOut.metadata.recoveredBy,
        pendingDraft: Boolean(draftConv),
        clientWroteLast: Boolean(waiting),
      },
      now,
    );
    const viewing = upcoming ?? past ?? null;
    const firstInbound = all.find((m) => m.direction === "inbound" && m.authorType === "contact");
    return {
      id: lead.id,
      kind: "lead",
      stage,
      reason,
      source: lead.source,
      contact: {
        id: lead.contact.id,
        name: [lead.contact.firstName, lead.contact.lastName].filter(Boolean).join(" ") || lead.contact.email || lead.contact.phone || "Unknown",
        email: lead.contact.email,
        phone: lead.contact.phone,
        language: lead.contact.language,
      },
      listing: lead.listing,
      agent: lead.agent,
      createdAt: lead.createdAt,
      invitedAt: invite?.sentAt ?? null,
      remindedAt: reminder?.sentAt ?? null,
      reminders: reminderMessages.length,
      viewing: viewing && { id: viewing.id, startsAt: viewing.startsAt, status: viewing.status, agentName: viewing.agent?.name ?? null },
      draft: draftConv ? { id: draftConv.proposals[0]!.id, summary: draftConv.proposals[0]!.summary } : null,
      message: (waiting?.body ?? lead.message ?? firstInbound?.body ?? null)?.slice(0, 400) ?? null,
      conversationId: (draftConv ?? convs.find((c) => clientWaiting(c)) ?? convs[0])?.id ?? null,
      activityAt: new Date(Math.max(lead.updatedAt.getTime(), all[all.length - 1]?.sentAt.getTime() ?? 0)),
    };
  });

  // Messages that belong to no request (an occupant on WhatsApp, a seller, a stranger) still reach a person when they need one.
  const loose = conversationRows.filter((c) => !used.has(c.id) && (c.proposals.length || clientWaiting(c)));
  if (loose.length) {
    const people = await ctx.db.query.contacts.findMany({
      where: and(eq(schema.contacts.agencyId, ctx.agencyId), inArray(schema.contacts.id, loose.map((c) => c.contactId).filter((id): id is string => Boolean(id)))),
    });
    for (const c of loose) {
      const person = people.find((p) => p.id === c.contactId);
      const last = latest(c.messages.filter(realMessage));
      items.push({
        id: c.id,
        kind: "message",
        stage: "needs_you",
        reason: c.proposals.length ? "draft" : "client_wrote",
        source: null,
        contact: person
          ? { id: person.id, name: [person.firstName, person.lastName].filter(Boolean).join(" ") || person.email || person.phone || "Unknown", email: person.email, phone: person.phone, language: person.language }
          : null,
        listing: null,
        agent: null,
        createdAt: c.messages[0]?.sentAt ?? now,
        invitedAt: null,
        remindedAt: null,
        reminders: 0,
        viewing: null,
        draft: c.proposals[0] ? { id: c.proposals[0].id, summary: c.proposals[0].summary } : null,
        message: (clientWaiting(c)?.body ?? c.summary ?? null)?.slice(0, 400) ?? null,
        conversationId: c.id,
        activityAt: last?.sentAt ?? now,
      });
    }
  }
  return items;
}

export const listRequests = defineTool({
  name: "requests_list",
  description:
    "The viewing requests board: every request from the website, contact forms and the portals, by stage (needs you, contacted, not planned yet, planned, visited, closed), with why a person is needed and counts per stage.",
  mutates: false,
  input: z.object({ stage: z.enum(requestStages).optional() }),
  run: async (ctx, input) => {
    const now = new Date();
    const all = await loadBoard(ctx, now);
    const counts = Object.fromEntries(requestStages.map((s) => [s, all.filter((i) => i.stage === s).length])) as Record<RequestStage, number>;
    const order = (i: RequestItem) => (i.stage === "planned" && i.viewing ? -i.viewing.startsAt.getTime() : i.activityAt.getTime());
    const items = all
      .filter((i) => !input.stage || i.stage === input.stage)
      // Planned: soonest viewing first. Everything else: latest activity first.
      .sort((a, b) => order(b) - order(a));
    return { items, counts };
  },
});

export const getRequest = defineTool({
  name: "requests_get",
  description: "One viewing request as the board shows it, with its conversations, so the agent sees what was sent and what waits.",
  mutates: false,
  input: z.object({ id: z.string() }),
  run: async (ctx, input) => {
    // Off the board (closed long ago, or never needed a person): null, and the page falls back to the contact.
    return (await loadBoard(ctx, new Date())).find((i) => i.id === input.id) ?? null;
  },
});

/** The client's conversations for a request (or the one conversation of a loose message), newest first. */
async function requestConversations(ctx: ToolContext, id: string) {
  const [lead] = await ctx.db.select().from(leads).where(and(eq(leads.agencyId, ctx.agencyId), eq(leads.id, id)));
  if (!lead) {
    const [conversation] = await ctx.db.select().from(conversations).where(and(eq(conversations.agencyId, ctx.agencyId), eq(conversations.id, id)));
    return { lead: null, conversations: conversation ? [conversation] : [] };
  }
  const rows = await ctx.db
    .select()
    .from(conversations)
    .where(and(eq(conversations.agencyId, ctx.agencyId), or(eq(conversations.leadId, lead.id), eq(conversations.contactId, lead.contactId))))
    .orderBy(desc(conversations.lastMessageAt));
  return { lead, conversations: rows.filter((c) => c.leadId === lead.id || !c.listingId || !lead.listingId || c.listingId === lead.listingId) };
}

export const requestConversationIds = defineTool({
  name: "requests_conversations",
  description: "The ids of the conversations that belong to a viewing request, newest first.",
  mutates: false,
  input: z.object({ id: z.string() }),
  run: async (ctx, input) => (await requestConversations(ctx, input.id)).conversations.map((c) => c.id),
});

export const markRequest = defineTool({
  name: "requests_mark",
  description:
    "Settle a viewing request by hand: 'handled' (the agent called or emailed the client from their own mailbox; waiting drafts are dropped), 'not_interested' (closes it), or 'reopen'.",
  mutates: true,
  input: z.object({ id: z.string(), action: z.enum(["handled", "not_interested", "reopen"]) }),
  run: async (ctx, input) => {
    const { lead, conversations: convs } = await requestConversations(ctx, input.id);
    if (!lead && convs.length === 0) throw new Error("Request not found");
    const ids = convs.map((c) => c.id);
    if (input.action !== "reopen" && ids.length) {
      await ctx.db
        .update(proposals)
        .set({ status: "rejected", decidedBy: ctx.actor.type === "user" ? ctx.actor.id : null, decidedAt: new Date(), result: { handledByHand: true } })
        .where(and(eq(proposals.agencyId, ctx.agencyId), inArray(proposals.conversationId, ids), eq(proposals.status, "pending")));
      await ctx.db
        .update(conversations)
        .set({ status: input.action === "handled" ? "waiting" : "done", unread: false })
        .where(and(eq(conversations.agencyId, ctx.agencyId), inArray(conversations.id, ids)));
    }
    const before = lead?.stage ?? null;
    const stage =
      !lead
        ? null
        : input.action === "not_interested"
          ? "lost"
          : input.action === "reopen"
            ? lead.stage === "lost" || lead.stage === "won"
              ? "invited"
              : lead.stage
            : lead.stage === "new"
              ? "invited"
              : lead.stage;
    if (lead && stage && stage !== before) {
      await ctx.db.update(leads).set({ stage }).where(and(eq(leads.agencyId, ctx.agencyId), eq(leads.id, lead.id)));
    }
    if (input.action === "reopen" && ids.length) {
      await ctx.db.update(conversations).set({ status: "waiting" }).where(and(eq(conversations.agencyId, ctx.agencyId), inArray(conversations.id, ids), eq(conversations.status, "done")));
    }
    await recordEvent(ctx, {
      type: `request.${input.action}`,
      subjectType: lead ? "lead" : "conversation",
      subjectId: input.id,
      data: { from: before, to: stage },
    });
    return { stage };
  },
});
