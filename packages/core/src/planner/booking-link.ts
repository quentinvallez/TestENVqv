import { and, eq, schema } from "@viewing/db";
import type { ToolContext } from "../tool";
import { sameSite } from "../website/extract";

/** The script counts as live on the agency's site when it ran there this recently. */
const LIVE_FOR_MS = 30 * 24 * 60 * 60 * 1000;

/** Opens the listing's page on the agency's own site at the booking calendar (widget.js scrolls to it or opens the panel). */
export const WEBSITE_BOOKING_HASH = "#viewing-booking";

/** Pure: the website address to book a listing on, or null when our own booking page should be used. */
export function websiteBookingUrl(
  listingWebsiteUrl: string | null | undefined,
  seen: { lastAt: string; url: string } | null | undefined,
  options: { now?: Date; bookingLauncher?: boolean } = {},
): string | null {
  if (!listingWebsiteUrl || !seen || options.bookingLauncher === false) return null;
  if ((options.now ?? new Date()).getTime() - new Date(seen.lastAt).getTime() > LIVE_FOR_MS) return null;
  if (!sameSite(seen.url, listingWebsiteUrl)) return null;
  return `${listingWebsiteUrl.split("#")[0]}${WEBSITE_BOOKING_HASH}`;
}

/**
 * Where a client books this listing: its page on the agency's website when our
 * widget runs there, else our own booking page (`/book/<id>`, made absolute by the caller).
 */
export async function bookingUrl(ctx: ToolContext, listingId: string): Promise<{ url: string; onWebsite: boolean }> {
  const [row] = await ctx.db
    .select({ websiteUrl: schema.listings.websiteUrl, widget: schema.agencySettings.widget })
    .from(schema.listings)
    .leftJoin(schema.agencySettings, eq(schema.agencySettings.agencyId, schema.listings.agencyId))
    .where(and(eq(schema.listings.agencyId, ctx.agencyId), eq(schema.listings.id, listingId)));
  const site = websiteBookingUrl(row?.websiteUrl, row?.widget?.seen, { bookingLauncher: row?.widget?.bookingLauncher });
  return site ? { url: site, onWebsite: true } : { url: `/book/${listingId}`, onWebsite: false };
}
