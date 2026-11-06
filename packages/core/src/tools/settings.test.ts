import { db, eq, newId, schema } from "@viewing/db";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { tools } from "../registry";
import { runTool, type ToolContext } from "../tool";
import { crawlPace } from "../website/reader";

// The agency's home page served from memory instead of the network.
const site = new Map<string, { status: number; html: string }>();
vi.mock("../website/fetch", () => ({
  FetchError: class extends Error {},
  fetchSitePage: async (url: string) => {
    const page = site.get(url.replace(/\/$/, ""));
    return page ? { url, ...page } : { url, status: 404, html: "Not found" };
  },
}));

describe.skipIf(!process.env.DATABASE_URL)("setting up the agency's website", () => {
  const agencyId = newId("org");
  const ctx: ToolContext = { db, agencyId, actor: { type: "user", id: null } };
  const home = "https://www.immo-look.be";

  beforeAll(async () => {
    crawlPace.minDelayMs = 0;
    await db.insert(schema.organization).values({ id: agencyId, name: "Immo Look", slug: agencyId, createdAt: new Date() });
    site.set(`${home}/robots.txt`, { status: 200, html: "User-agent: *\nAllow: /" });
    site.set(home, { status: 200, html: `<head><meta name="theme-color" content="#1e3a31"><link href="/wp-content/themes/x.css"></head>` });
  });
  afterAll(async () => {
    await db.delete(schema.organization).where(eq(schema.organization.id, agencyId));
  });

  it("reads the brand colour and the site's builder from the home page, and saves the address", async () => {
    const look = await runTool(tools.readWebsiteLook, ctx, { websiteUrl: "www.immo-look.be" });
    expect(look).toMatchObject({ brandColor: "#1e3a31", colourFromSite: true, siteBuilder: "wordpress" });
    const settings = await runTool(tools.getWidgetSettings, ctx, {});
    expect(settings).toMatchObject({ websiteUrl: `${home}/`, brandColor: "#1e3a31", siteBuilder: "wordpress", seen: null });
  });

  it("keeps a colour the agency chose itself", async () => {
    await db.update(schema.agencySettings).set({ branding: { primaryColor: "#aa0000" } }).where(eq(schema.agencySettings.agencyId, agencyId));
    const look = await runTool(tools.readWebsiteLook, ctx, {});
    expect(look).toMatchObject({ brandColor: "#aa0000", colourFromSite: false });
  });

  it("notes where the script runs, once every few minutes, and whether that is the agency's website", async () => {
    expect(await runTool(tools.noteWidgetSeen, ctx, { url: `${home}/pand/villa` })).toEqual({ noted: true });
    expect(await runTool(tools.noteWidgetSeen, ctx, { url: `${home}/contact` })).toEqual({ noted: false });
    let settings = await runTool(tools.getWidgetSettings, ctx, {});
    expect(settings.seen).toMatchObject({ url: `${home}/pand/villa`, onWebsite: true });

    // A copy of the site on another address (a test deployment) is noted at once, and isn't where booking works.
    expect(await runTool(tools.noteWidgetSeen, ctx, { url: "https://immo-look.vercel.app/" })).toEqual({ noted: true });
    settings = await runTool(tools.getWidgetSettings, ctx, {});
    expect(settings.seen).toMatchObject({ url: "https://immo-look.vercel.app/", onWebsite: false });
    const events = await db.select().from(schema.events).where(eq(schema.events.agencyId, agencyId));
    expect(events.filter((e) => e.type === "widget.installed")).toHaveLength(2);
  });
});
