import { and, asc, eq, gte, inArray, lt, schema } from "@viewing/db";
import { z } from "zod";
import { startOfZonedDay } from "../time";
import { defineTool } from "../tool";

const { appointments, agents, contacts, listings } = schema;

export const listAppointments = defineTool({
  name: "appointments_list",
  description: "List appointments in a time range (defaults to the next 14 days), with agent, contact and listing.",
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
        startsAt: appointments.startsAt,
        endsAt: appointments.endsAt,
        location: appointments.location,
        agentId: agents.id,
        agentName: agents.name,
        agentColor: agents.color,
        contactFirstName: contacts.firstName,
        contactLastName: contacts.lastName,
        listingId: listings.id,
        listingReference: listings.reference,
        listingStreet: listings.street,
        listingHouseNumber: listings.houseNumber,
        listingCity: listings.city,
      })
      .from(appointments)
      .innerJoin(agents, eq(agents.id, appointments.agentId))
      .leftJoin(contacts, eq(contacts.id, appointments.contactId))
      .leftJoin(listings, eq(listings.id, appointments.listingId))
      .where(
        and(
          eq(appointments.agencyId, ctx.agencyId),
          gte(appointments.startsAt, from),
          lt(appointments.startsAt, to),
          input.agentId ? eq(appointments.agentId, input.agentId) : undefined,
          input.includeCancelled ? undefined : inArray(appointments.status, ["scheduled", "confirmed", "completed"]),
        ),
      )
      .orderBy(asc(appointments.startsAt));
  },
});
