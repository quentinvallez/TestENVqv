import { and, asc, eq, gt, inArray, isNotNull, schema } from "@viewing/db";
import { conversationFor } from "../channels";
import { recordEvent } from "../events";
import type { ToolContext } from "../tool";
import { similarListings } from "../tools/recommendations";
import { composeMessage, formatSlot, offMarketClosing, offMarketSubject, offMarketTemplates, signature, toLang } from "./language";

const { appointments, organization, proposals } = schema;

export type OffMarketReason = keyof typeof offMarketTemplates;

const reasonLabel: Record<OffMarketReason, string> = { under_offer: "under option", sold: "sold", rented: "rented out", unavailable: "taken off the website" };

/**
 * A listing with planned viewings went under option, was sold or rented, or left the site: each
 * client with an upcoming viewing gets a draft saying the viewing is off, with similar listings when
 * there are any. Approving the draft sends it and cancels the viewing; nothing goes out before that.
 */
export async function draftOffMarketNotices(ctx: ToolContext, listingId: string, reason: OffMarketReason, now = new Date()) {
  const upcoming = await ctx.db.query.appointments.findMany({
    where: and(
      eq(appointments.agencyId, ctx.agencyId),
      eq(appointments.listingId, listingId),
      eq(appointments.type, "viewing"),
      inArray(appointments.status, ["scheduled", "confirmed"]),
      isNotNull(appointments.contactId),
      gt(appointments.startsAt, now),
    ),
    with: { contact: true, listing: true, agent: true },
    orderBy: asc(appointments.startsAt),
  });
  if (!upcoming.length) return 0;

  // One notice per viewing, even when the status changes back and forth.
  const done = new Set(
    (
      await ctx.db
        .select({ subjectId: proposals.subjectId })
        .from(proposals)
        .where(and(eq(proposals.agencyId, ctx.agencyId), eq(proposals.kind, "off_market"), inArray(proposals.subjectId, upcoming.map((a) => a.id))))
    ).map((p) => p.subjectId),
  );
  // Reminders still waiting for approval are for a viewing that won't happen.
  await ctx.db
    .update(proposals)
    .set({ status: "rejected", result: { withdrawn: `The listing is ${reasonLabel[reason]}.` } })
    .where(
      and(
        eq(proposals.agencyId, ctx.agencyId),
        eq(proposals.status, "pending"),
        eq(proposals.kind, "reminder"),
        inArray(proposals.subjectId, upcoming.map((a) => a.id)),
      ),
    );

  const [agency] = await ctx.db.select({ name: organization.name }).from(organization).where(eq(organization.id, ctx.agencyId));
  const similar = await similarListings.run(ctx, { listingId, limit: 3 });
  let drafted = 0;
  for (const apt of upcoming) {
    if (!apt.contact || done.has(apt.id)) continue;
    const lang = toLang(apt.contact.language);
    const listing = apt.listing;
    const address = listing ? [[listing.street, listing.houseNumber].filter(Boolean).join(" "), listing.city].filter(Boolean).join(", ") : "";
    const agentName = apt.agent?.name ?? agency?.name ?? "";
    const conversation = await conversationFor(ctx, { contactId: apt.contact.id, listingId, agentId: apt.agentId, leadId: apt.leadId, subject: offMarketSubject[lang] });
    const lines = similar.map((l) => {
      const place = [[l.street, l.houseNumber].filter(Boolean).join(" "), l.city].filter(Boolean).join(", ") || l.title;
      const price = l.price ? ` (${new Intl.NumberFormat("nl-BE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(l.price)}${l.transaction === "rent" ? "/mnd" : ""})` : "";
      return `${place}${price}${l.websiteUrl ? ` ${l.websiteUrl}` : ""}`;
    });
    const when = formatSlot(apt.startsAt, lang);
    const body = composeMessage({
      lang,
      body: `${offMarketTemplates[reason][lang]({ name: apt.contact.firstName ?? "", address: address || { nl: "Het pand", fr: "Le bien", en: "The property" }[lang], agentName, other: when })}\n\n${(lines.length ? offMarketClosing.similar : offMarketClosing.none)[lang]}`,
      lines,
      signature: signature(lang, agentName, agency?.name ?? "", conversation.channel),
    });
    const [proposal] = await ctx.db
      .insert(proposals)
      .values({
        agencyId: ctx.agencyId,
        agentName: "planner",
        conversationId: conversation.id,
        kind: "off_market",
        generatedBy: "template",
        toolName: "conversations_reply",
        input: {
          conversationId: conversation.id,
          body,
          subject: offMarketSubject[lang],
          kind: "off_market",
          cancelAppointmentId: apt.id,
          cancelReason: `Listing ${reasonLabel[reason]}`,
          reopenLead: false,
          whatsappTemplate: { name: "viewing_cancelled", language: lang, params: [apt.contact.firstName ?? "", address, when] },
          metadata: { appointmentId: apt.id, listingStatus: reason },
        },
        summary: `Tell ${apt.contact.firstName ?? "the client"} the viewing ${formatSlot(apt.startsAt, "en")} is off: ${address || "the listing"} is ${reasonLabel[reason]}`,
        reasoning: `The listing is ${reasonLabel[reason]}. Approving sends this message and cancels the viewing${similar.length ? `; it suggests ${similar.length} similar ${similar.length === 1 ? "listing" : "listings"}` : ""}.`,
        subjectType: "appointment",
        subjectId: apt.id,
      })
      .returning({ id: proposals.id });
    await recordEvent(ctx, { type: "planner.off_market_drafted", subjectType: "appointment", subjectId: apt.id, data: { proposalId: proposal!.id, listingId, reason } });
    drafted++;
  }
  return drafted;
}
