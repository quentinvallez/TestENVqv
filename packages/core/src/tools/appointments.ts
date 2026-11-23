import { and, asc, eq, gte, inArray, lt, schema } from "@viewing/db";
import { z } from "zod";
import { startOfZonedDay } from "../time";
import { defineTool } from "../tool";

const { appointments, agents, contacts, leads, listings } = schema;

export const listAppointments = defineTool({
  name: "appointments_list",
  description: "List appointments in a time range (defaults to the next 14 days), with agent, contact, listing and what the client answered to the booking questions.",
  mutates: false,
  input: z.object({
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
    agentId: z.string().optional(),
    includeCancelled: z.boolean().default(false),
  }),
  run: async (ctx, input) => {
    const from = input.from ?? startOfZonedDay(new Date());
    const to = input.to ?? new Date(from.getTime() + 14 * 24 * 3600 * 1000);
    return ctx.db
      .select({
        id: appointments.id,
        type: appointments.type,
        status: appointments.status,
        openHouseId: appointments.openHouseId,
        startsAt: appointments.startsAt,
        endsAt: appointments.endsAt,
        location: appointments.location,
        agentId: agents.id,
        agentName: agents.name,
        agentColor: agents.color,
        contactFirstName: contacts.firstName,
        contactLastName: contacts.lastName,
        contactPhone: contacts.phone,
        contactId: contacts.id,
        listingId: listings.id,
        listingReference: listings.reference,
        listingStreet: listings.street,
        listingHouseNumber: listings.houseNumber,
        listingCity: listings.city,
        leadId: appointments.leadId,
        qualification: leads.qualification,
      })
      .from(appointments)
      .innerJoin(agents, eq(agents.id, appointments.agentId))
      .leftJoin(contacts, eq(contacts.id, appointments.contactId))
      .leftJoin(listings, eq(listings.id, appointments.listingId))
      .leftJoin(leads, and(eq(leads.id, appointments.leadId), eq(leads.agencyId, ctx.agencyId)))
      .where(
        and(
          eq(appointments.agencyId, ctx.agencyId),
          gte(appointments.startsAt, from),
          lt(appointments.startsAt, to),
          input.agentId ? eq(appointments.agentId, input.agentId) : undefined,
          input.includeCancelled ? undefined : inArray(appointments.status, ["scheduled", "confirmed", "completed"]),
        ),
      )
      .orderBy(asc(appointments.startsAt))
      .then((rows) => rows.map(({ qualification, ...row }) => ({ ...row, answers: qualification?.answers ?? [] })));
  },
});
