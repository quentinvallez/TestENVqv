import { and, asc, eq, gt, gte, inArray, lt, or, schema } from "@viewing/db";
import { z } from "zod";
import { conversationFor } from "../channels";
import { recordEvent } from "../events";
import { expandWindows } from "../planner/availability";
import { composeMessage, occupantLabels, occupantTemplates, signature, visitorLabel } from "../planner/language";
import { draftOccupantConflicts, messageOccupant, placeOf } from "../planner/occupants";
import { startOfZonedDay, zonedTime } from "../time";
import { defineTool, runTool, type ToolContext } from "../tool";
import { availableSlots } from "./booking";

const { appointments, contacts, conversations, leads, listingBlocks, listingOccupants, listings, listingWindows, messages } = schema;

const DAY = 24 * 3600 * 1000;
/** How far ahead the occupants see their viewings and the agent sees whether there is a common time. */
const HORIZON_DAYS = 60;

const accessMode = z.enum(["agent", "owner", "tenant"]);
const weeklyWindow = z
  .object({ weekday: z.number().int().min(0).max(6), startMinute: z.number().int().min(0).max(1440), endMinute: z.number().int().min(0).max(1440) })
  .refine((w) => w.endMinute > w.startMinute, "End must be after start");
const isoDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

async function getListing(ctx: ToolContext, listingId: string) {
  const [listing] = await ctx.db.select().from(listings).where(and(eq(listings.agencyId, ctx.agencyId), eq(listings.id, listingId)));
  if (!listing) throw new Error("Listing not found");
  return listing;
}

/** The occupant behind a private link, within this agency only. */
async function occupantByToken(ctx: ToolContext, token: string) {
  const occupant = await ctx.db.query.listingOccupants.findFirst({
    where: and(eq(listingOccupants.agencyId, ctx.agencyId), eq(listingOccupants.token, token)),
    with: { contact: true, listing: true },
  });
  if (!occupant) throw new Error("This link is no longer valid");
  return occupant;
}

async function windowsOf(ctx: ToolContext, listingId: string) {
  return ctx.db
    .select({ weekday: listingWindows.weekday, startMinute: listingWindows.startMinute, endMinute: listingWindows.endMinute })
    .from(listingWindows)
    .where(and(eq(listingWindows.agencyId, ctx.agencyId), eq(listingWindows.listingId, listingId)))
    .orderBy(asc(listingWindows.weekday), asc(listingWindows.startMinute));
}

async function blocksOf(ctx: ToolContext, listingId: string, from = new Date()) {
  return ctx.db
    .select({ id: listingBlocks.id, startsAt: listingBlocks.startsAt, endsAt: listingBlocks.endsAt, note: listingBlocks.note })
    .from(listingBlocks)
    .where(and(eq(listingBlocks.agencyId, ctx.agencyId), eq(listingBlocks.listingId, listingId), gt(listingBlocks.endsAt, from)))
    .orderBy(asc(listingBlocks.startsAt));
}

async function upcomingViewings(ctx: ToolContext, listingId: string, now = new Date()) {
  return ctx.db.query.appointments.findMany({
    where: and(
      eq(appointments.agencyId, ctx.agencyId),
      eq(appointments.listingId, listingId),
      eq(appointments.type, "viewing"),
      inArray(appointments.status, ["scheduled", "confirmed"]),
      gte(appointments.startsAt, now),
      lt(appointments.startsAt, new Date(now.getTime() + HORIZON_DAYS * DAY)),
    ),
    with: { contact: true, agent: true },
    orderBy: asc(appointments.startsAt),
  });
}

/** Booked viewings that fall outside the occupants' times or inside a period they're away. */
async function viewingsOutsideHome(ctx: ToolContext, listingId: string) {
  const viewings = await upcomingViewings(ctx, listingId);
  if (!viewings.length) return [];
  const now = new Date();
  const until = new Date(now.getTime() + (HORIZON_DAYS + 1) * DAY);
  const allowed = expandWindows(await windowsOf(ctx, listingId), startOfZonedDay(now), until);
  const blocks = await blocksOf(ctx, listingId, now);
  return viewings.filter(
    (v) =>
      !allowed.some((a) => a.start <= v.startsAt && a.end >= v.endsAt) ||
      blocks.some((b) => b.startsAt < v.endsAt && b.endsAt > v.startsAt),
  );
}

// ---------------------------------------------------------------- back office

export const setListingAccess = defineTool({
  name: "listings_set_access",
  description:
    "Say who opens the door for viewings of a listing: the agency (has the key), the owner or a tenant living there. For an occupied home only the times its occupants give can be booked, with the notice they need.",
  mutates: true,
  input: z.object({
    listingId: z.string(),
    access: accessMode,
    viewingNoticeHours: z.number().int().min(0).max(168).nullable().optional(),
  }),
  run: async (ctx, input) => {
    const listing = await getListing(ctx, input.listingId);
    await ctx.db
      .update(listings)
      .set({ access: input.access, ...(input.viewingNoticeHours !== undefined && { viewingNoticeHours: input.viewingNoticeHours }) })
      .where(and(eq(listings.agencyId, ctx.agencyId), eq(listings.id, listing.id)));
    await recordEvent(ctx, { type: "listing.access_changed", subjectType: "listing", subjectId: listing.id, data: { from: listing.access, to: input.access, viewingNoticeHours: input.viewingNoticeHours } });
    return { access: input.access };
  },
});

export const listListingOccupants = defineTool({
  name: "listings_get_occupants",
  description: "The owners and tenants of a listing with their private links, the times the home can be visited, periods they're away, and how many bookable times that leaves in the next 14 days.",
  mutates: false,
  input: z.object({ listingId: z.string() }),
  run: async (ctx, input) => {
    const listing = await getListing(ctx, input.listingId);
    const occupants = await ctx.db.query.listingOccupants.findMany({
      where: and(eq(listingOccupants.agencyId, ctx.agencyId), eq(listingOccupants.listingId, listing.id)),
      with: { contact: true },
      orderBy: asc(listingOccupants.createdAt),
    });
    const bookable = listing.status === "active" ? await runTool(availableSlots, ctx, { listingId: listing.id, days: 14 }) : null;
    return {
      access: listing.access,
      viewingNoticeHours: listing.viewingNoticeHours,
      occupants: occupants.map((o) => ({ id: o.id, role: o.role, alerts: o.alerts, link: `/s/${o.token}`, lastSeenAt: o.lastSeenAt, contact: o.contact })),
      windows: await windowsOf(ctx, listing.id),
      blocks: await blocksOf(ctx, listing.id),
      slotsNext14Days: bookable?.slots.length ?? null,
      awaitingOccupant: bookable?.awaitingOccupant ?? false,
    };
  },
});

export const addListingOccupant = defineTool({
  name: "listings_add_occupant",
  description:
    "Add the owner or tenant of a listing. They get a private link (no account) to give the times the home can be visited and to follow the viewings; an invitation with the link is drafted for approval.",
  mutates: true,
  input: z.object({
    listingId: z.string(),
    role: z.enum(["owner", "tenant"]),
    contact: z
      .object({
        firstName: z.string().trim().min(1).max(80),
        lastName: z.string().trim().max(80).optional(),
        email: z.string().trim().toLowerCase().email().optional(),
        phone: z.string().trim().max(40).optional(),
        language: z.enum(["nl", "fr", "en"]).optional(),
        whatsappOptIn: z.boolean().default(false),
      })
      .refine((c) => c.email || c.phone, "An email address or a phone number is needed"),
  }),
  run: async (ctx, input) => {
    const listing = await getListing(ctx, input.listingId);
    const c = input.contact;
    const [existing] = await ctx.db
      .select()
      .from(contacts)
      .where(and(eq(contacts.agencyId, ctx.agencyId), or(c.email ? eq(contacts.email, c.email) : undefined, c.phone ? eq(contacts.phone, c.phone) : undefined)));
    const values = {
      firstName: c.firstName,
      lastName: c.lastName ?? existing?.lastName ?? null,
      email: c.email ?? existing?.email ?? null,
      phone: c.phone ?? existing?.phone ?? null,
      language: c.language ?? existing?.language ?? null,
      whatsappOptIn: c.whatsappOptIn || (existing?.whatsappOptIn ?? false),
    };
    const [contact] = existing
      ? await ctx.db.update(contacts).set(values).where(eq(contacts.id, existing.id)).returning()
      : await ctx.db.insert(contacts).values({ ...values, agencyId: ctx.agencyId }).returning();
    await ctx.db
      .insert(listingOccupants)
      .values({ agencyId: ctx.agencyId, listingId: listing.id, contactId: contact!.id, role: input.role })
      .onConflictDoUpdate({ target: [listingOccupants.listingId, listingOccupants.contactId], set: { role: input.role } });
    const occupant = await ctx.db.query.listingOccupants.findFirst({
      where: and(eq(listingOccupants.agencyId, ctx.agencyId), eq(listingOccupants.listingId, listing.id), eq(listingOccupants.contactId, contact!.id)),
      with: { contact: true },
    });
    const { absoluteUrl } = await import("../planner/agent");
    const place = placeOf(listing);
    // The first message to the owner or tenant always waits for a human, like every first contact.
    const invite = await messageOccupant(ctx, occupant!, listing, {
      kind: "invite",
      agentId: listing.agentId,
      automatic: false,
      summary: `Send ${contact!.firstName} the link to give the times ${place || "the home"} can be visited`,
      body: (lang, agentName, agency, channel) =>
        composeMessage({
          lang,
          body: occupantTemplates.invite[lang]({ name: contact!.firstName ?? "", address: place, agentName }),
          link: { url: absoluteUrl(`/s/${occupant!.token}`), label: occupantLabels.page[lang] },
          signature: signature(lang, agentName, agency, channel),
        }),
      whatsappTemplate: (lang) => ({ name: "occupant_invite", language: lang, params: [contact!.firstName ?? "", place] }),
    });
    await recordEvent(ctx, { type: "listing.occupant_added", subjectType: "listing", subjectId: listing.id, data: { occupantId: occupant!.id, role: input.role, proposalId: invite.proposalId } });
    return { occupantId: occupant!.id, link: `/s/${occupant!.token}`, proposalId: invite.proposalId };
  },
});

export const updateListingOccupant = defineTool({
  name: "listings_update_occupant",
  description: "Turn an owner's or tenant's viewing alerts on or off, give them a new private link (the old one stops working), or remove them from the listing.",
  mutates: true,
  input: z.object({ occupantId: z.string(), alerts: z.boolean().optional(), newLink: z.boolean().optional(), remove: z.boolean().optional() }),
  run: async (ctx, input) => {
    const where = and(eq(listingOccupants.agencyId, ctx.agencyId), eq(listingOccupants.id, input.occupantId));
    const [occupant] = await ctx.db.select().from(listingOccupants).where(where);
    if (!occupant) throw new Error("Occupant not found");
    if (input.remove) {
      await ctx.db.delete(listingOccupants).where(where);
    } else {
      await ctx.db
        .update(listingOccupants)
        .set({ ...(input.alerts !== undefined && { alerts: input.alerts }), ...(input.newLink && { token: crypto.randomUUID() }) })
        .where(where);
    }
    await recordEvent(ctx, { type: "listing.occupant_updated", subjectType: "listing", subjectId: occupant.listingId, data: { ...input, occupantId: occupant.id } });
    return { updated: true };
  },
});

// ---------------------------------------------------------------- the occupant's own link

export const getOccupantPage = defineTool({
  name: "occupants_get_page",
  description: "What an owner or tenant sees through their private link: the home, its upcoming viewings (visitors by first name and initial only), and the times it can be visited.",
  mutates: false,
  input: z.object({ token: z.string(), markSeen: z.boolean().default(true).describe("False for the calendar feed, which phones fetch on their own") }),
  run: async (ctx, input) => {
    const occupant = await occupantByToken(ctx, input.token);
    const listing = occupant.listing;
    // Opening the link is the only thing recorded; it tells the agent the occupant saw it.
    if (input.markSeen) await ctx.db.update(listingOccupants).set({ lastSeenAt: new Date() }).where(eq(listingOccupants.id, occupant.id));
    const agent = listing.agentId ? await ctx.db.query.agents.findFirst({ where: and(eq(schema.agents.agencyId, ctx.agencyId), eq(schema.agents.id, listing.agentId)) }) : null;
    const lang = occupant.contact.language === "fr" || occupant.contact.language === "en" ? occupant.contact.language : "nl";
    const viewings = await upcomingViewings(ctx, listing.id);
    return {
      occupant: { role: occupant.role, firstName: occupant.contact.firstName, language: lang as "nl" | "fr" | "en", alerts: occupant.alerts },
      listing: { address: placeOf(listing), postcode: listing.postcode, access: listing.access, viewingNoticeHours: listing.viewingNoticeHours, status: listing.status, photo: listing.photos[0]?.url ?? null },
      agent: agent ? { name: agent.name, phone: agent.phone, email: agent.email } : null,
      windows: await windowsOf(ctx, listing.id),
      blocks: await blocksOf(ctx, listing.id),
      viewings: viewings.map((v) => ({
        id: v.id,
        startsAt: v.startsAt,
        endsAt: v.endsAt,
        visitor: visitorLabel(v.contact?.firstName, v.contact?.lastName, lang),
        agentName: v.agent?.name ?? null,
      })),
    };
  },
});

export const setOccupantAvailability = defineTool({
  name: "occupants_set_availability",
  description:
    "Through their private link, the owner or tenant replaces the weekly times the home can be visited, the periods they're away (whole days) and the notice they need. Booked viewings that no longer fit are not cancelled: the agent gets a draft asking those visitors to move.",
  mutates: true,
  input: z.object({
    token: z.string(),
    windows: z.array(weeklyWindow).max(28),
    away: z.array(z.object({ from: isoDay, to: isoDay, note: z.string().trim().max(200).optional() }).refine((a) => a.to >= a.from, "The end date must be after the start")).max(20),
    viewingNoticeHours: z.number().int().min(0).max(168).nullable().optional(),
  }),
  run: async (ctx, input) => {
    const occupant = await occupantByToken(ctx, input.token);
    const listing = occupant.listing;
    const day = (iso: string) => {
      const [year, month, d] = iso.split("-").map(Number);
      return zonedTime({ year: year!, month: month!, day: d! });
    };
    await ctx.db.transaction(async (tx) => {
      await tx.delete(listingWindows).where(and(eq(listingWindows.agencyId, ctx.agencyId), eq(listingWindows.listingId, listing.id)));
      if (input.windows.length) await tx.insert(listingWindows).values(input.windows.map((w) => ({ ...w, agencyId: ctx.agencyId, listingId: listing.id })));
      await tx.delete(listingBlocks).where(and(eq(listingBlocks.agencyId, ctx.agencyId), eq(listingBlocks.listingId, listing.id)));
      if (input.away.length) {
        await tx.insert(listingBlocks).values(
          input.away.map((a) => ({ agencyId: ctx.agencyId, listingId: listing.id, startsAt: day(a.from), endsAt: startOfZonedDay(day(a.to), 1), note: a.note ?? null })),
        );
      }
      if (input.viewingNoticeHours !== undefined) {
        await tx.update(listings).set({ viewingNoticeHours: input.viewingNoticeHours }).where(and(eq(listings.agencyId, ctx.agencyId), eq(listings.id, listing.id)));
      }
    });
    await recordEvent(ctx, {
      type: "listing.availability_changed",
      subjectType: "listing",
      subjectId: listing.id,
      data: { occupantId: occupant.id, windows: input.windows.length, away: input.away.length, viewingNoticeHours: input.viewingNoticeHours },
    });
    if (listing.access === "agent") return { conflicts: 0 };
    const outside = await viewingsOutsideHome(ctx, listing.id);
    const who = occupant.contact.firstName ?? (occupant.role === "tenant" ? "the tenant" : "the owner");
    const drafted = await draftOccupantConflicts(ctx, listing, outside.map((v) => v.id), `${who} changed the times the home can be visited.`);
    return { conflicts: drafted.length };
  },
});

export const reportOccupantProblem = defineTool({
  name: "occupants_report_problem",
  description:
    "Through their private link, the owner or tenant says they can't receive a booked viewing. The viewing is not cancelled: the agent gets an urgent draft asking the visitor to move.",
  mutates: true,
  input: z.object({ token: z.string(), appointmentId: z.string(), note: z.string().trim().max(500).optional() }),
  run: async (ctx, input) => {
    const occupant = await occupantByToken(ctx, input.token);
    const [apt] = await ctx.db
      .select()
      .from(appointments)
      .where(and(eq(appointments.agencyId, ctx.agencyId), eq(appointments.id, input.appointmentId), eq(appointments.listingId, occupant.listingId)));
    if (!apt) throw new Error("Viewing not found");
    const who = occupant.contact.firstName ?? (occupant.role === "tenant" ? "the tenant" : "the owner");
    const drafted = await draftOccupantConflicts(ctx, occupant.listing, [apt.id], input.note ? `${who} wrote: "${input.note}"` : `${who} reported a problem with this viewing.`, true);
    await recordEvent(ctx, { type: "listing.occupant_problem", subjectType: "appointment", subjectId: apt.id, data: { occupantId: occupant.id, note: input.note ?? null } });
    return { drafted: drafted.length };
  },
});

// ---------------------------------------------------------------- visitors without a time

export const requestViewing = defineTool({
  name: "leads_request_viewing",
  description:
    "A visitor asks for a viewing of a listing that has no bookable times yet, e.g. while the owner hasn't given any. Creates the contact and lead and puts the request in the inbox for the agent.",
  mutates: true,
  input: z.object({
    listingId: z.string(),
    contact: z.object({
      firstName: z.string().trim().min(1).max(80),
      lastName: z.string().trim().max(80).optional(),
      email: z.string().trim().toLowerCase().email(),
      phone: z.string().trim().max(40).optional(),
      language: z.enum(["nl", "fr", "en", "de"]).optional(),
      whatsappOptIn: z.boolean().default(false),
    }),
    message: z.string().trim().max(2000).optional(),
    source: z.enum(["website", "manual"]).default("website"),
  }),
  run: async (ctx, input) => {
    const listing = await getListing(ctx, input.listingId);
    const c = input.contact;
    const [existing] = await ctx.db.select().from(contacts).where(and(eq(contacts.agencyId, ctx.agencyId), eq(contacts.email, c.email)));
    const values = {
      firstName: c.firstName,
      lastName: c.lastName ?? existing?.lastName ?? null,
      email: c.email,
      phone: c.phone ?? existing?.phone ?? null,
      language: c.language ?? existing?.language ?? null,
      whatsappOptIn: c.whatsappOptIn || (existing?.whatsappOptIn ?? false),
    };
    const [contact] = existing
      ? await ctx.db.update(contacts).set(values).where(eq(contacts.id, existing.id)).returning()
      : await ctx.db.insert(contacts).values({ ...values, agencyId: ctx.agencyId }).returning();
    const [lead] = await ctx.db
      .insert(leads)
      .values({ agencyId: ctx.agencyId, contactId: contact!.id, listingId: listing.id, agentId: listing.agentId, source: input.source, stage: "new", message: input.message })
      .returning();
    const conversation = await conversationFor(ctx, { contactId: contact!.id, listingId: listing.id, agentId: listing.agentId, leadId: lead!.id, subject: listing.title });
    const waiting = listing.access !== "agent";
    const note = `Asked for a viewing of ${placeOf(listing) || listing.reference} on the website${waiting ? " while the occupants haven't given visiting times yet" : " when no time was free"}.${input.message ? `\n\n"${input.message}"` : ""}`;
    const [message] = await ctx.db
      .insert(messages)
      .values({ agencyId: ctx.agencyId, conversationId: conversation.id, direction: "inbound", authorType: "system", body: note, intent: "viewing_request" })
      .returning();
    await ctx.db
      .update(conversations)
      .set({ category: "viewing_request", priority: "high", summary: "Asked for a viewing; no bookable time yet.", status: "open", unread: true, lastMessageAt: message!.sentAt, leadId: lead!.id })
      .where(eq(conversations.id, conversation.id));
    await recordEvent(ctx, { type: "lead.viewing_requested", subjectType: "lead", subjectId: lead!.id, data: { listingId: listing.id, awaitingOccupant: waiting } });
    return { leadId: lead!.id, conversationId: conversation.id };
  },
});

