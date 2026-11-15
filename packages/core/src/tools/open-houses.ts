import { and, asc, eq, gt, inArray, lt, schema } from "@viewing/db";
import { z } from "zod";
import { syncAppointmentToCalendar } from "../calendar";
import { recordEvent } from "../events";
import { defineTool } from "../tool";
import { activeAgent, lockAgent, lockListing, resolveAgentForListing } from "./booking";

const { appointments, contacts, listings, openHouses } = schema;

const MINUTE = 60_000;
const MAX_HOURS = 10;

const placeOf = (l: { street: string | null; houseNumber: string | null; postcode: string | null; city: string | null }) =>
  [[l.street, l.houseNumber].filter(Boolean).join(" "), [l.postcode, l.city].filter(Boolean).join(" ")].filter(Boolean).join(", ");

/** How many visitors fit: per time slot times the number of slots, or the cap without time slots. */
export function openHouseCapacity(o: { startsAt: Date; endsAt: Date; slotMinutes: number; perSlot: number }) {
  if (o.slotMinutes <= 0) return o.perSlot;
  return Math.floor((o.endsAt.getTime() - o.startsAt.getTime()) / (o.slotMinutes * MINUTE)) * o.perSlot;
}

export const planOpenHouse = defineTool({
  name: "open_houses_plan",
  description:
    "Plan an open house (kijkdag) at a listing: the agent is there for a block of time and visitors book short time slots with room for several each, through the widget, the booking link or the planner's offered times.",
  mutates: true,
  input: z
    .object({
      listingId: z.string(),
      agentId: z.string().optional().describe("Defaults to the listing's responsible agent"),
      startsAt: z.coerce.date(),
      endsAt: z.coerce.date(),
      slotMinutes: z.union([z.literal(0), z.literal(10), z.literal(15), z.literal(20), z.literal(30), z.literal(60)]).default(15).describe("0 = no time slots: visitors come any time during the block"),
      perSlot: z.number().int().min(1).max(100).default(4).describe("Visitors per time slot, or in all without time slots"),
      exclusive: z.boolean().default(true).describe("Until it is over, visitors can only book the open house for this listing"),
      note: z.string().trim().max(500).optional(),
    })
    .refine((o) => o.endsAt > o.startsAt, "The end must be after the start")
    .refine((o) => o.endsAt.getTime() - o.startsAt.getTime() <= MAX_HOURS * 60 * MINUTE, `An open house lasts at most ${MAX_HOURS} hours`)
    .refine((o) => o.slotMinutes === 0 || (o.endsAt.getTime() - o.startsAt.getTime()) % (o.slotMinutes * MINUTE) === 0, "The open house must fit a whole number of time slots"),
  run: async (ctx, input) => {
    if (input.startsAt.getTime() < Date.now()) throw new Error("An open house must start in the future");
    const created = await ctx.db.transaction(async (tx) => {
      const txCtx = { ...ctx, db: tx };
      const [listing] = await tx.select().from(listings).where(and(eq(listings.agencyId, ctx.agencyId), eq(listings.id, input.listingId)));
      if (!listing) throw new Error("Listing not found");
      if (listing.status !== "active") throw new Error("Only listings on the market can have an open house");
      const agent = (input.agentId && (await activeAgent(txCtx, input.agentId))) || (await resolveAgentForListing(txCtx, listing));
      await lockAgent(txCtx, agent.id);
      await lockListing(txCtx, listing);

      // The agent must be free for the whole block; viewings of this same house may stay.
      const clashes = await tx
        .select({ id: appointments.id, listingId: appointments.listingId })
        .from(appointments)
        .where(
          and(
            eq(appointments.agencyId, ctx.agencyId),
            eq(appointments.agentId, agent.id),
            inArray(appointments.status, ["scheduled", "confirmed"]),
            lt(appointments.startsAt, input.endsAt),
            gt(appointments.endsAt, input.startsAt),
          ),
        );
      const elsewhere = clashes.filter((c) => c.listingId !== listing.id).length;
      if (elsewhere) throw new Error(`${agent.name} has ${elsewhere === 1 ? "an appointment" : `${elsewhere} appointments`} elsewhere during that time`);
      const [other] = await tx
        .select({ id: openHouses.id })
        .from(openHouses)
        .where(and(eq(openHouses.agencyId, ctx.agencyId), eq(openHouses.agentId, agent.id), eq(openHouses.status, "planned"), lt(openHouses.startsAt, input.endsAt), gt(openHouses.endsAt, input.startsAt)));
      if (other) throw new Error(`${agent.name} already has an open house at that time`);

      const [row] = await tx
        .insert(openHouses)
        .values({
          agencyId: ctx.agencyId,
          listingId: listing.id,
          agentId: agent.id,
          startsAt: input.startsAt,
          endsAt: input.endsAt,
          slotMinutes: input.slotMinutes,
          perSlot: input.perSlot,
          exclusive: input.exclusive,
          note: input.note ?? null,
        })
        .returning();
      await recordEvent(txCtx, {
        type: "open_house.planned",
        subjectType: "open_house",
        subjectId: row!.id,
        data: { listingId: listing.id, agentId: agent.id, startsAt: input.startsAt.toISOString(), endsAt: input.endsAt.toISOString(), capacity: openHouseCapacity(row!) },
      });
      return { row: row!, listing, agent };
    });

    const externalEventId = await syncAppointmentToCalendar(ctx, created.agent.id, null, {
      title: `Open house · ${created.listing.reference}`,
      description: `Visitors book through the app; the list is on the listing's page.${input.note ? `\n${input.note}` : ""}`,
      location: placeOf(created.listing),
      start: created.row.startsAt,
      end: created.row.endsAt,
    });
    if (externalEventId) await ctx.db.update(openHouses).set({ externalEventId }).where(eq(openHouses.id, created.row.id));
    return { openHouseId: created.row.id, agentName: created.agent.name, capacity: openHouseCapacity(created.row) };
  },
});

export const listOpenHouses = defineTool({
  name: "open_houses_list",
  description: "Open houses of a listing (upcoming by default) or of the agency between two dates, with their visitors and how many places are left.",
  mutates: false,
  input: z.object({ listingId: z.string().optional(), from: z.coerce.date().optional(), to: z.coerce.date().optional(), includePast: z.boolean().default(false) }),
  run: async (ctx, input) => {
    const rows = await ctx.db.query.openHouses.findMany({
      where: and(
        eq(openHouses.agencyId, ctx.agencyId),
        input.listingId ? eq(openHouses.listingId, input.listingId) : undefined,
        eq(openHouses.status, "planned"),
        input.includePast || input.from ? undefined : gt(openHouses.endsAt, new Date()),
        input.from ? gt(openHouses.endsAt, input.from) : undefined,
        input.to ? lt(openHouses.startsAt, input.to) : undefined,
      ),
      orderBy: asc(openHouses.startsAt),
      with: {
        agent: { columns: { id: true, name: true, color: true } },
        listing: { columns: { id: true, reference: true, street: true, houseNumber: true, city: true } },
      },
    });
    const visitors = rows.length
      ? await ctx.db
          .select({
            appointmentId: appointments.id,
            openHouseId: appointments.openHouseId,
            startsAt: appointments.startsAt,
            status: appointments.status,
            contactId: contacts.id,
            firstName: contacts.firstName,
            lastName: contacts.lastName,
            phone: contacts.phone,
            email: contacts.email,
          })
          .from(appointments)
          .leftJoin(contacts, eq(contacts.id, appointments.contactId))
          .where(and(eq(appointments.agencyId, ctx.agencyId), inArray(appointments.openHouseId, rows.map((r) => r.id)), inArray(appointments.status, ["scheduled", "confirmed", "completed", "no_show"])))
          .orderBy(asc(appointments.startsAt), asc(appointments.createdAt))
      : [];
    return rows.map((o) => {
      const own = visitors.filter((v) => v.openHouseId === o.id);
      const capacity = openHouseCapacity(o);
      return {
        id: o.id,
        startsAt: o.startsAt,
        endsAt: o.endsAt,
        slotMinutes: o.slotMinutes,
        perSlot: o.perSlot,
        exclusive: o.exclusive,
        note: o.note,
        agent: o.agent,
        listing: o.listing,
        capacity,
        booked: own.length,
        placesLeft: Math.max(0, capacity - own.length),
        visitors: own,
      };
    });
  },
});

export const cancelOpenHouse = defineTool({
  name: "open_houses_cancel",
  description: "Cancel an open house nobody has booked yet. With visitors booked, cancel or move their viewings first so each of them hears about it.",
  mutates: true,
  input: z.object({ openHouseId: z.string() }),
  run: async (ctx, input) => {
    const [row] = await ctx.db.select().from(openHouses).where(and(eq(openHouses.agencyId, ctx.agencyId), eq(openHouses.id, input.openHouseId)));
    if (!row) throw new Error("Open house not found");
    if (row.status === "cancelled") return { changed: false };
    const booked = await ctx.db
      .select({ id: appointments.id })
      .from(appointments)
      .where(and(eq(appointments.agencyId, ctx.agencyId), eq(appointments.openHouseId, row.id), inArray(appointments.status, ["scheduled", "confirmed"])));
    if (booked.length) throw new Error(`${booked.length} ${booked.length === 1 ? "visitor has" : "visitors have"} booked this open house. Cancel or move their viewings first, so each of them hears about it.`);
    await ctx.db.update(openHouses).set({ status: "cancelled", externalEventId: null }).where(eq(openHouses.id, row.id));
    await recordEvent(ctx, { type: "open_house.cancelled", subjectType: "open_house", subjectId: row.id, data: { listingId: row.listingId } });
    await syncAppointmentToCalendar(ctx, row.agentId, row.externalEventId, null);
    return { changed: true };
  },
});
