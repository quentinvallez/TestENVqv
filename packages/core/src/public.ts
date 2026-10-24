import { and, db, eq, inArray, schema } from "@viewing/db";
import type { ToolContext } from "./tool";

/*
 * Lookups for pages anyone can open without logging in: the booking page of a
 * listing and the manage link in a confirmation. They resolve which agency a
 * request belongs to; everything after that goes through tools as usual.
 */

/** A context for actions taken by a client (not a logged-in user) of an agency. */
export function publicContext(agencyId: string): ToolContext {
  return { db, agencyId, actor: { type: "contact", id: null } };
}

export async function bookableListing(listingId: string) {
  const [row] = await db
    .select({
      listing: schema.listings,
      agencyName: schema.organization.name,
      branding: schema.agencySettings.branding,
    })
    .from(schema.listings)
    .innerJoin(schema.organization, eq(schema.organization.id, schema.listings.agencyId))
    .leftJoin(schema.agencySettings, eq(schema.agencySettings.agencyId, schema.listings.agencyId))
    .where(and(eq(schema.listings.id, listingId), inArray(schema.listings.status, ["active", "under_offer"])));
  return row ?? null;
}

export async function appointmentByManageToken(token: string) {
  if (!/^[0-9a-f-]{36}$/i.test(token)) return null;
  const [row] = await db
    .select({
      appointment: schema.appointments,
      listing: schema.listings,
      agentName: schema.agents.name,
      agencyName: schema.organization.name,
      branding: schema.agencySettings.branding,
    })
    .from(schema.appointments)
    .innerJoin(schema.agents, eq(schema.agents.id, schema.appointments.agentId))
    .innerJoin(schema.organization, eq(schema.organization.id, schema.appointments.agencyId))
    .leftJoin(schema.listings, eq(schema.listings.id, schema.appointments.listingId))
    .leftJoin(schema.agencySettings, eq(schema.agencySettings.agencyId, schema.appointments.agencyId))
    .where(eq(schema.appointments.manageToken, token));
  return row ?? null;
}

export async function publicAgency(agencyId: string) {
  const [row] = await db
    .select({ id: schema.organization.id, name: schema.organization.name, branding: schema.agencySettings.branding })
    .from(schema.organization)
    .leftJoin(schema.agencySettings, eq(schema.agencySettings.agencyId, schema.organization.id))
    .where(eq(schema.organization.id, agencyId));
  return row ?? null;
}

/** Listings an agency shows on its public website. */
export async function publicListings(agencyId: string) {
  return db
    .select()
    .from(schema.listings)
    .where(and(eq(schema.listings.agencyId, agencyId), inArray(schema.listings.status, ["active", "under_offer"])))
    .orderBy(schema.listings.createdAt);
}

/** The listing behind a reference shown on an agency's website, plus the names the widget looks for on the page. */
export async function widgetContext(agencyId: string, reference: string) {
  const [listing] = await db
    .select({ id: schema.listings.id })
    .from(schema.listings)
    .where(
      and(
        eq(schema.listings.agencyId, agencyId),
        eq(schema.listings.reference, reference),
        inArray(schema.listings.status, ["active", "under_offer"]),
      ),
    );
  const agents = await db
    .select({ id: schema.agents.id, name: schema.agents.name })
    .from(schema.agents)
    .where(and(eq(schema.agents.agencyId, agencyId), eq(schema.agents.active, true)));
  return { listingId: listing?.id ?? null, agents };
}

/** Public details of the agent responsible for a listing, as an agency site shows them. */
export async function listingAgent(listingId: string) {
  const [row] = await db
    .select({ id: schema.agents.id, name: schema.agents.name, email: schema.agents.email, phone: schema.agents.phone, color: schema.agents.color })
    .from(schema.listings)
    .innerJoin(schema.agents, eq(schema.agents.id, schema.listings.agentId))
    .where(eq(schema.listings.id, listingId));
  return row ?? null;
}

/** Agency behind a valuation report link. */
export async function valuationAgency(token: string) {
  if (!/^[0-9a-f-]{36}$/i.test(token)) return null;
  const [row] = await db
    .select({ agencyId: schema.valuations.agencyId, agencyName: schema.organization.name, branding: schema.agencySettings.branding })
    .from(schema.valuations)
    .innerJoin(schema.organization, eq(schema.organization.id, schema.valuations.agencyId))
    .leftJoin(schema.agencySettings, eq(schema.agencySettings.agencyId, schema.valuations.agencyId))
    .where(eq(schema.valuations.token, token));
  return row ?? null;
}
