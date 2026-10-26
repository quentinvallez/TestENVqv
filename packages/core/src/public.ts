import { and, db, eq, inArray, schema } from "@viewing/db";
import type { ToolContext } from "./tool";
import { looksLikeListingUrl, normalizeUrl, sameSite } from "./website/extract";

/*
 * Lookups for pages anyone can open without logging in: the booking page of a
 * listing and the manage link in a confirmation. They resolve which agency a
 * request belongs to; everything after that goes through tools as usual.
 */

/** A context for actions taken by a client (not a logged-in user) of an agency. */
export function publicContext(agencyId: string): ToolContext {
  return { db, agencyId, actor: { type: "contact", id: null } };
}

/** A context for work the platform does on its own for an agency, such as reading its website. */
export function systemContext(agencyId: string): ToolContext {
  return { db, agencyId, actor: { type: "system", id: null } };
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

function otherWww(url: string) {
  const parsed = new URL(url);
  parsed.hostname = parsed.hostname.startsWith("www.") ? parsed.hostname.slice(4) : `www.${parsed.hostname}`;
  return parsed.toString();
}

/** What widget.js shows on an agency's site on its own, without a placeholder. */
export async function widgetConfig(agencyId: string) {
  const [row] = await db
    .select({ name: schema.organization.name, branding: schema.agencySettings.branding, widget: schema.agencySettings.widget })
    .from(schema.organization)
    .leftJoin(schema.agencySettings, eq(schema.agencySettings.agencyId, schema.organization.id))
    .where(eq(schema.organization.id, agencyId));
  if (!row) return null;
  return {
    brand: row.branding?.primaryColor ?? null,
    valuationLauncher: row.widget?.valuationLauncher ?? true,
    bookingLauncher: row.widget?.bookingLauncher ?? true,
  };
}

/**
 * The listing behind a page of the agency's website, found by its address
 * (pages the importer read), plus the agents the widget looks for on the page.
 * `unknown` is true for a page on the agency's site we haven't read yet and
 * that looks like a listing; the caller has it read in the background.
 */
export async function widgetPage(agencyId: string, pageUrl: string) {
  const url = normalizeUrl(pageUrl);
  const [settings] = await db.select({ websiteUrl: schema.agencySettings.websiteUrl }).from(schema.agencySettings).where(eq(schema.agencySettings.agencyId, agencyId));
  if (!url || !settings?.websiteUrl || !sameSite(url, settings.websiteUrl)) return { listingId: null, agents: [], unknown: false };
  const [page] = await db
    .select({ kind: schema.websitePages.kind, listingId: schema.listings.id, status: schema.listings.status })
    .from(schema.websitePages)
    .leftJoin(schema.listings, eq(schema.listings.id, schema.websitePages.listingId))
    // The site may be visited with or without "www." while we stored one of the two.
    .where(and(eq(schema.websitePages.agencyId, agencyId), inArray(schema.websitePages.url, [url, otherWww(url)])));
  const bookable = page?.listingId && (page.status === "active" || page.status === "under_offer");
  if (!bookable) return { listingId: null, agents: [], unknown: !page && looksLikeListingUrl(url, settings.websiteUrl) };
  const agents = await db
    .select({ id: schema.agents.id, name: schema.agents.name })
    .from(schema.agents)
    .where(and(eq(schema.agents.agencyId, agencyId), eq(schema.agents.active, true)));
  return { listingId: page.listingId, agents, unknown: false };
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
