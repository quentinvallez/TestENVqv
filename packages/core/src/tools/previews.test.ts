import { and, db, eq, newId, schema } from "@viewing/db";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { previewByToken, publicContext } from "../public";
import { tools } from "../registry";
import { runTool, type ToolContext } from "../tool";
import { crawlPace } from "../website/reader";

// A prospect agency's website served from memory instead of the network.
const site = new Map<string, { status: number; html: string; framing?: { xFrameOptions: string | null; contentSecurityPolicy: string | null } }>();
vi.mock("../website/fetch", () => ({
  FetchError: class extends Error {},
  fetchSitePage: async (url: string) => {
    const page = site.get(url.replace(/\/$/, ""));
    return page ? { url, ...page } : { url, status: 404, html: "Not found" };
  },
}));

const listingPage = (o: { title: string; price: string; address: string; agent: string; status?: string }) => `<html><head><meta property="og:image" content="https://www.immo-prospect.be/foto/1.jpg"></head><body>
<h1>${o.title}</h1>${o.status ? `<p class="status">${o.status}</p>` : ""}
<dl><dt>Prijs</dt><dd>${o.price}</dd><dt>Adres</dt><dd>${o.address}</dd>
<dt>Slaapkamers</dt><dd>3</dd><dt>Bewoonbare oppervlakte</dt><dd>160 m²</dd><dt>EPC</dt><dd>180 kWh/m²</dd></dl>
<p>Uw contactpersoon: ${o.agent}</p></body></html>`;

describe.skipIf(!process.env.DATABASE_URL)("widget previews", () => {
  const agencyId = newId("org");
  const otherId = newId("org");
  const ctx: ToolContext = { db, agencyId, actor: { type: "user", id: null } };
  const home = "https://www.immo-prospect.be";
  const houseUrl = `${home}/aanbod/detail/7900001/te-koop-woning-berchem`;
  const soldUrl = `${home}/aanbod/detail/7900002/te-koop-appartement-gent`;

  beforeAll(async () => {
    crawlPace.minDelayMs = 0;
    await db.insert(schema.organization).values([
      { id: agencyId, name: "Our sales", slug: agencyId, createdAt: new Date() },
      { id: otherId, name: "Other agency", slug: otherId, createdAt: new Date() },
    ]);
    site.set(`${home}/robots.txt`, { status: 200, html: "User-agent: *\nAllow: /" });
    site.set(home, {
      status: 200,
      html: `<html lang="nl"><head><title>Immo Prospect | Makelaar in Antwerpen</title><meta name="theme-color" content="#0a6e4f"></head><body><a href="/aanbod/kopen">Te koop</a><a href="/verkocht">Verkocht</a></body></html>`,
      framing: { xFrameOptions: "SAMEORIGIN", contentSecurityPolicy: null },
    });
    site.set(`${home}/aanbod/kopen`, { status: 200, html: `<a href="${houseUrl}">Huis</a><a href="${soldUrl}">Appartement</a>` });
    site.set(houseUrl, { status: 200, html: listingPage({ title: "Ruime woning te koop in Berchem", price: "€ 495.000", address: "Statiestraat 10, 2600 Berchem", agent: "Sofie Peeters" }) });
    site.set(soldUrl, { status: 200, html: listingPage({ title: "Appartement te koop in Gent", price: "€ 289.000", address: "Kouter 5, 9000 Gent", agent: "Jan Nieuwe", status: "Verkocht" }) });
  });
  afterAll(async () => {
    await db.delete(schema.organization).where(eq(schema.organization.id, agencyId));
    await db.delete(schema.organization).where(eq(schema.organization.id, otherId));
  });

  it("reads the prospect's site into a preview link without making an agency or listings", async () => {
    const made = await runTool(tools.createWidgetPreview, ctx, { website: "www.immo-prospect.be/aanbod" });
    expect(made.listings).toBe(1);
    const preview = await previewByToken(made.token);
    expect(preview).toMatchObject({ agencyId, name: "Immo Prospect", brandColor: "#0a6e4f", language: "nl", homeFramable: false, listingFramable: true, homeShot: null, source: "back_office" });
    // Only what can be booked: the sold flat is left out.
    expect(preview!.listings).toEqual([
      expect.objectContaining({ url: houseUrl, street: "Statiestraat", houseNumber: "10", city: "Berchem", price: 495000, agentName: "Sofie Peeters", photo: "https://www.immo-prospect.be/foto/1.jpg", status: "active" }),
    ]);
    const listings = await db.select().from(schema.listings).where(eq(schema.listings.agencyId, agencyId));
    expect(listings).toHaveLength(0);
    const [event] = await db.select().from(schema.events).where(and(eq(schema.events.agencyId, agencyId), eq(schema.events.type, "preview.created")));
    expect(event?.subjectId).toBe(made.id);
  });

  it("gives the same link when the public form asks for the same site again", async () => {
    const first = await runTool(tools.createWidgetPreview, publicContext(agencyId), { website: "https://www.immo-prospect.be/", source: "public", email: "kantoor@immo-prospect.be" });
    const again = await runTool(tools.createWidgetPreview, publicContext(agencyId), { website: "www.immo-prospect.be", source: "public", email: "kantoor@immo-prospect.be" });
    expect(again).toMatchObject({ id: first.id, reused: true });
    const list = await runTool(tools.listWidgetPreviews, ctx, {});
    expect(list).toHaveLength(2);
    expect(list[0]).toMatchObject({ source: "public", email: "kantoor@immo-prospect.be", listingCount: 1, pictures: false });
  });

  it("counts openings and tries at booking, only within the agency", async () => {
    const [preview] = await runTool(tools.listWidgetPreviews, ctx, {});
    expect(await runTool(tools.noteWidgetPreview, publicContext(otherId), { previewId: preview!.id, kind: "view" })).toEqual({ ok: false });
    await runTool(tools.noteWidgetPreview, publicContext(agencyId), { previewId: preview!.id, kind: "view" });
    await runTool(tools.noteWidgetPreview, publicContext(agencyId), { previewId: preview!.id, kind: "view" });
    await runTool(tools.noteWidgetPreview, publicContext(agencyId), { previewId: preview!.id, kind: "demo_booking" });
    const [after] = await runTool(tools.listWidgetPreviews, ctx, {});
    expect(after).toMatchObject({ views: 2, demoBookings: 1 });
    const opened = await db.select().from(schema.events).where(and(eq(schema.events.agencyId, agencyId), eq(schema.events.type, "preview.opened")));
    expect(opened).toHaveLength(1);
  });

  it("says so when the site has nothing to show, and removes a preview", async () => {
    site.set(`${home}/aanbod/kopen`, { status: 200, html: `<p>Geen panden</p>` });
    await expect(runTool(tools.createWidgetPreview, ctx, { website: "www.immo-prospect.be" })).rejects.toThrow(/no listing/);
    const [preview] = await runTool(tools.listWidgetPreviews, ctx, {});
    expect(await runTool(tools.deleteWidgetPreview, publicContext(otherId), { previewId: preview!.id })).toEqual({ deleted: false });
    expect(await runTool(tools.deleteWidgetPreview, ctx, { previewId: preview!.id })).toEqual({ deleted: true });
    expect(await previewByToken(preview!.token)).toBeNull();
  });
});
