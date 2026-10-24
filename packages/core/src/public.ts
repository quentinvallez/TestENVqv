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
