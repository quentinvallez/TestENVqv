import { randomBytes } from "node:crypto";
import { and, desc, eq, gt, schema, sql } from "@viewing/db";
import { z } from "zod";
import { recordEvent } from "../events";
import { defineTool } from "../tool";
import { openScreenshotter } from "../website/browser";
import { PreviewError, previewSiteFromInput, readPreviewSite } from "../website/preview";
import { SiteReader } from "../website/reader";

/*
 * Widget previews for agencies that aren't clients yet: our booking widget on
 * their own listings, shown on a page of ours that anyone with the link can
 * open until it expires. Nothing is installed on their site.
 */

const { widgetPreviews } = schema;

const DAY = 24 * 3600 * 1000;
/** A preview link works this long. */
const LIFETIME = 30 * DAY;
/** Previews asked for on the public form, per hour, for the whole platform agency. */
const PUBLIC_PER_HOUR = 20;
/** Time to read the site; the pictures, when needed, get what is left of the function's minute. */
const READ_MS = 35_000;
/** The phone the pictures are taken on, as wide as the back office checks (iPhone 14). */
const PHONE_WIDTH = 390;

const newToken = () => randomBytes(18).toString("base64url");

export const createWidgetPreview = defineTool({
  name: "previews_create",
  description:
    "Read a prospect agency's website (home page and a few listings, as robots.txt allows) and make a preview link that shows our booking widget on its own listings. Nothing is put on their site.",
  mutates: true,
  input: z.object({
    website: z.string().min(4).max(300),
    source: z.enum(["back_office", "public"]).default("back_office"),
    email: z.email().max(200).optional(),
  }),
  run: async (ctx, input) => {
    const site = previewSiteFromInput(input.website);
    if (!site) throw new PreviewError("That doesn't look like a website address.");
    const since = new Date(Date.now() - DAY);
    if (input.source === "public") {
      // The same site asked again on the form gets the link it already has.
      const [recent] = await ctx.db
        .select({ id: widgetPreviews.id, token: widgetPreviews.token })
        .from(widgetPreviews)
        .where(and(eq(widgetPreviews.agencyId, ctx.agencyId), eq(widgetPreviews.site, site), eq(widgetPreviews.source, "public"), gt(widgetPreviews.createdAt, since)))
        .limit(1);
      if (recent) return { ...recent, reused: true, listings: null };
      const [{ count }] = (await ctx.db
        .select({ count: sql<number>`count(*)::int` })
        .from(widgetPreviews)
        .where(and(eq(widgetPreviews.agencyId, ctx.agencyId), eq(widgetPreviews.source, "public"), gt(widgetPreviews.createdAt, new Date(Date.now() - 3600 * 1000))))) as [{ count: number }];
      if (count >= PUBLIC_PER_HOUR) throw new PreviewError("Many previews were asked for just now. Please try again in an hour.");
    }

    const started = Date.now();
    const read = await readPreviewSite(site, started + READ_MS);
    if (!read.listings.length) throw new PreviewError("We read the website but found no listing on offer to show the widget on.");

    // Sites that keep themselves out of frames are shown as a picture instead.
    const shots: { homeShot?: string | null; listingShot?: string | null; homeShotPhone?: string | null; listingShotPhone?: string | null; shotError?: string } = {};
    if (!read.homeFramable || !read.listingFramable) {
      const reader = await SiteReader.open(read.site);
      const camera = await openScreenshotter(reader);
      if ("error" in camera) shots.shotError = camera.error;
      else {
        try {
          if (!read.listingFramable) {
            shots.listingShot = await camera.shoot(read.listings[0]!.url);
            shots.listingShotPhone = await camera.shoot(read.listings[0]!.url, PHONE_WIDTH);
          }
          if (!read.homeFramable) {
            shots.homeShot = await camera.shoot(read.site);
            shots.homeShotPhone = await camera.shoot(read.site, PHONE_WIDTH);
          }
        } finally {
          await camera.close();
        }
        if (camera.errors.length) shots.shotError = camera.errors.join(" · ").slice(0, 1000);
      }
    }

    const [row] = await ctx.db
      .insert(widgetPreviews)
      .values({
        agencyId: ctx.agencyId,
        token: newToken(),
        site: read.site,
        name: read.name,
        brandColor: read.brandColor,
        language: read.language,
        homeFramable: read.homeFramable,
        listingFramable: read.listingFramable,
        listings: read.listings,
        ...shots,
        source: input.source,
        email: input.email ?? null,
        expiresAt: new Date(Date.now() + LIFETIME),
      })
      .returning({ id: widgetPreviews.id, token: widgetPreviews.token });
    await recordEvent(ctx, {
      type: "preview.created",
      subjectType: "widget_preview",
      subjectId: row!.id,
      data: { site: read.site, source: input.source, listings: read.listings.length, framed: read.homeFramable && read.listingFramable, pictures: Boolean(shots.homeShot || shots.listingShot), pictureError: shots.shotError ?? null },
    });
    return { ...row!, reused: false, listings: read.listings.length };
  },
});

export const listWidgetPreviews = defineTool({
  name: "previews_list",
  description: "The widget previews the agency made or that prospects asked for, newest first, with how often each was opened.",
  mutates: false,
  input: z.object({ limit: z.number().int().min(1).max(200).default(50) }),
  run: async (ctx, input) =>
    ctx.db
      .select({
        id: widgetPreviews.id,
        token: widgetPreviews.token,
        site: widgetPreviews.site,
        name: widgetPreviews.name,
        brandColor: widgetPreviews.brandColor,
        source: widgetPreviews.source,
        email: widgetPreviews.email,
        views: widgetPreviews.views,
        demoBookings: widgetPreviews.demoBookings,
        listingCount: sql<number>`jsonb_array_length(${widgetPreviews.listings})::int`,
        pictures: sql<boolean>`(${widgetPreviews.homeShot} is not null or ${widgetPreviews.listingShot} is not null)`,
        framed: sql<boolean>`(${widgetPreviews.homeFramable} and ${widgetPreviews.listingFramable})`,
        shotError: widgetPreviews.shotError,
        lastViewedAt: widgetPreviews.lastViewedAt,
        expiresAt: widgetPreviews.expiresAt,
        createdAt: widgetPreviews.createdAt,
      })
      .from(widgetPreviews)
      .where(eq(widgetPreviews.agencyId, ctx.agencyId))
      .orderBy(desc(widgetPreviews.createdAt))
      .limit(input.limit),
});

export const noteWidgetPreview = defineTool({
  name: "previews_note",
  description: "Count that a preview was opened, or that someone tried booking in it (nothing is booked).",
  mutates: true,
  input: z.object({ previewId: z.string(), kind: z.enum(["view", "demo_booking"]) }),
  run: async (ctx, input) => {
    const counter = input.kind === "view" ? { views: sql`${widgetPreviews.views} + 1`, lastViewedAt: new Date() } : { demoBookings: sql`${widgetPreviews.demoBookings} + 1` };
    const [row] = await ctx.db
      .update(widgetPreviews)
      .set(counter)
      .where(and(eq(widgetPreviews.agencyId, ctx.agencyId), eq(widgetPreviews.id, input.previewId)))
      .returning({ views: widgetPreviews.views, site: widgetPreviews.site });
    if (!row) return { ok: false };
    // The first opening and every try at booking are worth seeing in the activity; later openings only count.
    if (input.kind === "demo_booking" || row.views === 1) {
      await recordEvent(ctx, { type: input.kind === "view" ? "preview.opened" : "preview.demo_booked", subjectType: "widget_preview", subjectId: input.previewId, data: { site: row.site } });
    }
    return { ok: true };
  },
});

export const deleteWidgetPreview = defineTool({
  name: "previews_delete",
  description: "Remove a widget preview; its link stops working.",
  mutates: true,
  input: z.object({ previewId: z.string() }),
  run: async (ctx, input) => {
    const [row] = await ctx.db
      .delete(widgetPreviews)
      .where(and(eq(widgetPreviews.agencyId, ctx.agencyId), eq(widgetPreviews.id, input.previewId)))
      .returning({ id: widgetPreviews.id, site: widgetPreviews.site });
    if (row) await recordEvent(ctx, { type: "preview.deleted", subjectType: "widget_preview", subjectId: row.id, data: { site: row.site } });
    return { deleted: Boolean(row) };
  },
});
