import { and, asc, desc, eq, gt, inArray, isNotNull, ne, notInArray, or, schema } from "@viewing/db";
import type { LeadSource } from "@viewing/db/schema";
import { z } from "zod";
import { recordEvent } from "../events";
import { MAX_BOOKING_REMINDERS } from "../automations/rules";
import { invitesClient, needsPerson, onBoard, requestStatus, requestStages, type RequestReason, type RequestStage } from "../planner/requests";
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
  category: string | null;
  messages: Message[];
  proposals: Draft[];
  /** A drafted reply to something the client wrote: not shown, the agent answers from their own mailbox. */
  replyDraft?: boolean;
};
type Draft = { id: string; summary: string; kind: string | null; input: Record<string, unknown> };

/**
 * Drafts of our own messages (a confirmation, reminder, follow-up, owner alert… the agency set to
 * "Ask me first") show on the board. A drafted answer to a client's own message doesn't: clients'
 * messages go to the agent's mailbox and are answered there, so the board never becomes an inbox.
 */
export const ownMessageDraft = (p: { kind: string | null; input: Record<string, unknown> }) => p.kind !== "reply" || typeof p.input.kind === "string";

/** Keeps only drafts of our own messages, and notes whether a reply to the client was drafted. */
const withOwnDrafts = <C extends { proposals: Draft[] }>(c: C) => ({ ...c, proposals: c.proposals.filter(ownMessageDraft), replyDraft: c.proposals.some((p) => !ownMessageDraft(p)) });

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
  /** What the client answered to the booking questions in the widget. */
  answers: { id: string; question: string; answer: string }[];
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

  const conversationRows: Conversation[] = (await ctx.db.query.conversations.findMany({
    where: and(
      eq(conversations.agencyId, ctx.agencyId),
      or(
        contactIds.length ? inArray(conversations.contactId, contactIds) : undefined,
        // Anything else a person still has to look at: a client wrote, or a draft waits.
        and(eq(conversations.status, "open"), gt(conversations.lastMessageAt, since)),
      ),
    ),
    columns: { id: true, contactId: true, leadId: true, listingId: true, channel: true, status: true, summary: true, category: true },
    with: {
      messages: {
        where: gt(messages.sentAt, since),
        orderBy: asc(messages.sentAt),
        columns: { id: true, direction: true, authorType: true, metadata: true, delivery: true, sentAt: true, body: true },
      },
      proposals: { where: eq(proposals.status, "pending"), orderBy: desc(proposals.createdAt), columns: { id: true, summary: true, kind: true, input: true } },
    },
  })).map(withOwnDrafts);
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
        columns: { id: true, contactId: true, leadId: true, listingId: true, channel: true, status: true, summary: true, category: true },
        with: {
          messages: { orderBy: desc(messages.sentAt), limit: 20, columns: { id: true, direction: true, authorType: true, metadata: true, delivery: true, sentAt: true, body: true } },
          proposals: { where: eq(proposals.status, "pending"), orderBy: desc(proposals.createdAt), columns: { id: true, summary: true, kind: true, input: true } },
        },
      })).map((c) => withOwnDrafts({ ...c, messages: [...c.messages].reverse() })),
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
        question: convs.some((c) => c.category === "question" || c.replyDraft),
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
      answers: lead.qualification?.answers ?? [],
      draft: draftConv ? { id: draftConv.proposals[0]!.id, summary: draftConv.proposals[0]!.summary } : null,
      message: (lead.message ?? firstInbound?.body ?? null)?.slice(0, 400) ?? null,
      conversationId: (draftConv ?? convs[0])?.id ?? null,
      activityAt: new Date(Math.max(lead.updatedAt.getTime(), all[all.length - 1]?.sentAt.getTime() ?? 0)),
    };
  });

  // Our own messages to people outside a request (an owner's invitation, a seller's follow-up) that wait for approval.
  const loose = conversationRows.filter((c) => !used.has(c.id) && c.proposals.length);
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
        // About to go out once approved: it sits with the requests we contacted, marked as waiting for an OK.
        stage: "contacted",
        reason: "draft",
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
        answers: [],
        draft: c.proposals[0] ? { id: c.proposals[0].id, summary: c.proposals[0].summary } : null,
        message: null,
        conversationId: c.id,
        activityAt: last?.sentAt ?? now,
      });
    }
  }
  // What nothing went out for automatically stays in the agent's mailbox, not on the board.
  return items.filter(onBoard);
}

export const listRequests = defineTool({
  name: "requests_list",
  description:
    "The viewing requests board: every request from the website, contact forms and the portals, by stage (contacted, not planned yet, planned, visited, closed), with counts per stage. The rare request a person must act on (no email, unknown or unavailable listing, failed delivery, a message set to Ask me first) stays in its stage with a reason.",
  mutates: false,
  input: z.object({ stage: z.enum(requestStages).optional() }),
  run: async (ctx, input) => {
    const now = new Date();
    const all = await loadBoard(ctx, now);
    const counts = Object.fromEntries(requestStages.map((s) => [s, all.filter((i) => i.stage === s).length])) as Record<RequestStage, number>;
    const order = (i: RequestItem) => (i.stage === "planned" && i.viewing ? -i.viewing.startsAt.getTime() : i.activityAt.getTime());
    const items = all
      .filter((i) => !input.stage || i.stage === input.stage)
      // The few that need a person first; then planned: soonest viewing first, everything else: latest activity first.
      .sort((a, b) => Number(needsPerson(b)) - Number(needsPerson(a)) || order(b) - order(a));
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
