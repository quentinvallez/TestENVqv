import { and, asc, eq, gt, inArray, lt, ne, schema, sql } from "@viewing/db";
import { z } from "zod";
import { syncAppointmentToCalendar, externalBusy, type CalendarEvent } from "../calendar";
import { recordEvent } from "../events";
import { computeSlots, type Interval } from "../planner/availability";
import { qualify } from "../planner/qualification";
import { startOfZonedDay } from "../time";
import { defineTool, type ToolContext } from "../tool";

const { agents, appointments, availabilityRules, contacts, leads, listings } = schema;

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

/** Free slots for an agent between two instants, against their appointments and connected calendars. */
export async function agentSlots(ctx: ToolContext, agent: Agent, from: Date, to: Date, excludeAppointmentId?: string, slotMinutes = agent.slotMinutes): Promise<Interval[]> {
  const margin = agent.bufferMinutes * MINUTE;
  // Sequential on purpose: this often runs inside a transaction, which is a single connection.
  const rules = await ctx.db
    .select()
    .from(availabilityRules)
    .where(and(eq(availabilityRules.agencyId, ctx.agencyId), eq(availabilityRules.agentId, agent.id)));
  const booked = await ctx.db
    .select({ start: appointments.startsAt, end: appointments.endsAt })
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
  const external = await externalBusy(ctx, agent.id, from, to);
  return computeSlots({
    workingHours: rules,
    busy: [...booked, ...external],
    from,
    to,
    slotMinutes,
    bufferMinutes: agent.bufferMinutes,
  });
}

/** Serialises bookings per agent so two people can never take the same slot. */
export async function lockAgent(ctx: ToolContext, agentId: string) {
  await ctx.db.execute(sql`select pg_advisory_xact_lock(hashtext(${agentId}))`);
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
    if (input.agentId) {
      agent = await activeAgent(ctx, input.agentId);
    }
    if (!agent && input.listingId) {
      agent = await resolveAgentForListing(ctx, await getListing(ctx, input.listingId));
    }
    if (!agent) throw new Error("Pass a listingId or agentId");
    const from = input.from ?? new Date();
    const to = startOfZonedDay(from, input.days);
    const minutes = input.minutes ?? agent.slotMinutes;
    const slots = await agentSlots(ctx, agent, from, to, input.excludeAppointmentId, minutes);
    return { agent: { id: agent.id, name: agent.name }, slotMinutes: minutes, slots };
  },
});

const contactInput = z.object({
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().max(80).optional(),
  email: z.string().trim().toLowerCase().email(),
  phone: z.string().trim().max(40).optional(),
  language: z.enum(["nl", "fr", "en", "de"]).optional(),
  whatsappOptIn: z.boolean().default(false),
});

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
  }),
  run: async (ctx, input) => {
    const result = await ctx.db.transaction(async (tx) => {
      const txCtx = { ...ctx, db: tx };
      const listing = await getListing(txCtx, input.listingId);
      const agent = (input.agentId && (await activeAgent(txCtx, input.agentId))) || (await resolveAgentForListing(txCtx, listing));
      await lockAgent(txCtx, agent.id);

      const dayStart = startOfZonedDay(input.startsAt);
      const slots = await agentSlots(txCtx, agent, dayStart, startOfZonedDay(input.startsAt, 1));
      const slot = slots.find((s) => s.start.getTime() === input.startsAt.getTime());
      if (!slot) throw new SlotUnavailableError();

      const [existingContact] = await tx
        .select()
        .from(contacts)
        .where(and(eq(contacts.agencyId, ctx.agencyId), eq(contacts.email, input.contact.email)));
      const contactValues = {
        firstName: input.contact.firstName,
        lastName: input.contact.lastName ?? null,
        email: input.contact.email,
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
        data: { listingId: listing.id, agentId: agent.id, leadId: lead!.id, startsAt: slot.start.toISOString(), source: input.source },
      });
      return { appointment: appointment!, listing, agent, contact: contact! };
    });

    const externalEventId = await syncAppointmentToCalendar(
      ctx,
      result.agent.id,
      null,
      calendarEvent(result.listing, result.contact, result.appointment.startsAt, result.appointment.endsAt),
    );
    if (externalEventId) {
      await ctx.db.update(appointments).set({ externalEventId }).where(eq(appointments.id, result.appointment.id));
    }
    if (ctx.actor.type === "contact") {
      const { noteClientAction } = await import("../planner/agent");
      await noteClientAction(ctx, result.appointment.id, { kind: "booked" });
    }
    return {
      appointmentId: result.appointment.id,
      manageToken: result.appointment.manageToken,
      startsAt: result.appointment.startsAt,
      endsAt: result.appointment.endsAt,
      agentName: result.agent.name,
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
      const [agent] = await tx.select().from(agents).where(eq(agents.id, appointment.agentId));
      await lockAgent(txCtx, agent!.id);

      const slots = await agentSlots(txCtx, agent!, startOfZonedDay(input.startsAt), startOfZonedDay(input.startsAt, 1), appointment.id);
      const slot = slots.find((s) => s.start.getTime() === input.startsAt.getTime());
      if (!slot) throw new SlotUnavailableError();

      previousStart = appointment.startsAt;
      const [row] = await tx
        .update(appointments)
        .set({ startsAt: slot.start, endsAt: slot.end, status: "confirmed" })
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
      calendarEvent(listing ?? null, contact ?? { firstName: null, lastName: null, email: null, phone: null }, updated.startsAt, updated.endsAt),
    );
    if (externalEventId !== updated.externalEventId) {
      await ctx.db.update(appointments).set({ externalEventId }).where(eq(appointments.id, updated.id));
    }
    if (ctx.actor.type === "contact") {
      const { noteClientAction } = await import("../planner/agent");
      await noteClientAction(ctx, updated.id, { kind: "rescheduled", from: previousStart });
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
      const slots = await agentSlots(txCtx, agent, startOfZonedDay(input.startsAt), startOfZonedDay(input.startsAt, 1), undefined, VALUATION_MINUTES);
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
    return { appointmentId: result.appointment.id, manageToken: result.appointment.manageToken, startsAt: result.appointment.startsAt, agentName: result.agent.name };
  },
});
