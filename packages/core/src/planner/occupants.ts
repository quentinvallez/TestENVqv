import { and, asc, eq, gt, inArray, schema } from "@viewing/db";
import type { WhatsAppTemplate } from "../channels";
import { conversationFor, sendMessage } from "../channels";
import { recordEvent } from "../events";
import type { ToolContext } from "../tool";
import {
  composeMessage,
  detailLabels,
  formatSlot,
  linkLabels,
  occupantConflictSubject,
  occupantConflictTemplate,
  occupantLabels,
  occupantSubject,
  occupantTemplates,
  signature,
  toLang,
  visitorLabel,
} from "./language";

/*
 * The owner or tenant of a listing hears about every viewing of their home:
 * booked, moved or cancelled, plus the evening before. These are fixed templates
 * without AI text, so they go out on their own unless the agency asks to approve
 * them (autonomy "occupant_alerts" = "suggest"), in which case they wait as drafts.
 */

const { agencySettings, appointments, conversations, listingOccupants, messages, organization, proposals } = schema;

type Listing = typeof schema.listings.$inferSelect;
type Occupant = typeof listingOccupants.$inferSelect & { contact: typeof schema.contacts.$inferSelect };

export const placeOf = (listing: Pick<Listing, "street" | "houseNumber" | "city">) =>
  [[listing.street, listing.houseNumber].filter(Boolean).join(" "), listing.city].filter(Boolean).join(", ");

export async function occupantAlertsAutomatic(ctx: ToolContext) {
  const [row] = await ctx.db.select({ autonomy: agencySettings.autonomy }).from(agencySettings).where(eq(agencySettings.agencyId, ctx.agencyId));
  return row?.autonomy.occupant_alerts !== "suggest";
}

async function agencyName(ctx: ToolContext) {
  const [agency] = await ctx.db.select({ name: organization.name }).from(organization).where(eq(organization.id, ctx.agencyId));
  return agency?.name ?? "";
}

export async function occupantsWithAlerts(ctx: ToolContext, listingId: string): Promise<Occupant[]> {
  return ctx.db.query.listingOccupants.findMany({
    where: and(eq(listingOccupants.agencyId, ctx.agencyId), eq(listingOccupants.listingId, listingId), eq(listingOccupants.alerts, true)),
    with: { contact: true },
  });
}

/** Sends a message to an occupant, or saves it as a draft when the agency approves these first. */
export async function messageOccupant(
  ctx: ToolContext,
  occupant: Occupant,
  listing: Listing,
  message: {
    kind: keyof typeof occupantSubject;
    agentId: string | null;
    body: (lang: ReturnType<typeof toLang>, agentName: string, agency: string, channel: string) => string;
    whatsappTemplate: (lang: ReturnType<typeof toLang>) => WhatsAppTemplate;
    summary: string;
    metadata?: Record<string, unknown>;
    automatic: boolean;
  },
) {
  const lang = toLang(occupant.contact.language);
  const agency = await agencyName(ctx);
  const agent = message.agentId ? await ctx.db.query.agents.findFirst({ where: and(eq(schema.agents.agencyId, ctx.agencyId), eq(schema.agents.id, message.agentId)) }) : null;
  const subject = occupantSubject[message.kind][lang];
  const conversation = await conversationFor(ctx, { contactId: occupant.contactId, listingId: listing.id, agentId: message.agentId, subject });
  const body = message.body(lang, agent?.name ?? agency, agency, conversation.channel);
  const input = { conversationId: conversation.id, body, subject, kind: `occupant_${message.kind}`, whatsappTemplate: message.whatsappTemplate(lang), metadata: { ...message.metadata, occupantId: occupant.id } };
  if (message.automatic) {
    const sent = await sendMessage(ctx, input);
    return { sent: sent.delivery, messageId: sent.messageId, proposalId: null };
  }
  const [proposal] = await ctx.db
    .insert(proposals)
    .values({
      agencyId: ctx.agencyId,
      agentName: "planner",
      conversationId: conversation.id,
      kind: `occupant_${message.kind}`,
      generatedBy: "template",
      toolName: "conversations_reply",
      input,
      summary: message.summary,
      reasoning: "Message to the owner or tenant. Settings → Automations decides whether these go out on their own.",
      subjectType: "listing",
      subjectId: listing.id,
    })
    .returning({ id: proposals.id });
  return { sent: null, messageId: null, proposalId: proposal!.id };
}

export type OccupantAlert = { kind: "booked" | "cancelled" } | { kind: "rescheduled"; from: Date };

/** Tells the listing's occupants about a booked, moved or cancelled viewing. Never fails the booking itself. */
export async function alertOccupants(ctx: ToolContext, appointmentId: string, action: OccupantAlert) {
  try {
    const apt = await ctx.db.query.appointments.findFirst({
      where: and(eq(appointments.agencyId, ctx.agencyId), eq(appointments.id, appointmentId)),
      with: { listing: true, contact: true },
    });
    if (!apt?.listing || apt.type !== "viewing" || apt.startsAt <= new Date()) return 0;
    const occupants = await occupantsWithAlerts(ctx, apt.listing.id);
    if (!occupants.length) return 0;
    const { absoluteUrl } = await import("./agent");
    const automatic = await occupantAlertsAutomatic(ctx);
    const listing = apt.listing;
    const place = placeOf(listing);
    for (const occupant of occupants) {
      const name = occupant.contact.firstName ?? "";
      await messageOccupant(ctx, occupant, listing, {
        kind: action.kind,
        agentId: apt.agentId,
        automatic,
        summary: `Tell ${name || "the owner"} a viewing ${{ booked: "was booked", cancelled: "was cancelled", rescheduled: "moved" }[action.kind]}: ${formatSlot(apt.startsAt, "en")}`,
        metadata: { appointmentId: apt.id },
        body: (lang, agentName, agency, channel) => {
          const visitor = visitorLabel(apt.contact?.firstName, apt.contact?.lastName, lang);
          const other = formatSlot(action.kind === "rescheduled" ? action.from : apt.startsAt, lang);
          return composeMessage({
            lang,
            body: occupantTemplates[action.kind][lang]({ name, address: place, agentName, other }),
            details:
              action.kind === "cancelled"
                ? []
                : [
                    ...(action.kind === "rescheduled" ? [{ label: occupantLabels.was[lang], value: other }] : []),
                    { label: detailLabels.when[lang], value: formatSlot(apt.startsAt, lang) },
                    { label: occupantLabels.visitor[lang], value: visitor },
                    { label: detailLabels.with[lang], value: agentName },
                  ],
            link: { url: absoluteUrl(`/s/${occupant.token}`), label: occupantLabels.page[lang] },
            signature: signature(lang, agentName, agency, channel),
          });
        },
        whatsappTemplate: (lang) => {
          const when = formatSlot(apt.startsAt, lang);
          if (action.kind === "booked") return { name: "occupant_viewing_booked", language: lang, params: [name, place, when, visitorLabel(apt.contact?.firstName, apt.contact?.lastName, lang)] };
          if (action.kind === "rescheduled") return { name: "occupant_viewing_moved", language: lang, params: [name, place, formatSlot(action.from, lang), when] };
          return { name: "occupant_viewing_cancelled", language: lang, params: [name, place, when] };
        },
      });
    }
    await recordEvent(ctx, { type: "listing.occupants_alerted", subjectType: "appointment", subjectId: apt.id, data: { kind: action.kind, occupants: occupants.length, automatic } });
    return occupants.length;
  } catch (error) {
    console.error("Occupant alert failed", error);
    return 0;
  }
}

/**
 * The occupants can't receive visitors at a booked viewing any more (they changed
 * their times, or reported a problem). Nothing is cancelled: the visitor's
 * conversation gets a note and a draft with new times for the agent to approve.
 */
export async function draftOccupantConflicts(ctx: ToolContext, listing: Listing, appointmentIds: string[], reason: string, urgent = false) {
  if (!appointmentIds.length) return [];
  const upcoming = await ctx.db.query.appointments.findMany({
    where: and(
      eq(appointments.agencyId, ctx.agencyId),
      eq(appointments.listingId, listing.id),
      inArray(appointments.id, appointmentIds),
      inArray(appointments.status, ["scheduled", "confirmed"]),
      gt(appointments.startsAt, new Date()),
    ),
    with: { contact: true, agent: true },
    orderBy: asc(appointments.startsAt),
  });
  const { absoluteUrl, pickSpreadSlots } = await import("./agent");
  const { availableSlots } = await import("../tools/booking");
  const { runTool } = await import("../tool");
  const agency = await agencyName(ctx);
  const place = placeOf(listing);
  const drafted: string[] = [];
  for (const apt of upcoming) {
    if (!apt.contact) continue;
    const lang = toLang(apt.contact.language);
    const when = formatSlot(apt.startsAt, lang);
    const conversation = await conversationFor(ctx, { contactId: apt.contact.id, listingId: listing.id, agentId: apt.agentId, leadId: apt.leadId, subject: occupantConflictSubject[lang] });
    const note = `The ${listing.access === "tenant" ? "tenant" : "owner"} can't receive visitors at the viewing on ${formatSlot(apt.startsAt, "en")}: ${reason}`;
    const [message] = await ctx.db
      .insert(messages)
      .values({ agencyId: ctx.agencyId, conversationId: conversation.id, direction: "inbound", authorType: "system", body: note, intent: "reschedule" })
      .returning();
    const soon = apt.startsAt.getTime() - Date.now() < 24 * 3600 * 1000;
    await ctx.db
      .update(conversations)
      .set({ category: "reschedule", priority: urgent || soon ? "high" : "normal", summary: "The occupants can't receive visitors at this viewing.", status: "open", unread: true, lastMessageAt: message!.sentAt, listingId: listing.id })
      .where(eq(conversations.id, conversation.id));

    const { slots } = await runTool(availableSlots, ctx, { listingId: listing.id, agentId: apt.agentId, days: 14, excludeAppointmentId: apt.id });
    const agentName = apt.agent?.name ?? agency;
    const body = composeMessage({
      lang,
      body: occupantConflictTemplate[lang]({ name: apt.contact.firstName ?? "", address: place, agentName, other: when }),
      slots: pickSpreadSlots(slots),
      link: { url: absoluteUrl(`/a/${apt.manageToken}?change=1`), label: linkLabels.change[lang] },
      signature: signature(lang, agentName, agency, conversation.channel),
    });
    await ctx.db
      .update(proposals)
      .set({ status: "rejected", result: { superseded: true } })
      .where(and(eq(proposals.agencyId, ctx.agencyId), eq(proposals.conversationId, conversation.id), eq(proposals.status, "pending")));
    const [proposal] = await ctx.db
      .insert(proposals)
      .values({
        agencyId: ctx.agencyId,
        agentName: "planner",
        conversationId: conversation.id,
        kind: "occupant_conflict",
        generatedBy: "template",
        toolName: "conversations_reply",
        input: {
          conversationId: conversation.id,
          body,
          subject: occupantConflictSubject[lang],
          kind: "reschedule",
          whatsappTemplate: { name: "viewing_move_request", language: lang, params: [apt.contact.firstName ?? "", place, when] },
          metadata: { appointmentId: apt.id },
        },
        summary: `Ask ${apt.contact.firstName ?? "the client"} to move the viewing ${formatSlot(apt.startsAt, "en")}: the occupants can't receive them`,
        reasoning: `${note} The viewing stays booked until the client picks another time or you cancel it.`,
        subjectType: "appointment",
        subjectId: apt.id,
      })
      .returning({ id: proposals.id });
    await recordEvent(ctx, { type: "planner.occupant_conflict_drafted", subjectType: "appointment", subjectId: apt.id, data: { proposalId: proposal!.id, urgent } });
    drafted.push(proposal!.id);
  }
  return drafted;
}
