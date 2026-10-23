import { and, asc, desc, eq, ilike, or, schema, sql } from "@viewing/db";
import { z } from "zod";
import { recordEvent } from "../events";
import { defineTool } from "../tool";

const { listings, agents, leads, appointments } = schema;

const listingStatus = z.enum(["draft", "active", "under_offer", "sold", "rented", "archived"]);

export const listListings = defineTool({
  name: "listings_list",
  description: "List the agency's listings with their responsible agent, optionally filtered by status or a search term.",
  mutates: false,
  input: z.object({
    status: listingStatus.optional(),
    search: z.string().optional().describe("Matches reference, street, city or title"),
  }),
  run: async (ctx, input) => {
    const term = input.search ? `%${input.search}%` : undefined;
    return ctx.db
      .select({
        id: listings.id,
        reference: listings.reference,
        status: listings.status,
        transaction: listings.transaction,
        propertyType: listings.propertyType,
        title: listings.title,
        street: listings.street,
        houseNumber: listings.houseNumber,
        postcode: listings.postcode,
        city: listings.city,
        price: listings.price,
        bedrooms: listings.bedrooms,
        livingArea: listings.livingArea,
        epcLabel: listings.epcLabel,
        photo: sql<string | null>`${listings.photos}->0->>'url'`,
        agentId: agents.id,
        agentName: agents.name,
        agentColor: agents.color,
        openLeads: sql<number>`(select count(*)::int from ${leads} where ${leads.listingId} = ${listings.id} and ${leads.stage} not in ('won','lost'))`,
        upcomingViewings: sql<number>`(select count(*)::int from ${appointments} where ${appointments.listingId} = ${listings.id} and ${appointments.startsAt} > now() and ${appointments.status} in ('scheduled','confirmed'))`,
      })
      .from(listings)
      .leftJoin(agents, eq(agents.id, listings.agentId))
      .where(
        and(
          eq(listings.agencyId, ctx.agencyId),
          input.status ? eq(listings.status, input.status) : undefined,
          term
            ? or(
                ilike(listings.reference, term),
                ilike(listings.street, term),
                ilike(listings.city, term),
                ilike(listings.title, term),
              )
            : undefined,
        ),
      )
      .orderBy(asc(sql`case ${listings.status} when 'active' then 0 when 'under_offer' then 1 when 'draft' then 2 else 3 end`), desc(listings.createdAt));
  },
});

export const getListing = defineTool({
  name: "listings_get",
  description: "Get one listing with its agent, leads and appointments.",
  mutates: false,
  input: z.object({ id: z.string() }),
  run: async (ctx, input) => {
    return ctx.db.query.listings.findFirst({
      where: and(eq(listings.agencyId, ctx.agencyId), eq(listings.id, input.id)),
      with: {
        agent: true,
        office: true,
        leads: { with: { contact: true }, orderBy: desc(leads.createdAt) },
        appointments: { with: { contact: true, agent: true }, orderBy: desc(appointments.startsAt) },
      },
    });
  },
});

export const createListing = defineTool({
  name: "listings_create",
  description: "Create a listing.",
  mutates: true,
  input: z.object({
    reference: z.string().min(1),
    transaction: z.enum(["sale", "rent"]),
    propertyType: z.string().min(1),
    status: listingStatus.default("draft"),
    title: z.string().optional(),
    street: z.string().optional(),
    houseNumber: z.string().optional(),
    postcode: z.string().optional(),
    city: z.string().optional(),
    price: z.number().int().positive().optional(),
    bedrooms: z.number().int().min(0).optional(),
    livingArea: z.number().int().positive().optional(),
    agentId: z.string().optional(),
  }),
  run: async (ctx, input) => {
    const [listing] = await ctx.db
      .insert(listings)
      .values({ ...input, agencyId: ctx.agencyId })
      .returning();
    await recordEvent(ctx, {
      type: "listing.created",
      subjectType: "listing",
      subjectId: listing!.id,
      data: { reference: listing!.reference },
    });
    return listing!;
  },
});
