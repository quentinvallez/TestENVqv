import { and, asc, desc, eq, gt, inArray, ne, schema } from "@viewing/db";
import type { ConversationCategory, Priority } from "@viewing/db/schema";
import { z } from "zod";
import { aiAvailable, AiUnavailableError, generateStructured } from "../ai/client";
import { availableSlots } from "../tools/booking";
import { AGENCY_TIMEZONE } from "../time";
import { runTool, type ToolContext } from "../tool";
import { composeMessage, detailLabels, formatSlot, linkLabels, signature, templates, toLang, type Lang } from "./language";

const { conversations, messages, contacts, listings, agents, appointments, leads, organization, proposals } = schema;

/** What the planner can classify an incoming message as. "booking" is only set by the system for widget bookings. */
export const categories = ["viewing_request", "reschedule", "cancellation", "question", "offer", "feedback", "confirmation", "other"] as const;
type TriageCategory = (typeof categories)[number];

/** Everything the planner knows about a conversation before it acts. */
async function loadThread(ctx: ToolContext, conversationId: string) {
  const conversation = await ctx.db.query.conversations.findFirst({
    where: and(eq(conversations.agencyId, ctx.agencyId), eq(conversations.id, conversationId)),
    with: { contact: true, messages: { orderBy: asc(messages.sentAt) } },
  });
  if (!conversation) throw new Error("Conversation not found");

  const contactLeads = conversation.contactId
    ? await ctx.db.query.leads.findMany({
        where: and(eq(leads.agencyId, ctx.agencyId), eq(leads.contactId, conversation.contactId)),
        orderBy: desc(leads.updatedAt),
      })
    : [];
  const listingId = conversation.listingId ?? contactLeads[0]?.listingId ?? null;
  const listing = listingId
    ? ((await ctx.db.query.listings.findFirst({ where: and(eq(listings.agencyId, ctx.agencyId), eq(listings.id, listingId)) })) ?? null)
    : null;
  const lead = contactLeads.find((l) => l.listingId === listingId) ?? contactLeads[0] ?? null;

  const agentId = conversation.agentId ?? listing?.agentId ?? lead?.agentId ?? null;
  const agent = agentId ? ((await ctx.db.query.agents.findFirst({ where: and(eq(agents.agencyId, ctx.agencyId), eq(agents.id, agentId)) })) ?? null) : null;

  const [upcoming] = conversation.contactId
    ? await ctx.db
        .select()
        .from(appointments)
        .where(
          and(
            eq(appointments.agencyId, ctx.agencyId),
            eq(appointments.contactId, conversation.contactId),
            inArray(appointments.status, ["scheduled", "confirmed"]),
            gt(appointments.startsAt, new Date()),
          ),
        )
        .orderBy(asc(appointments.startsAt))
        .limit(1)
    : [];

  const [agency] = await ctx.db.select({ name: organization.name }).from(organization).where(eq(organization.id, ctx.agencyId));
  return { conversation, contact: conversation.contact, listing, lead, agent, upcoming: upcoming ?? null, agencyName: agency?.name ?? "" };
}

type Thread = Awaited<ReturnType<typeof loadThread>>;

/** Public address of the app, so links in messages work outside it. */
function absoluteUrl(path: string) {
  const host = process.env.APP_URL ?? (process.env.VERCEL_BRANCH_URL ? `https://${process.env.VERCEL_BRANCH_URL}` : process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "http://localhost:3000");
  return new URL(path, host).toString();
}

const addressOf = (listing: Thread["listing"]) =>
  listing ? [[listing.street, listing.houseNumber].filter(Boolean).join(" "), listing.city].filter(Boolean).join(", ") : "";

function transcript(thread: Thread) {
  return thread.conversation.messages
    .map((m) => `${m.authorType === "system" ? "SYSTEM NOTE" : m.direction === "inbound" ? "CLIENT" : "AGENCY"} (${m.sentAt.toISOString()}): ${m.body}`)
    .join("\n\n");
}

function listingFacts(listing: Thread["listing"]) {
  if (!listing) return "No specific listing.";
  const { reference, title, transaction, propertyType, street, houseNumber, postcode, city, price, bedrooms, bathrooms, livingArea, plotArea, epcLabel, epcScore, features, description } = listing;
  return JSON.stringify({ reference, title, transaction, propertyType, street, houseNumber, postcode, city, price, bedrooms, bathrooms, livingArea, plotArea, epcLabel, epcScore, features, description });
}

// ---------------------------------------------------------------- triage

const triageSchema = z.object({
  category: z.enum(categories),
  priority: z.enum(["high", "normal", "low"]),
  language: z.enum(["nl", "fr", "en"]),
  summary: z.string().describe("One short English sentence for the agent's inbox, e.g. 'Wants to move Saturday's viewing to next week.'"),
  sentiment: z.enum(["positive", "neutral", "negative"]),
});
export type Triage = z.output<typeof triageSchema> & { by: "ai" | "rules" };

const TRIAGE_SYSTEM = `You sort incoming messages for a Belgian real estate agency's planning assistant.
Classify the client's latest message in the context of the whole conversation.
Categories: viewing_request (wants to visit), reschedule (wants another time for an existing viewing), cancellation (cancels without asking for a new time), question (asks about the property or process), offer (wants to make or discuss an offer, or is clearly ready to), feedback (reacts to a viewing they did), confirmation (just confirms or thanks), other.
Priority: high when money or a deadline is involved (offers, a viewing within 24 hours that is being changed), low for plain thanks or confirmations, otherwise normal.
Language is the language the client writes in.`;

const keywordRules: [TriageCategory, RegExp][] = [
  ["offer", /\b(bod|offre|offer|kopen|acheter|compromis)\b/i],
  ["reschedule", /(verplaats|ander moment|volgende week|kan het later|déplacer|autre moment|semaine prochaine|reschedul|another time|next week)/i],
  ["cancellation", /(annul|kan (toch )?niet komen|niet meer|cancel|can't make|ne pourrai pas)/i],
  ["feedback", /(bezoek gehad|merci pour la visite|thanks for the viewing|te klein|trop petit|too small|we vonden|nous avons)/i],
  ["viewing_request", /(bezoek|bezichtig|bekijken|komen kijken|visite|visiter|viewing|nog beschikbaar|toujours disponible|still available)/i],
  ["question", /\?/],
];

function triageByRules(thread: Thread): Triage {
  const last = [...thread.conversation.messages].reverse().find((m) => m.direction === "inbound");
  const text = last?.body ?? "";
  // Moving or cancelling only makes sense when there is a viewing to move.
  const rules = thread.upcoming ? keywordRules : keywordRules.filter(([c]) => c !== "reschedule" && c !== "cancellation");
  const category = rules.find(([, re]) => re.test(text))?.[0] ?? "other";
  const language: Lang = /\b(je|vous|merci|bonjour|nous)\b/i.test(text) ? "fr" : /\b(the|you|would|thanks|hi)\b/i.test(text) ? "en" : toLang(thread.contact?.language);
  const negative = /(te klein|trop petit|too small|niet voor ons|pas pour nous|not for us)/i.test(text);
  const priority: Priority = category === "offer" ? "high" : category === "confirmation" || category === "other" ? "low" : "normal";
  const summaries: Record<TriageCategory, string> = {
    viewing_request: "Asks to visit the property.",
    reschedule: "Wants to move the viewing to another time.",
    cancellation: "Cancels the viewing.",
    question: "Has a question about the property.",
    offer: "Interested in making an offer.",
    feedback: negative ? "Viewed the property; not a match." : "Shared feedback after the viewing.",
    confirmation: "Confirms or says thanks.",
    other: "General message.",
  };
  return { category, priority, language, summary: summaries[category], sentiment: negative ? "negative" : "neutral", by: "rules" };
}

async function triage(thread: Thread, useAi: boolean): Promise<Triage> {
  if (useAi && aiAvailable()) {
    try {
      const result = await generateStructured({
        system: TRIAGE_SYSTEM,
        prompt: `Listing: ${listingFacts(thread.listing)}\nUpcoming viewing: ${thread.upcoming ? thread.upcoming.startsAt.toISOString() : "none"}\n\nConversation:\n${transcript(thread)}`,
        schema: triageSchema,
        effort: "low",
      });
      return { ...result, by: "ai" };
    } catch (error) {
      if (!(error instanceof AiUnavailableError)) console.error("Triage failed, using rules", error);
    }
  }
  return triageByRules(thread);
}

// ---------------------------------------------------------------- drafting

const localHour = (date: Date) =>
  Number(new Intl.DateTimeFormat("en-GB", { timeZone: AGENCY_TIMEZONE, hour: "2-digit", hourCycle: "h23" }).format(date));

/** Up to `count` slots on different days, starting tomorrow, alternating morning and afternoon. */
export function pickSpreadSlots(slots: { start: Date }[], count = 3): Date[] {
  const tomorrow = Date.now() + 12 * 3600 * 1000;
  const byDay = new Map<string, Date[]>();
  for (const slot of slots) {
    if (slot.start.getTime() < tomorrow) continue;
    const key = slot.start.toISOString().slice(0, 10);
    byDay.set(key, [...(byDay.get(key) ?? []), slot.start]);
  }
  const picked: Date[] = [];
  let afternoon = false;
  for (const day of byDay.values()) {
    if (picked.length >= count) break;
    const preferred = day.find((d) => (localHour(d) >= 13) === afternoon) ?? day[0]!;
    picked.push(preferred);
    afternoon = !afternoon;
  }
  return picked;
}

const draftSchema = z.object({
  body: z.string().describe("Greeting and message body only. No signature, no list of times, no links: those are added automatically after your text."),
});

const DRAFT_SYSTEM = `You write replies for a Belgian real estate agent, to clients who contacted the agency by email or WhatsApp.
Write in the client's language (Dutch as spoken in Flanders, Belgian French, or English), warm and professional, short: two to four sentences after the greeting. Address the client by first name with the usual formality for the language (u in Dutch, vous in French).
Only state facts about the property that appear in the listing data; never invent details, prices, dates or promises. If the client asks something the data does not answer, say the agent will check and come back to them.
If times will be offered, end your text by inviting the client to pick one of the times below; do not write the times yourself.
For WhatsApp keep it conversational and a little shorter than email.`;

type DraftPlan = {
  kind: "reply" | "follow_up" | "recommendation";
  purpose: string;
  templateKey: keyof typeof templates;
  slots: Date[];
  details?: { label: string; value: string }[];
  lines?: string[];
  link?: { url: string; label: string };
  cancelAppointmentId?: string;
  leadStage?: "invited" | "offer" | "follow_up";
  summary: string;
  otherListing?: string;
  /** Address to talk about when it isn't a listing, e.g. the owner's home for a valuation. */
  address?: string;
};

async function planFor(ctx: ToolContext, thread: Thread, t: Triage): Promise<DraftPlan | null> {
  const lang = t.language;
  const name = thread.contact?.firstName ?? "";
  const slotsFor = async (excludeAppointmentId?: string) => {
    if (!thread.agent) return [];
    const { slots } = await runTool(availableSlots, ctx, { agentId: thread.agent.id, days: 10, excludeAppointmentId });
    return pickSpreadSlots(slots);
  };

  switch (t.category) {
    case "reschedule": {
      if (!thread.upcoming) return null;
      const slots = await slotsFor(thread.upcoming.id);
      return {
        kind: "reply",
        purpose: "The client wants to move their existing viewing. Acknowledge kindly and offer the new times below.",
        templateKey: "reschedule",
        slots,
        link: { url: `/a/${thread.upcoming.manageToken}?change=1`, label: linkLabels.change[lang] },
        summary: `Offer ${name} ${slots.length} new times for the viewing`,
      };
    }
    case "cancellation": {
      const slots = await slotsFor(thread.upcoming?.id);
      return {
        kind: "reply",
        purpose: "The client cancels. Confirm the cancellation and, without pushing, offer the times below in case they still want to come.",
        templateKey: "cancellation",
        slots,
        link: thread.listing ? { url: `/book/${thread.listing.id}`, label: linkLabels.book[lang] } : undefined,
        cancelAppointmentId: thread.upcoming?.id,
        leadStage: "invited",
        summary: thread.upcoming ? `Cancel ${name}'s viewing and offer new times` : `Reply to ${name}'s cancellation`,
      };
    }
    case "viewing_request": {
      const slots = await slotsFor();
      return {
        kind: "reply",
        purpose: "The client asks to visit. Thank them, confirm the property is available, and offer the times below.",
        templateKey: "viewing_request",
        slots,
        link: thread.listing ? { url: `/book/${thread.listing.id}`, label: linkLabels.book[lang] } : undefined,
        leadStage: "invited",
        summary: `Invite ${name} with ${slots.length} viewing times`,
      };
    }
    case "question":
      return {
        kind: "reply",
        purpose: "The client asks a question. Answer it from the listing data if possible; otherwise say the agent will check and reply today.",
        templateKey: "question",
        slots: [],
        summary: `Answer ${name}'s question`,
      };
    case "offer":
      return {
        kind: "reply",
        purpose: "The client is ready to make or discuss an offer. Show enthusiasm without pressure, and propose that the agent calls to discuss next steps. Ask when a call suits them.",
        templateKey: "offer",
        slots: [],
        leadStage: "offer",
        summary: `Reply to ${name}'s offer interest and plan a call`,
      };
    case "feedback": {
      if (t.sentiment !== "negative") {
        return {
          kind: "reply",
          purpose: "The client shared positive or mixed feedback after a viewing. Thank them, respond to what they said, and ask whether they would like a second visit or to discuss an offer.",
          templateKey: "follow_up",
          slots: [],
          leadStage: "follow_up",
          summary: `Follow up on ${name}'s feedback`,
        };
      }
      const candidates = await ctx.db
        .select()
        .from(listings)
        .where(
          and(
            eq(listings.agencyId, ctx.agencyId),
            eq(listings.status, "active"),
            thread.listing ? eq(listings.transaction, thread.listing.transaction) : undefined,
            thread.listing ? ne(listings.id, thread.listing.id) : undefined,
          ),
        );
      // Prefer the same kind of property, then somewhat bigger, then nearby.
      const current = thread.listing;
      const score = (l: (typeof candidates)[number]) =>
        (current && l.propertyType === current.propertyType ? 4 : 0) +
        (current?.livingArea && l.livingArea && l.livingArea > current.livingArea ? 2 : 0) +
        (current?.postcode && l.postcode?.[0] === current.postcode[0] ? 1 : 0);
      const alternative = candidates.sort((a, b) => score(b) - score(a))[0];
      const otherListing = alternative ? `${addressOf(alternative)} (${alternative.reference})` : undefined;
      return {
        kind: "reply",
        purpose: `The viewing was not a match. Thank them for the honest feedback${otherListing ? ` and suggest this other listing: ${otherListing}` : ""}. Offer to let them know about new listings that fit better.`,
        templateKey: "feedback_negative",
        slots: [],
        summary: `Thank ${name} and suggest another property`,
        otherListing,
      };
    }
    default:
      return null;
  }
}

async function writeBody(thread: Thread, plan: DraftPlan, lang: Lang, useAi: boolean): Promise<{ body: string; by: "ai" | "template" }> {
  if (useAi && aiAvailable()) {
    try {
      const { body } = await generateStructured({
        system: DRAFT_SYSTEM,
        prompt: [
          `Agency: ${thread.agencyName}. Agent: ${thread.agent?.name ?? "the agent"}. Channel: ${thread.conversation.channel}.`,
          `Client: ${thread.contact?.firstName ?? ""} ${thread.contact?.lastName ?? ""}. Write in: ${lang}.`,
          `Listing: ${listingFacts(thread.listing)}`,
          thread.lead?.qualification?.answers.length ? `What the client told us: ${JSON.stringify(thread.lead.qualification.answers)}` : "",
          plan.lines?.length ? `These items are listed after your text (do not repeat them): ${plan.lines.join("; ")}` : plan.slots.length ? `${plan.slots.length} times will be listed after your text.` : plan.details?.length ? "The confirmed time, place and agent are listed after your text; do not repeat them." : "No times will be offered.",
          `Your task: ${plan.purpose}`,
          `Conversation so far:\n${transcript(thread) || "(no messages yet: this is a first follow-up after the viewing)"}`,
        ]
          .filter(Boolean)
          .join("\n\n"),
        schema: draftSchema,
        effort: "medium",
      });
      return { body, by: "ai" };
    } catch (error) {
      if (!(error instanceof AiUnavailableError)) console.error("Drafting failed, using template", error);
    }
  }
  const body = templates[plan.templateKey]![lang]({
    name: thread.contact?.firstName ?? "",
    address: plan.address || addressOf(thread.listing) || { nl: "het pand", fr: "le bien", en: "the property" }[lang],
    agentName: thread.agent?.name ?? thread.agencyName,
    other: plan.otherListing,
  });
  return { body, by: "template" };
}

async function propose(ctx: ToolContext, thread: Thread, plan: DraftPlan, lang: Lang, reasoning: string, useAi: boolean) {
  const { body, by } = await writeBody(thread, plan, lang, useAi);
  const text = composeMessage({
    lang,
    body,
    slots: plan.slots,
    lines: plan.lines,
    details: plan.details,
    link: plan.link && { ...plan.link, url: absoluteUrl(plan.link.url) },
    signature: signature(lang, thread.agent?.name ?? thread.agencyName, thread.agencyName, thread.conversation.channel),
  });

  // A newer draft replaces any older one still waiting in this conversation.
  await ctx.db
    .update(proposals)
    .set({ status: "rejected", result: { superseded: true } })
    .where(and(eq(proposals.agencyId, ctx.agencyId), eq(proposals.conversationId, thread.conversation.id), eq(proposals.status, "pending")));

  const [proposal] = await ctx.db
    .insert(proposals)
    .values({
      agencyId: ctx.agencyId,
      agentName: "planner",
      conversationId: thread.conversation.id,
      kind: plan.kind,
      generatedBy: by,
      toolName: "conversations_reply",
      input: {
        conversationId: thread.conversation.id,
        body: text,
        offeredSlots: plan.slots.map((s) => s.toISOString()),
        cancelAppointmentId: plan.cancelAppointmentId,
        leadStage: plan.leadStage,
      },
      summary: plan.summary,
      reasoning,
      subjectType: "conversation",
      subjectId: thread.conversation.id,
    })
    .returning();
  return proposal!;
}

/** Reads the latest client message, sorts the conversation and drafts a reply for approval. */
export async function handleConversation(ctx: ToolContext, conversationId: string, options: { useAi?: boolean } = {}) {
  const useAi = options.useAi ?? true;
  const thread = await loadThread(ctx, conversationId);
  const t = await triage(thread, useAi);

  await ctx.db
    .update(conversations)
    .set({ category: t.category, priority: t.priority, summary: t.summary, status: "open" })
    .where(eq(conversations.id, conversationId));
  const lastInbound = [...thread.conversation.messages].reverse().find((m) => m.direction === "inbound");
  if (lastInbound) await ctx.db.update(messages).set({ intent: t.category }).where(eq(messages.id, lastInbound.id));
  if (thread.contact && !thread.contact.language) await ctx.db.update(contacts).set({ language: t.language }).where(eq(contacts.id, thread.contact.id));

  const plan = await planFor(ctx, thread, t);
  const proposal = plan ? await propose(ctx, thread, plan, t.language, `${t.summary} (classified by ${t.by === "ai" ? "AI" : "keyword rules"})`, useAi) : null;
  return { triage: t, proposalId: proposal?.id ?? null };
}

/** Drafts a personal follow-up after a completed viewing, on the client's preferred channel. */
export async function draftFollowUp(ctx: ToolContext, appointmentId: string, options: { useAi?: boolean } = {}) {
  const useAi = options.useAi ?? true;
  const appointment = await ctx.db.query.appointments.findFirst({
    where: and(eq(appointments.agencyId, ctx.agencyId), eq(appointments.id, appointmentId)),
    with: { contact: true },
  });
  if (!appointment?.contact) throw new Error("Appointment or contact not found");
  const channel = appointment.contact.whatsappOptIn && appointment.contact.phone ? "whatsapp" : "email";

  let [conversation] = await ctx.db
    .select()
    .from(conversations)
    .where(and(eq(conversations.agencyId, ctx.agencyId), eq(conversations.contactId, appointment.contact.id), eq(conversations.channel, channel)))
    .orderBy(desc(conversations.lastMessageAt))
    .limit(1);
  if (!conversation) {
    [conversation] = await ctx.db
      .insert(conversations)
      .values({
        agencyId: ctx.agencyId,
        contactId: appointment.contact.id,
        leadId: appointment.leadId,
        listingId: appointment.listingId,
        agentId: appointment.agentId,
        channel,
        provider: channel === "whatsapp" ? "whatsapp_business" : "outlook",
        subject: channel === "email" ? "Uw bezoek" : null,
        category: "feedback",
        status: "open",
        unread: false,
        lastMessageAt: new Date(),
      })
      .returning();
  }

  await ctx.db
    .update(conversations)
    .set({ category: "feedback", summary: "Viewing done; no follow-up sent yet.", listingId: appointment.listingId ?? conversation!.listingId })
    .where(eq(conversations.id, conversation!.id));
  const thread = await loadThread(ctx, conversation!.id);
  thread.listing = appointment.listingId
    ? ((await ctx.db.query.listings.findFirst({ where: eq(listings.id, appointment.listingId) })) ?? thread.listing)
    : thread.listing;
  const lang = toLang(appointment.contact.language);
  const plan: DraftPlan = {
    kind: "follow_up",
    purpose:
      "Write a personal follow-up the day after the viewing. Mention one or two concrete things about this property that fit what the client told us. Ask how they liked it, and gently ask whether they would like a second visit or to discuss an offer.",
    templateKey: "follow_up",
    slots: [],
    leadStage: "follow_up",
    summary: `Follow up with ${appointment.contact.firstName ?? "the client"} after the viewing`,
  };
  const proposal = await propose(ctx, thread, plan, lang, "Viewing completed; no follow-up sent yet.", useAi);
  return { proposalId: proposal.id, conversationId: conversation!.id };
}

export type ClientAction = { kind: "booked" } | { kind: "cancelled" } | { kind: "rescheduled"; from: Date };

/**
 * When a client books through the widget, or moves or cancels through their
 * link, the agency sees it in the inbox like a message, on the channel the
 * client prefers (WhatsApp if they opted in, otherwise email), with a draft
 * reply waiting for approval: a confirmation, or new times after a cancellation.
 */
export async function noteClientAction(ctx: ToolContext, appointmentId: string, action: ClientAction, options: { useAi?: boolean } = {}) {
  const appointment = await ctx.db.query.appointments.findFirst({
    where: and(eq(appointments.agencyId, ctx.agencyId), eq(appointments.id, appointmentId)),
    with: { contact: true, listing: true, agent: true },
  });
  if (!appointment?.contact) return null;
  const contact = appointment.contact;
  const channel = contact.whatsappOptIn && contact.phone ? "whatsapp" : "email";

  let [conversation] = await ctx.db
    .select()
    .from(conversations)
    .where(and(eq(conversations.agencyId, ctx.agencyId), eq(conversations.contactId, contact.id), eq(conversations.channel, channel)))
    .orderBy(desc(conversations.lastMessageAt))
    .limit(1);
  conversation ??= (
    await ctx.db
      .insert(conversations)
      .values({
        agencyId: ctx.agencyId,
        contactId: contact.id,
        leadId: appointment.leadId,
        channel,
        provider: channel === "whatsapp" ? "whatsapp_business" : "outlook",
        subject: channel === "email" ? (appointment.listing?.title ?? null) : null,
      })
      .returning()
  )[0]!;

  const isValuation = appointment.type === "valuation";
  const place = addressOf(appointment.listing) || appointment.location || "";
  const when = (d: Date) => formatSlot(d, "en");
  const note = {
    booked: () => (isValuation ? `Booked a valuation visit at ${place} for ${when(appointment.startsAt)}.` : `Booked a viewing at ${place} for ${when(appointment.startsAt)} on the website.`),
    cancelled: () => `Cancelled the ${isValuation ? "valuation visit" : "viewing"} at ${place} (${when(appointment.startsAt)}) using their booking link.`,
    rescheduled: () => `Moved the ${isValuation ? "valuation visit" : "viewing"} at ${place} from ${when((action as { from: Date }).from)} to ${when(appointment.startsAt)} using their booking link.`,
  }[action.kind]();
  const soon = appointment.startsAt.getTime() - Date.now() < (action.kind === "cancelled" ? 48 : 24) * 3600 * 1000;
  // A seller's conversation stays in "Seller leads" whatever they do with the visit.
  const category: ConversationCategory = isValuation ? "valuation" : ({ booked: "booking", cancelled: "cancellation", rescheduled: "reschedule" }[action.kind] as ConversationCategory);
  const priority: Priority = soon || isValuation ? "high" : "normal";

  const [message] = await ctx.db
    .insert(messages)
    .values({ agencyId: ctx.agencyId, conversationId: conversation.id, direction: "inbound", authorType: "system", body: note, intent: category })
    .returning();
  await ctx.db
    .update(conversations)
    .set({
      category,
      priority,
      summary: isValuation
        ? { booked: "Booked a valuation visit.", cancelled: "Cancelled the valuation visit.", rescheduled: "Moved the valuation visit." }[action.kind]
        : {
        booked: "Booked a viewing on the website.",
        cancelled: "Cancelled their viewing via the booking link.",
        rescheduled: "Moved their viewing via the booking link.",
      }[action.kind],
      status: "open",
      unread: true,
      lastMessageAt: message!.sentAt,
      listingId: appointment.listingId ?? conversation.listingId,
      agentId: appointment.agentId,
    })
    .where(eq(conversations.id, conversation.id));

  const thread = await loadThread(ctx, conversation.id);
  const lang = toLang(contact.language);
  const name = contact.firstName ?? "the client";
  const confirmedDetails = [
    { label: detailLabels.when[lang], value: formatSlot(appointment.startsAt, lang) },
    { label: detailLabels.where[lang], value: appointment.location ?? place },
    { label: detailLabels.with[lang], value: appointment.agent?.name ?? "" },
  ];
  const changeLink = { url: `/a/${appointment.manageToken}`, label: linkLabels.change[lang] };

  let plan: DraftPlan | null;
  if (action.kind === "cancelled") {
    const planned = await planFor(ctx, thread, { category: "cancellation", priority, language: lang, summary: note, sentiment: "neutral", by: "rules" });
    // Nothing left to cancel: the client already did, and any other viewing they have stays.
    plan = planned && {
      ...planned,
      templateKey: "cancelled_by_client",
      purpose: "The client cancelled the viewing themselves through their booking link. Acknowledge it kindly in one sentence, and without pushing offer the times below in case they still want to come.",
      cancelAppointmentId: undefined,
      summary: `Offer ${name} new times after the cancellation`,
    };
  } else if (action.kind === "booked") {
    plan = {
      kind: "reply",
      purpose: isValuation
        ? "The owner just booked a free valuation visit at their home. Thank them and confirm it in one or two sentences; say the agent will look at the home and the market with them."
        : "The client just booked a viewing on the website. Thank them warmly and confirm it. Mention, if useful, one practical thing from the listing data (for example where to meet). Keep it short.",
      templateKey: isValuation ? "valuation_visit_confirmation" : "booking_confirmation",
      slots: [],
      details: confirmedDetails,
      link: changeLink,
      summary: isValuation ? `Confirm ${name}'s valuation visit` : `Confirm ${name}'s viewing`,
      address: place,
    };
  } else {
    plan = {
      kind: "reply",
      purpose: "The client moved their viewing to a new time themselves. Confirm the new time kindly in one or two sentences.",
      templateKey: "reschedule_confirmation",
      slots: [],
      details: confirmedDetails,
      link: changeLink,
      summary: `Confirm ${name}'s new viewing time`,
    };
  }
  const proposal = plan ? await propose(ctx, thread, plan, lang, note, options.useAi ?? true) : null;
  return { conversationId: conversation.id, proposalId: proposal?.id ?? null };
}

/**
 * After an owner verified their phone for a valuation: an inbox note on their
 * WhatsApp conversation, and a draft offering a free valuation visit with free
 * times of the agent. The estimate itself is added as a fixed line.
 */
export async function draftValuationFollowUp(ctx: ToolContext, valuationId: string, options: { useAi?: boolean } = {}) {
  const valuation = await ctx.db.query.valuations.findFirst({
    where: and(eq(schema.valuations.agencyId, ctx.agencyId), eq(schema.valuations.id, valuationId)),
  });
  if (!valuation?.contactId) return null;
  const channel = valuation.verificationMethod === "sms" ? "sms" : "whatsapp";

  let [conversation] = await ctx.db
    .select()
    .from(conversations)
    .where(and(eq(conversations.agencyId, ctx.agencyId), eq(conversations.contactId, valuation.contactId), eq(conversations.channel, channel)))
    .orderBy(desc(conversations.lastMessageAt))
    .limit(1);
  conversation ??= (
    await ctx.db
      .insert(conversations)
      .values({ agencyId: ctx.agencyId, contactId: valuation.contactId, leadId: valuation.leadId, channel, provider: channel === "sms" ? "sms" : "whatsapp_business" })
      .returning()
  )[0]!;

  const place = [[valuation.street, valuation.houseNumber].filter(Boolean).join(" "), valuation.city].join(", ");
  const euro = (n: number) => new Intl.NumberFormat("nl-BE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);
  const result = valuation.result;
  const note = result
    ? `Requested a home valuation for ${place}: estimate ${euro(result.low)} – ${euro(result.high)}.`
    : `Requested a home valuation for ${place}; not enough market data for an online estimate.`;
  const sellSoon = valuation.answers.plans === "sell_soon";

  const [message] = await ctx.db
    .insert(messages)
    .values({ agencyId: ctx.agencyId, conversationId: conversation.id, direction: "inbound", authorType: "system", body: note, intent: "valuation" })
    .returning();
  await ctx.db
    .update(conversations)
    .set({
      category: "valuation",
      priority: sellSoon ? "high" : "normal",
      summary: sellSoon ? "Owner wants to sell soon; valuation requested." : "Owner requested a valuation.",
      status: "open",
      unread: true,
      lastMessageAt: message!.sentAt,
      agentId: valuation.agentId,
      leadId: valuation.leadId,
    })
    .where(eq(conversations.id, conversation.id));

  const thread = await loadThread(ctx, conversation.id);
  const lang = toLang(valuation.language);
  const slots = valuation.agentId
    ? pickSpreadSlots((await runTool(availableSlots, ctx, { agentId: valuation.agentId, days: 10, minutes: 60 })).slots)
    : [];
  const plan: DraftPlan = {
    kind: "reply",
    purpose: `The owner of ${place} requested an online estimate of their home${sellSoon ? " and wants to sell soon" : ""}. Thank them, say briefly that an online estimate is indicative, and offer a free, no-obligation valuation visit by the agent at one of the times below. Do not mention any amount: the estimate is added after your text.`,
    templateKey: "valuation_follow_up",
    slots,
    details: result ? [{ label: detailLabels.estimate[lang], value: `${euro(result.low)} – ${euro(result.high)}` }] : [],
    link: { url: `/v/${valuation.token}`, label: linkLabels.report[lang] },
    summary: `Offer ${valuation.firstName ?? "the owner"} a free valuation visit`,
    address: place,
  };
  const proposal = await propose(ctx, thread, plan, lang, note, options.useAi ?? true);
  return { conversationId: conversation.id, proposalId: proposal.id };
}

/** Drafts a message suggesting listings to a known client, on their preferred channel. */
export async function draftRecommendation(
  ctx: ToolContext,
  contactId: string,
  suggestions: { id: string; label: string; reasons: string[] }[],
  basedOn: { street: string | null; houseNumber: string | null; city: string | null },
  options: { useAi?: boolean } = {},
) {
  const [contact] = await ctx.db.select().from(contacts).where(and(eq(contacts.agencyId, ctx.agencyId), eq(contacts.id, contactId)));
  if (!contact || suggestions.length === 0) return null;
  const channel = contact.whatsappOptIn && contact.phone ? "whatsapp" : "email";
  let [conversation] = await ctx.db
    .select()
    .from(conversations)
    .where(and(eq(conversations.agencyId, ctx.agencyId), eq(conversations.contactId, contactId), eq(conversations.channel, channel)))
    .orderBy(desc(conversations.lastMessageAt))
    .limit(1);
  conversation ??= (
    await ctx.db
      .insert(conversations)
      .values({ agencyId: ctx.agencyId, contactId, channel, provider: channel === "whatsapp" ? "whatsapp_business" : "outlook", subject: channel === "email" ? "Panden voor u" : null, status: "open", unread: false, lastMessageAt: new Date() })
      .returning()
  )[0]!;
  const thread = await loadThread(ctx, conversation.id);
  const lang = toLang(contact.language);
  const place = addressOf(basedOn as Thread["listing"]);
  const plan: DraftPlan = {
    kind: "recommendation",
    purpose: `Suggest a few properties of the agency to a client who earlier showed interest in ${place}. Mention briefly why they could fit (${suggestions.map((s) => `${s.label}: ${s.reasons.join(", ")}`).join("; ")}). Invite them to plan a viewing. Do not invent features.`,
    templateKey: "recommendation",
    slots: [],
    lines: suggestions.map((s) => `${s.label}: ${absoluteUrl(`/book/${s.id}`)}`),
    summary: `Suggest ${suggestions.length} ${suggestions.length === 1 ? "property" : "properties"} to ${contact.firstName ?? "the client"}`,
    address: place,
  };
  const proposal = await propose(ctx, thread, plan, lang, `Similar to ${place}.`, options.useAi ?? true);
  return { conversationId: conversation.id, proposalId: proposal.id };
}
