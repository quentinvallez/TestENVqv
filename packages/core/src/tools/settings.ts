import { eq, schema } from "@viewing/db";
import { z } from "zod";
import { recordEvent } from "../events";
import { defineTool } from "../tool";
import { normalizeUrl, sameSite } from "../website/extract";
import { brandColor, siteBuilder } from "../website/look";
import { SiteReader } from "../website/reader";
import { websiteFromInput } from "./website";

const { agencySettings } = schema;

export const getWidgetSettings = defineTool({
  name: "settings_get_widget",
  description: "What the website script shows on the agency's site besides the placeholders, such as the floating valuation button.",
  mutates: false,
  input: z.object({}),
  run: async (ctx) => {
    const [row] = await ctx.db
      .select({ widget: agencySettings.widget, websiteUrl: agencySettings.websiteUrl, branding: agencySettings.branding })
      .from(agencySettings)
      .where(eq(agencySettings.agencyId, ctx.agencyId));
    const seen = row?.widget.seen ?? null;
    return {
      valuationLauncher: row?.widget.valuationLauncher ?? true,
      bookingLauncher: row?.widget.bookingLauncher ?? true,
      websiteUrl: row?.websiteUrl ?? null,
      brandColor: row?.branding.primaryColor ?? null,
      siteBuilder: row?.widget.siteBuilder ?? null,
      /** The install check: where the script last ran, and whether that is the agency's own website (where booking works). */
      seen: seen && { ...seen, onWebsite: Boolean(row?.websiteUrl && sameSite(seen.url, row.websiteUrl)) },
    };
  },
});

export const updateWidgetSettings = defineTool({
  name: "settings_update_widget",
  description: "Turn the floating buttons on the agency's website on or off: the valuation on every page, and booking on listing pages found by the listing import.",
  mutates: true,
  input: z.object({ valuationLauncher: z.boolean().optional(), bookingLauncher: z.boolean().optional() }),
  run: async (ctx, input) => {
    const [row] = await ctx.db.select({ widget: agencySettings.widget }).from(agencySettings).where(eq(agencySettings.agencyId, ctx.agencyId));
    const widget = { ...row?.widget, ...Object.fromEntries(Object.entries(input).filter(([, v]) => v !== undefined)) };
    await ctx.db
      .insert(agencySettings)
      .values({ agencyId: ctx.agencyId, widget })
      .onConflictDoUpdate({ target: agencySettings.agencyId, set: { widget } });
    await recordEvent(ctx, { type: "settings.widget_updated", subjectType: "agency", subjectId: ctx.agencyId, data: widget });
    return widget;
  },
});

/** How often a sighting of the script is written down; it runs on every page view of the agency's site. */
const SEEN_EVERY_MS = 10 * 60 * 1000;

export const noteWidgetSeen = defineTool({
  name: "widget_note_seen",
  description: "Note that the website script ran on a page, for the install check. Called by the script's own requests, at most every few minutes per agency.",
  mutates: true,
  input: z.object({ url: z.string().min(4).max(2000) }),
  run: async (ctx, input) => {
    const url = normalizeUrl(input.url);
    if (!url || !/^https?:/i.test(url)) return { noted: false };
    const [row] = await ctx.db.select({ widget: agencySettings.widget }).from(agencySettings).where(eq(agencySettings.agencyId, ctx.agencyId));
    const previous = row?.widget.seen;
    const now = new Date();
    const sameHost = previous && new URL(previous.url).host === new URL(url).host;
    if (previous && sameHost && now.getTime() - new Date(previous.lastAt).getTime() < SEEN_EVERY_MS) return { noted: false };
    const seen = { firstAt: sameHost ? previous.firstAt : now.toISOString(), lastAt: now.toISOString(), url };
    const widget = { ...row?.widget, seen };
    await ctx.db.insert(agencySettings).values({ agencyId: ctx.agencyId, widget }).onConflictDoUpdate({ target: agencySettings.agencyId, set: { widget } });
    // An event the first time the script shows up on a site, not on every page view.
    if (!sameHost) await recordEvent(ctx, { type: "widget.installed", subjectType: "agency", subjectId: ctx.agencyId, data: { url } });
    return { noted: true };
  },
});

export const readWebsiteLook = defineTool({
  name: "settings_read_website",
  description:
    "Read the agency's home page once at setup: its brand colour (used for the floating buttons when none is set yet) and the system the site is built with (for the install guide). Saves the website address when one is given.",
  mutates: true,
  input: z.object({ websiteUrl: z.string().min(4).optional() }),
  run: async (ctx, input) => {
    const [row] = await ctx.db
      .select({ websiteUrl: agencySettings.websiteUrl, branding: agencySettings.branding, widget: agencySettings.widget })
      .from(agencySettings)
      .where(eq(agencySettings.agencyId, ctx.agencyId));
    const site = input.websiteUrl ? websiteFromInput(input.websiteUrl) : row?.websiteUrl;
    if (!site) throw new Error("Set the agency's website address first");
    // Only its home page, as robots.txt allows.
    const reader = await SiteReader.open(site);
    const home = await reader.read(site);
    if (!("html" in home) || home.status >= 400) {
      const reason = "error" in home ? home.error : `the site answered ${home.status}`;
      throw new Error(`Couldn't read ${new URL(site).host}: ${reason}`);
    }
    const colour = brandColor(home.html);
    const builder = siteBuilder(home.html);
    // A colour someone chose stays; one we read earlier is replaced when the site changed.
    const keepColour = row?.branding.primaryColor && !row.branding.detectedFrom;
    const branding = keepColour || !colour ? (row?.branding ?? {}) : { ...row?.branding, primaryColor: colour, detectedFrom: site };
    const widget = { ...row?.widget, siteBuilder: builder ?? undefined };
    await ctx.db
      .insert(agencySettings)
      .values({ agencyId: ctx.agencyId, websiteUrl: site, branding, widget })
      .onConflictDoUpdate({ target: agencySettings.agencyId, set: { websiteUrl: site, branding, widget } });
    await recordEvent(ctx, { type: "settings.website_read", subjectType: "agency", subjectId: ctx.agencyId, data: { site, brandColor: branding.primaryColor ?? null, siteBuilder: builder } });
    return { websiteUrl: site, brandColor: branding.primaryColor ?? null, colourFromSite: !keepColour && Boolean(colour), siteBuilder: builder };
  },
});
