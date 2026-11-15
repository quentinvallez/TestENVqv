import { and, asc, eq, gt, inArray, lt, ne, schema, sql } from "@viewing/db";
import { z } from "zod";
import { syncAppointmentToCalendar, externalBusy, type CalendarEvent } from "../calendar";
import { recordEvent } from "../events";
import { computeSlots, expandWindows, openHouseSlots, type Interval, type OpenHouseSlot } from "../planner/availability";
import { qualify } from "../planner/qualification";
import { startOfZonedDay } from "../time";
import { defineTool, type ToolContext } from "../tool";
import { alertOccupants } from "../planner/occupants";
import { alertAgent } from "../planner/agent-alerts";

const { agents, appointments, availabilityRules, contacts, leads, listingBlocks, listings, listingWindows, openHouses } = schema;

const MINUTE = 60_000;
export const VALUATION_MINUTES = 60;
const BOOKING_HORIZON_DAYS = 21;

type Agent = typeof agents.$inferSelect;
type Listing = typeof listings.$inferSelect;

/** The agent responsible for a listing: its own agent, else someone in its office, else anyone active. */
export async function resolveAgentForListing(ctx: ToolContext, listing: Listing): Promise<Agent> {
  const candidates = await ctx.db
    .select()
    .from(agents)
    .where(and(eq(agents.agencyId, ctx.agencyId), eq(agents.active, true)))
    .orderBy(asc(agents.createdAt));
  const agent =
    candidates.find((a) => a.id === listing.agentId) ??
    candidates.find((a) => listing.officeId && a.officeId === listing.officeId) ??
    candidates[0];
  if (!agent) throw new Error("This agency has no active agents");
  return agent;
}

export async function activeAgent(ctx: ToolContext, agentId: string) {
  const [agent] = await ctx.db
    .select()
    .from(agents)
    .where(and(eq(agents.agencyId, ctx.agencyId), eq(agents.id, agentId), eq(agents.active, true)));
  return agent;
}

async function getListing(ctx: ToolContext, listingId: string) {
  const [listing] = await ctx.db
    .select()
    .from(listings)
    .where(and(eq(listings.agencyId, ctx.agencyId), eq(listings.id, listingId)));
  if (!listing) throw new Error("Listing not found");
  return listing;
}

/** Usual minimum time between booking and the start of a viewing. */
const MIN_NOTICE_MINUTES = 120;

/**
 * What the home allows: nothing to add when the agency has the key, else only the
 * times its occupants gave, minus the periods they're away, with their notice.
 */
export async function homeConstraints(ctx: ToolContext, listing: Listing, from: Date, to: Date) {
  if (listing.access === "agent") return null;
  const windows = await ctx.db
    .select({ weekday: listingWindows.weekday, startMinute: listingWindows.startMinute, endMinute: listingWindows.endMinute })
    .from(listingWindows)
    .where(and(eq(listingWindows.agencyId, ctx.agencyId), eq(listingWindows.listingId, listing.id)));
  const blocks = await ctx.db
    .select({ start: listingBlocks.startsAt, end: listingBlocks.endsAt })
    .from(listingBlocks)
    .where(and(eq(listingBlocks.agencyId, ctx.agencyId), eq(listingBlocks.listingId, listing.id), lt(listingBlocks.startsAt, to), gt(listingBlocks.endsAt, from)));
  return {
    windows: windows.length,
    allowed: expandWindows(windows, from, to),
    blocks,
    noticeMinutes: Math.max(MIN_NOTICE_MINUTES, (listing.viewingNoticeHours ?? 0) * 60),
  };
}

type SlotOptions = {
  excludeAppointmentId?: string;
  slotMinutes?: number;
  /** The listing to view: other viewings there need no travel buffer, and an occupied home limits the times. */
  listing?: Listing | null;
};

/** Free slots for an agent between two instants, against their appointments and connected calendars, and the home's own times for a viewing. */
export async function agentSlots(ctx: ToolContext, agent: Agent, from: Date, to: Date, options: SlotOptions = {}): Promise<Interval[]> {
  const { excludeAppointmentId, slotMinutes = agent.slotMinutes, listing } = options;
  const margin = agent.bufferMinutes * MINUTE;
  // Sequential on purpose: this often runs inside a transaction, which is a single connection.
  const rules = await ctx.db
    .select()
    .from(availabilityRules)
    .where(and(eq(availabilityRules.agencyId, ctx.agencyId), eq(availabilityRules.agentId, agent.id)));
  const booked = await ctx.db
    .select({ start: appointments.startsAt, end: appointments.endsAt, listingId: appointments.listingId, type: appointments.type })
    .from(appointments)
    .where(
      and(
        eq(appointments.agencyId, ctx.agencyId),
        eq(appointments.agentId, agent.id),
        inArray(appointments.status, ["scheduled", "confirmed"]),
        lt(appointments.startsAt, new Date(to.getTime() + margin)),
        gt(appointments.endsAt, new Date(from.getTime() - margin)),
        excludeAppointmentId ? ne(appointments.id, excludeAppointmentId) : undefined,
      ),
    );
  // The agent's open houses take the whole block, wherever they are.
  const shows = await ctx.db
    .select({ start: openHouses.startsAt, end: openHouses.endsAt, listingId: openHouses.listingId })
    .from(openHouses)
    .where(
      and(
        eq(openHouses.agencyId, ctx.agencyId),
        eq(openHouses.agentId, agent.id),
        eq(openHouses.status, "planned"),
        lt(openHouses.startsAt, new Date(to.getTime() + margin)),
        gt(openHouses.endsAt, new Date(from.getTime() - margin)),
      ),
    );
  const external = await externalBusy(ctx, agent.id, from, to);
  const home = listing ? await homeConstraints(ctx, listing, from, to) : null;
  // Viewings at the same house go back to back: the agent is already there.
  const sameHouse = (b: { listingId: string | null; type?: string }) => Boolean(listing && b.listingId === listing.id && (b.type ?? "viewing") === "viewing");
  return computeSlots({
    workingHours: rules,
    busy: [...booked.filter((b) => !sameHouse(b)), ...shows.filter((b) => !sameHouse(b)), ...external],
    busyNoBuffer: [...booked.filter(sameHouse), ...shows.filter(sameHouse), ...(home?.blocks ?? [])],
    allowed: home?.allowed,
    from,
    to,
    slotMinutes,
    bufferMinutes: agent.bufferMinutes,
    minNoticeMinutes: home?.noticeMinutes ?? MIN_NOTICE_MINUTES,
  });
}

/** Open house time notice: visitors can sign up until shortly before. */
const OPEN_HOUSE_NOTICE_MINUTES = 30;

export type ViewingSlot = Interval & { openHouseId?: string; spotsLeft?: number };

/**
 * The listing's planned open houses between two instants, with the time slots
 * that still have room, and whether one of them is exclusive: until an
 * exclusive open house is over, the listing offers no other times.
 */
export async function listingOpenHouses(ctx: ToolContext, listing: Listing, from: Date, to: Date, excludeAppointmentId?: string) {
  const now = new Date();
  const planned = await ctx.db
    .select()
    .from(openHouses)
    .where(and(eq(openHouses.agencyId, ctx.agencyId), eq(openHouses.listingId, listing.id), eq(openHouses.status, "planned"), gt(openHouses.endsAt, now)))
    .orderBy(asc(openHouses.startsAt));
  const exclusive = planned.some((o) => o.exclusive);
  const booked = planned.length
    ? await ctx.db
        .select({ openHouseId: appointments.openHouseId, startsAt: appointments.startsAt })
        .from(appointments)
        .where(
          and(
            eq(appointments.agencyId, ctx.agencyId),
            inArray(appointments.openHouseId, planned.map((o) => o.id)),
            inArray(appointments.status, ["scheduled", "confirmed"]),
            excludeAppointmentId ? ne(appointments.id, excludeAppointmentId) : undefined,
          ),
        )
    : [];
  const bookedAt = (o: { id: string }) => booked.filter((b) => b.openHouseId === o.id).map((b) => b.startsAt);
  // An exclusive open house is offered even beyond the range asked for: it is the listing's only way in.
  const inRange = planned.filter((o) => o.endsAt > from && (o.startsAt < to || o.exclusive));
  const slots: OpenHouseSlot[] = inRange.flatMap((o) =>
    openHouseSlots(o, bookedAt(o), { now, minNoticeMinutes: OPEN_HOUSE_NOTICE_MINUTES }).filter((slot) => slot.end > from && (o.exclusive || slot.start < to)),
  );
  // For the visitor's banner: every upcoming open house and how many places are left.
  const upcoming = planned.map((o) => ({
    id: o.id,
    startsAt: o.startsAt,
    endsAt: o.endsAt,
    placesLeft: openHouseSlots(o, bookedAt(o), { now, minNoticeMinutes: OPEN_HOUSE_NOTICE_MINUTES }).reduce((sum, slot) => sum + slot.spotsLeft, 0),
  }));
  return { planned: inRange, exclusive, slots, upcoming };
}

/** Bookable times to view a listing: its open house slots, plus the agent's own free slots unless an open house is exclusive. */
export async function viewingSlots(ctx: ToolContext, agent: Agent, listing: Listing, from: Date, to: Date, options: { excludeAppointmentId?: string; slotMinutes?: number } = {}): Promise<ViewingSlot[]> {
  const shows = await listingOpenHouses(ctx, listing, from, to, options.excludeAppointmentId);
  const own = shows.exclusive ? [] : await agentSlots(ctx, agent, from, to, { ...options, listing });
  return [...shows.slots, ...own].sort((a, b) => a.start.getTime() - b.start.getTime());
}

/**
 * For a time an agent agreed on the phone outside the offered slots: the agent
 * must have nothing else then (with the travel buffer), and an occupied home
 * must allow it. Working hours don't apply; the agent chose the time.
 */
async function assertFreeAt(ctx: ToolContext, agent: Agent, listing: Listing, start: Date, end: Date) {
  if (start.getTime() < Date.now()) throw new Error("This time has already passed.");
  const margin = agent.bufferMinutes * MINUTE;
  const clash = await ctx.db
    .select({ id: appointments.id, listingId: appointments.listingId, start: appointments.startsAt, end: appointments.endsAt })
    .from(appointments)
    .where(
      and(
        eq(appointments.agencyId, ctx.agencyId),
        eq(appointments.agentId, agent.id),
        inArray(appointments.status, ["scheduled", "confirmed"]),
        lt(appointments.startsAt, new Date(end.getTime() + margin)),
        gt(appointments.endsAt, new Date(start.getTime() - margin)),
      ),
    );
  // At the same house the agent needs no travel time, only no overlap.
  if (clash.some((c) => (c.listingId === listing.id ? c.start < end && c.end > start : true))) throw new Error(`${agent.name} already has an appointment around that time.`);
  const [show] = await ctx.db
    .select({ id: openHouses.id })
    .from(openHouses)
    .where(and(eq(openHouses.agencyId, ctx.agencyId), eq(openHouses.agentId, agent.id), eq(openHouses.status, "planned"), lt(openHouses.startsAt, end), gt(openHouses.endsAt, start)));
  if (show) throw new Error(`${agent.name} has an open house at that time.`);
  const home = await homeConstraints(ctx, listing, startOfZonedDay(start), startOfZonedDay(start, 1));
  if (home) {
    const allowed = home.allowed.some((a) => a.start <= start && a.end >= end);
    const blocked = home.blocks.some((b) => b.start < end && b.end > start);
    if (!allowed || blocked) throw new Error("The occupants don't allow visitors at that time.");
  }
}

/** Serialises bookings per agent so two people can never take the same slot. */
export async function lockAgent(ctx: ToolContext, agentId: string) {
  await ctx.db.execute(sql`select pg_advisory_xact_lock(hashtext(${agentId}))`);
}

/**
 * Serialises bookings per occupied home, taken after the agent's lock: two agents
 * showing the same house can't both take the occupants' only free hour.
 */
export async function lockListing(ctx: ToolContext, listing: Listing) {
  if (listing.access === "agent") return;
  await ctx.db.execute(sql`select pg_advisory_xact_lock(hashtext(${`listing:${listing.id}`}))`);
}

function calendarEvent(listing: Listing | null, contact: { firstName: string | null; lastName: string | null; email: string | null; phone: string | null }, start: Date, end: Date): CalendarEvent {
  const name = [contact.firstName, contact.lastName].filter(Boolean).join(" ") || "Client";
  const place = listing ? [[listing.street, listing.houseNumber].filter(Boolean).join(" "), listing.city].filter(Boolean).join(", ") : undefined;
  return {
    title: `Viewing: ${name}${listing ? ` · ${listing.reference}` : ""}`,
    description: [contact.email, contact.phone].filter(Boolean).join("\n"),
    location: place,
    start,
    end,
    attendeeEmail: contact.email ?? undefined,
  };
}

export const availableSlots = defineTool({
  name: "availability_slots",
  description: "Bookable viewing slots for a listing (with its responsible agent) or a specific agent, from a date for a number of days.",
  mutates: false,
  input: z.object({
    listingId: z.string().optional(),
    agentId: z.string().optional(),
    from: z.coerce.date().optional(),
    days: z.number().int().min(1).max(BOOKING_HORIZON_DAYS).default(14),
    excludeAppointmentId: z.string().optional().describe("Ignore this appointment, e.g. when rescheduling it"),
    minutes: z.number().int().min(15).max(240).optional().describe("Length of the appointment, if not the agent's usual viewing length"),
  }),
  run: async (ctx, input) => {
    let agent: Agent | undefined;
    const listing = input.listingId ? await getListing(ctx, input.listingId) : null;
    if (input.agentId) {
      agent = await activeAgent(ctx, input.agentId);
    }
    if (!agent && listing) {
      agent = await resolveAgentForListing(ctx, listing);
    }
    if (!agent) throw new Error("Pass a listingId or agentId");
    const from = input.from ?? new Date();
    const to = startOfZonedDay(from, input.days);
    const minutes = input.minutes ?? agent.slotMinutes;
    let slots: ViewingSlot[];
    let openHouses: { id: string; startsAt: Date; endsAt: Date; placesLeft: number }[] = [];
    if (listing) {
      const shows = await listingOpenHouses(ctx, listing, from, to, input.excludeAppointmentId);
      const own = shows.exclusive ? [] : await agentSlots(ctx, agent, from, to, { excludeAppointmentId: input.excludeAppointmentId, slotMinutes: minutes, listing });
      slots = [...shows.slots, ...own].sort((a, b) => a.start.getTime() - b.start.getTime());
      openHouses = shows.upcoming;
    } else {
      slots = await agentSlots(ctx, agent, from, to, { excludeAppointmentId: input.excludeAppointmentId, slotMinutes: minutes });
    }
    // An occupied home whose occupants haven't given any times yet: visitors can only ask for a viewing.
    const awaitingOccupant = Boolean(listing && listing.access !== "agent" && !(await homeConstraints(ctx, listing, from, to))?.windows);
    return { agent: { id: agent.id, name: agent.name }, slotMinutes: minutes, slots, awaitingOccupant, openHouses };
  },
});

const contactInput = z
  .object({
    firstName: z.string().trim().min(1).max(80),
    lastName: z.string().trim().max(80).optional(),
    email: z.string().trim().toLowerCase().email().optional(),
    phone: z.string().trim().max(40).optional(),
    language: z.enum(["nl", "fr", "en", "de"]).optional(),
    whatsappOptIn: z.boolean().default(false),
  })
  .refine((c) => c.email || c.phone, "Give an email address or a phone number");

/** Digits only (with a leading +), so "0470 12 34 56" and "0470123456" are the same caller. */
const phoneKey = (phone: string) => phone.replace(/[^0-9+]/g, "");

/** The agency's contact with this email address, else with this phone number. */
async function findContact(ctx: ToolContext, contact: { email?: string; phone?: string }) {
  if (contact.email) {
    const [byEmail] = await ctx.db.select().from(contacts).where(and(eq(contacts.agencyId, ctx.agencyId), eq(contacts.email, contact.email)));
    if (byEmail) return byEmail;
  }
  if (contact.phone && phoneKey(contact.phone).length >= 6) {
    const [byPhone] = await ctx.db
      .select()
      .from(contacts)
      .where(and(eq(contacts.agencyId, ctx.agencyId), sql`regexp_replace(${contacts.phone}, '[^0-9+]', '', 'g') = ${phoneKey(contact.phone)}`))
      .orderBy(asc(contacts.createdAt));
    if (byPhone) return byPhone;
  }
  return null;
}

export const bookViewing = defineTool({
  name: "appointments_book",
  description:
    "Book a viewing of a listing at a free slot with its responsible agent. Creates or updates the contact and lead, and fails if the slot is no longer free.",
  mutates: true,
  input: z.object({
    listingId: z.string(),
    startsAt: z.coerce.date(),
    agentId: z.string().optional().describe("Book with this agent instead of the listing's own, e.g. the agent named on the website page"),
    contact: contactInput,
    message: z.string().trim().max(2000).optional(),
    source: z.enum(["immoweb", "zimmo", "immovlan", "website", "whatsapp", "phone", "manual"]).default("website"),
    qualification: z.record(z.string(), z.string()).optional().describe("Answers to the widget's qualifying questions: question id → option id"),
    anyTime: z.boolean().default(false).describe("Staff only: book a time agreed with the client outside the offered slots, if the agent is free and the home allows it"),
    confirmToClient: z.boolean().default(false).describe("Staff only: send the client the usual booking confirmation, e.g. after a booking by phone"),
  }),
  run: async (ctx, input) => {
    const staff = ctx.actor.type === "user";
    if (input.anyTime && !staff) throw new Error("Only the agency can book outside the offered times");
    const result = await ctx.db.transaction(async (tx) => {
      const txCtx = { ...ctx, db: tx };
      const listing = await getListing(txCtx, input.listingId);
      if (listing.status !== "active" && !staff) throw new Error("This listing takes no viewings");
      const dayStart = startOfZonedDay(input.startsAt);
      const dayEnd = startOfZonedDay(input.startsAt, 1);
      // A place at an open house is booked with the agent who holds it.
      const show = input.anyTime ? undefined : (await listingOpenHouses(txCtx, listing, dayStart, dayEnd)).slots.find((s) => s.start.getTime() === input.startsAt.getTime());
      const showAgent = show && (await tx.select({ agentId: openHouses.agentId }).from(openHouses).where(eq(openHouses.id, show.openHouseId)))[0];
      const agent =
        (showAgent && (await activeAgent(txCtx, showAgent.agentId))) ||
        (input.agentId && (await activeAgent(txCtx, input.agentId))) ||
        (await resolveAgentForListing(txCtx, listing));
      await lockAgent(txCtx, agent.id);
      await lockListing(txCtx, listing);

      let slot: ViewingSlot | undefined;
      if (input.anyTime) {
        slot = { start: input.startsAt, end: new Date(input.startsAt.getTime() + agent.slotMinutes * MINUTE) };
        await assertFreeAt(txCtx, agent, listing, slot.start, slot.end);
      } else {
        const slots = await viewingSlots(txCtx, agent, listing, dayStart, dayEnd);
        slot = slots.find((s) => s.start.getTime() === input.startsAt.getTime() && s.openHouseId === show?.openHouseId);
      }
      if (!slot) throw new SlotUnavailableError();

      const existingContact = await findContact(txCtx, input.contact);
      const contactValues = {
        firstName: input.contact.firstName,
        lastName: input.contact.lastName ?? existingContact?.lastName ?? null,
        email: input.contact.email ?? existingContact?.email ?? null,
        phone: input.contact.phone ?? existingContact?.phone ?? null,
        language: input.contact.language ?? existingContact?.language ?? null,
        whatsappOptIn: input.contact.whatsappOptIn || (existingContact?.whatsappOptIn ?? false),
      };
      const [contact] = existingContact
        ? await tx.update(contacts).set(contactValues).where(eq(contacts.id, existingContact.id)).returning()
        : await tx.insert(contacts).values({ ...contactValues, agencyId: ctx.agencyId }).returning();

      const [openLead] = await tx
        .select()
        .from(leads)
        .where(
          and(
            eq(leads.agencyId, ctx.agencyId),
            eq(leads.contactId, contact!.id),
            eq(leads.listingId, listing.id),
            sql`${leads.stage} not in ('won','lost')`,
          ),
        );
      const qualification = input.qualification ? qualify(listing.transaction, input.qualification) : undefined;
      const [lead] = openLead
        ? await tx
            .update(leads)
            .set({ stage: "booked", agentId: agent.id, ...(qualification && { qualification }) })
            .where(eq(leads.id, openLead.id))
            .returning()
        : await tx
            .insert(leads)
            .values({ agencyId: ctx.agencyId, contactId: contact!.id, listingId: listing.id, agentId: agent.id, source: input.source, stage: "booked", message: input.message, qualification })
            .returning();

      const [appointment] = await tx
        .insert(appointments)
        .values({
          agencyId: ctx.agencyId,
          agentId: agent.id,
          listingId: listing.id,
          contactId: contact!.id,
          leadId: lead!.id,
          openHouseId: slot.openHouseId ?? null,
          type: "viewing",
          status: "confirmed",
          startsAt: slot.start,
          endsAt: slot.end,
          location: [[listing.street, listing.houseNumber].filter(Boolean).join(" "), [listing.postcode, listing.city].filter(Boolean).join(" ")].filter(Boolean).join(", "),
          notes: input.message,
        })
        .returning();

      await recordEvent(txCtx, {
        type: "appointment.booked",
        subjectType: "appointment",
        subjectId: appointment!.id,
        data: { listingId: listing.id, agentId: agent.id, leadId: lead!.id, startsAt: slot.start.toISOString(), source: input.source, openHouseId: slot.openHouseId ?? null, anyTime: input.anyTime || undefined },
      });
      return { appointment: appointment!, listing, agent, contact: contact! };
    });

    // An open house is one event in the agent's calendar, not one per visitor.
    if (!result.appointment.openHouseId) {
      const externalEventId = await syncAppointmentToCalendar(
        ctx,
        result.agent.id,
        null,
        calendarEvent(result.listing, result.contact, result.appointment.startsAt, result.appointment.endsAt),
      );
      if (externalEventId) {
        await ctx.db.update(appointments).set({ externalEventId }).where(eq(appointments.id, result.appointment.id));
      }
    }
    if (ctx.actor.type === "contact") {
      const { noteClientAction } = await import("../planner/agent");
      await noteClientAction(ctx, result.appointment.id, { kind: "booked" });
    } else if (staff && input.confirmToClient) {
      const { noteClientAction } = await import("../planner/agent");
      await noteClientAction(ctx, result.appointment.id, { kind: "booked", by: input.source === "phone" ? "phone" : "staff" });
    }
    // Open house visitors show on its list; owners and the agent aren't alerted for each one.
    if (!result.appointment.openHouseId) {
      await alertOccupants(ctx, result.appointment.id, { kind: "booked" });
      await alertAgent(ctx, result.appointment.id, { kind: "booked" });
    }
    return {
      appointmentId: result.appointment.id,
      manageToken: result.appointment.manageToken,
      startsAt: result.appointment.startsAt,
      endsAt: result.appointment.endsAt,
      agentName: result.agent.name,
      openHouseId: result.appointment.openHouseId,
      contactId: result.contact.id,
    };
  },
});

export class SlotUnavailableError extends Error {
  constructor() {
    super("This time is no longer available. Please choose another slot.");
    this.name = "SlotUnavailableError";
  }
}

async function getAppointment(ctx: ToolContext, appointmentId: string) {
  const [appointment] = await ctx.db
    .select()
    .from(appointments)
    .where(and(eq(appointments.agencyId, ctx.agencyId), eq(appointments.id, appointmentId)));
  if (!appointment) throw new Error("Appointment not found");
  return appointment;
}

export const cancelAppointment = defineTool({
  name: "appointments_cancel",
  description: "Cancel an appointment and free the agent's time. Optionally move the lead back to 'invited' so they can pick a new time.",
  mutates: true,
  input: z.object({
    appointmentId: z.string(),
    reason: z.string().trim().max(500).optional(),
    reopenLead: z.boolean().default(false),
  }),
  run: async (ctx, input) => {
    const appointment = await getAppointment(ctx, input.appointmentId);
    if (appointment.status === "cancelled") return { changed: false };
    if (appointment.status === "completed") throw new Error("A completed appointment cannot be cancelled");

    await ctx.db
      .update(appointments)
      .set({ status: "cancelled", externalEventId: null })
      .where(and(eq(appointments.agencyId, ctx.agencyId), eq(appointments.id, appointment.id)));
    if (input.reopenLead && appointment.leadId) {
      await ctx.db
        .update(leads)
        .set({ stage: "invited" })
        .where(and(eq(leads.agencyId, ctx.agencyId), eq(leads.id, appointment.leadId)));
    }
    await recordEvent(ctx, {
      type: "appointment.cancelled",
      subjectType: "appointment",
      subjectId: appointment.id,
      data: { reason: input.reason ?? null, reopenLead: input.reopenLead },
    });
    await syncAppointmentToCalendar(ctx, appointment.agentId, appointment.externalEventId, null);
    if (ctx.actor.type === "contact") {
      const { noteClientAction } = await import("../planner/agent");
      await noteClientAction(ctx, appointment.id, { kind: "cancelled" });
    }
    if (!appointment.openHouseId) {
      await alertOccupants(ctx, appointment.id, { kind: "cancelled" });
      await alertAgent(ctx, appointment.id, { kind: "cancelled" });
    }
    return { changed: true };
  },
});

export const rescheduleAppointment = defineTool({
  name: "appointments_reschedule",
  description: "Move an appointment to another free slot with the same agent.",
  mutates: true,
  input: z.object({ appointmentId: z.string(), startsAt: z.coerce.date() }),
  run: async (ctx, input) => {
    let previousStart = input.startsAt;
    const updated = await ctx.db.transaction(async (tx) => {
      const txCtx = { ...ctx, db: tx };
      const appointment = await getAppointment(txCtx, input.appointmentId);
      if (!["scheduled", "confirmed"].includes(appointment.status)) throw new Error("Only upcoming appointments can be rescheduled");
      let [agent] = await tx.select().from(agents).where(eq(agents.id, appointment.agentId));
      const listing = appointment.type === "viewing" && appointment.listingId ? await getListing(txCtx, appointment.listingId) : null;
      const dayStart = startOfZonedDay(input.startsAt);
      const dayEnd = startOfZonedDay(input.startsAt, 1);
      // Moving to an open house slot moves the viewing to the agent who holds it.
      const show = listing ? (await listingOpenHouses(txCtx, listing, dayStart, dayEnd, appointment.id)).slots.find((s) => s.start.getTime() === input.startsAt.getTime()) : undefined;
      if (show) {
        const [held] = await tx.select({ agentId: openHouses.agentId }).from(openHouses).where(eq(openHouses.id, show.openHouseId));
        const showAgent = held && (await activeAgent(txCtx, held.agentId));
        if (showAgent) agent = showAgent;
      }
      await lockAgent(txCtx, agent!.id);
      if (listing) await lockListing(txCtx, listing);

      const slots: ViewingSlot[] = listing
        ? await viewingSlots(txCtx, agent!, listing, dayStart, dayEnd, { excludeAppointmentId: appointment.id })
        : await agentSlots(txCtx, agent!, dayStart, dayEnd, { excludeAppointmentId: appointment.id, slotMinutes: Math.round((appointment.endsAt.getTime() - appointment.startsAt.getTime()) / MINUTE) });
      const slot = slots.find((s) => s.start.getTime() === input.startsAt.getTime() && s.openHouseId === show?.openHouseId);
      if (!slot) throw new SlotUnavailableError();

      previousStart = appointment.startsAt;
      const [row] = await tx
        .update(appointments)
        .set({ startsAt: slot.start, endsAt: slot.end, status: "confirmed", agentId: agent!.id, openHouseId: slot.openHouseId ?? null })
        .where(eq(appointments.id, appointment.id))
        .returning();
      await recordEvent(txCtx, {
        type: "appointment.rescheduled",
        subjectType: "appointment",
        subjectId: appointment.id,
        data: { from: appointment.startsAt.toISOString(), to: slot.start.toISOString() },
      });
      return row!;
    });

    const [listing] = updated.listingId ? await ctx.db.select().from(listings).where(eq(listings.id, updated.listingId)) : [];
    const [contact] = updated.contactId ? await ctx.db.select().from(contacts).where(eq(contacts.id, updated.contactId)) : [];
    const externalEventId = await syncAppointmentToCalendar(
      ctx,
      updated.agentId,
      updated.externalEventId,
      updated.openHouseId ? null : calendarEvent(listing ?? null, contact ?? { firstName: null, lastName: null, email: null, phone: null }, updated.startsAt, updated.endsAt),
    );
    if (externalEventId !== updated.externalEventId) {
      await ctx.db.update(appointments).set({ externalEventId }).where(eq(appointments.id, updated.id));
    }
    if (ctx.actor.type === "contact") {
      const { noteClientAction } = await import("../planner/agent");
      await noteClientAction(ctx, updated.id, { kind: "rescheduled", from: previousStart });
    }
    if (!updated.openHouseId) {
      await alertOccupants(ctx, updated.id, { kind: "rescheduled", from: previousStart });
      await alertAgent(ctx, updated.id, { kind: "rescheduled", from: previousStart });
    }
    return { appointmentId: updated.id, startsAt: updated.startsAt, endsAt: updated.endsAt };
  },
});

export const setAgentAvailability = defineTool({
  name: "agents_set_availability",
  description: "Replace an agent's weekly working hours and their viewing length and travel buffer.",
  mutates: true,
  input: z.object({
    agentId: z.string(),
    workingHours: z
      .array(
        z
          .object({ weekday: z.number().int().min(0).max(6), startMinute: z.number().int().min(0).max(1440), endMinute: z.number().int().min(0).max(1440) })
          .refine((w) => w.endMinute > w.startMinute, "End must be after start"),
      )
      .max(28),
    slotMinutes: z.number().int().min(15).max(180).optional(),
    bufferMinutes: z.number().int().min(0).max(120).optional(),
  }),
  run: async (ctx, input) => {
    const [agent] = await ctx.db.select().from(agents).where(and(eq(agents.agencyId, ctx.agencyId), eq(agents.id, input.agentId)));
    if (!agent) throw new Error("Agent not found");
    await ctx.db.transaction(async (tx) => {
      await tx.delete(availabilityRules).where(and(eq(availabilityRules.agencyId, ctx.agencyId), eq(availabilityRules.agentId, agent.id)));
      if (input.workingHours.length > 0) {
        await tx.insert(availabilityRules).values(input.workingHours.map((w) => ({ ...w, agencyId: ctx.agencyId, agentId: agent.id })));
      }
      if (input.slotMinutes !== undefined || input.bufferMinutes !== undefined) {
        await tx
          .update(agents)
          .set({ slotMinutes: input.slotMinutes ?? agent.slotMinutes, bufferMinutes: input.bufferMinutes ?? agent.bufferMinutes })
          .where(eq(agents.id, agent.id));
      }
    });
    await recordEvent(ctx, { type: "agent.availability_changed", subjectType: "agent", subjectId: agent.id, data: { windows: input.workingHours.length } });
    return { updated: true };
  },
});

export const getAgentAvailability = defineTool({
  name: "agents_get_availability",
  description: "An agent's weekly working hours, viewing length and travel buffer.",
  mutates: false,
  input: z.object({ agentId: z.string() }),
  run: async (ctx, input) => {
    const [agent] = await ctx.db.select().from(agents).where(and(eq(agents.agencyId, ctx.agencyId), eq(agents.id, input.agentId)));
    if (!agent) throw new Error("Agent not found");
    const workingHours = await ctx.db
      .select({ weekday: availabilityRules.weekday, startMinute: availabilityRules.startMinute, endMinute: availabilityRules.endMinute })
      .from(availabilityRules)
      .where(and(eq(availabilityRules.agencyId, ctx.agencyId), eq(availabilityRules.agentId, agent.id)))
      .orderBy(asc(availabilityRules.weekday), asc(availabilityRules.startMinute));
    return { agent, workingHours };
  },
});

export const bookValuationVisit = defineTool({
  name: "appointments_book_valuation",
  description: "Book a valuation visit at the owner's home after an online estimate, with the agent assigned to that valuation.",
  mutates: true,
  input: z.object({ valuationToken: z.string(), startsAt: z.coerce.date() }),
  run: async (ctx, input) => {
    const result = await ctx.db.transaction(async (tx) => {
      const txCtx = { ...ctx, db: tx };
      const [valuation] = await tx
        .select()
        .from(schema.valuations)
        .where(and(eq(schema.valuations.agencyId, ctx.agencyId), eq(schema.valuations.token, input.valuationToken)));
      if (!valuation?.verifiedAt || !valuation.agentId || !valuation.contactId) throw new Error("This valuation can't be booked yet");
      const agent = await activeAgent(txCtx, valuation.agentId);
      if (!agent) throw new Error("Agent not available");
      await lockAgent(txCtx, agent.id);
      // A valuation takes longer than a viewing: the whole hour must be free.
      const slots = await agentSlots(txCtx, agent, startOfZonedDay(input.startsAt), startOfZonedDay(input.startsAt, 1), { slotMinutes: VALUATION_MINUTES });
      const slot = slots.find((s) => s.start.getTime() === input.startsAt.getTime());
      if (!slot) throw new SlotUnavailableError();
      const endsAt = slot.end;
      const [appointment] = await tx
        .insert(appointments)
        .values({
          agencyId: ctx.agencyId,
          agentId: agent.id,
          contactId: valuation.contactId,
          leadId: valuation.leadId,
          type: "valuation",
          status: "confirmed",
          startsAt: slot.start,
          endsAt,
          location: [[valuation.street, valuation.houseNumber].filter(Boolean).join(" "), `${valuation.postcode} ${valuation.city}`].join(", "),
        })
        .returning();
      if (valuation.leadId) await tx.update(leads).set({ stage: "booked" }).where(eq(leads.id, valuation.leadId));
      await recordEvent(txCtx, { type: "appointment.booked", subjectType: "appointment", subjectId: appointment!.id, data: { type: "valuation", agentId: agent.id } });
      return { appointment: appointment!, agent };
    });
    if (ctx.actor.type === "contact") {
      const { noteClientAction } = await import("../planner/agent");
      await noteClientAction(ctx, result.appointment.id, { kind: "booked" });
    }
    await alertAgent(ctx, result.appointment.id, { kind: "booked" });
    return { appointmentId: result.appointment.id, manageToken: result.appointment.manageToken, startsAt: result.appointment.startsAt, agentName: result.agent.name };
  },
});
