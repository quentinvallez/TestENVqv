import { and, db, eq, newId, schema } from "@viewing/db";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { tools } from "../registry";
import { runTool, type ToolContext } from "../tool";
import { crawlPace } from "../website/reader";

// A small agency website served from memory instead of the network.
const site = new Map<string, { status: number; html: string }>();
const requested: string[] = [];
vi.mock("../website/fetch", () => ({
  FetchError: class extends Error {},
  fetchSitePage: async (url: string) => {
    requested.push(url);
    const page = site.get(url.replace(/\/$/, ""));
    if (!page) return { url, status: 404, html: "Not found" };
    return { url, ...page };
  },
}));

const listingPage = (o: { title: string; price: string; ref: string; address: string; agent: string }) => `<html><body>
<h1>${o.title}</h1>
<dl><dt>Prijs</dt><dd>${o.price}</dd><dt>Referentie</dt><dd>${o.ref}</dd><dt>Adres</dt><dd>${o.address}</dd>
<dt>Slaapkamers</dt><dd>3</dd><dt>Bewoonbare oppervlakte</dt><dd>160 m²</dd><dt>EPC</dt><dd>180 kWh/m²</dd></dl>
<p>Uw contactpersoon: ${o.agent}</p></body></html>`;

describe.skipIf(!process.env.DATABASE_URL)("listings from the agency's website", () => {
  const agencyId = newId("org");
  const ctx: ToolContext = { db, agencyId, actor: { type: "user", id: null } };
  const home = "https://www.immo-test.be";
  const houseUrl = `${home}/aanbod/detail/7900001/te-koop-woning-berchem`;
  const flatUrl = `${home}/aanbod/detail/7900002/te-koop-appartement-gent`;

  beforeAll(async () => {
    crawlPace.minDelayMs = 0;
    await db.insert(schema.organization).values({ id: agencyId, name: "Immo Test", slug: agencyId, createdAt: new Date() });
    await db.insert(schema.agencySettings).values({ agencyId });
    await runTool(tools.seedDemoData, ctx, {});
    site.set(`${home}/robots.txt`, { status: 200, html: `User-agent: *\nSitemap: ${home}/sitemap.xml` });
    site.set(`${home}/sitemap.xml`, { status: 200, html: `<urlset><url><loc>${houseUrl}</loc></url><url><loc>${home}/contact</loc></url></urlset>` });
    site.set(home, { status: 200, html: `<a href="/aanbod/kopen">Te koop</a><a href="/blog/123456-nieuws">Blog</a>` });
    site.set(`${home}/aanbod/kopen`, { status: 200, html: `<a href="${houseUrl}">Huis</a><a href="/aanbod/detail/7900002/te-koop-appartement-gent">Appartement</a>` });
    site.set(houseUrl, { status: 200, html: listingPage({ title: "Ruime woning te koop in Berchem", price: "€ 495.000", ref: "7900001", address: "Statiestraat 10, 2600 Berchem", agent: "Sofie Peeters" }) });
    site.set(flatUrl, { status: 200, html: listingPage({ title: "Appartement te koop in Gent", price: "€ 289.000", ref: "7900002", address: "Kouter 5, 9000 Gent", agent: "Jan Nieuwe" }) });
  });
  afterAll(async () => {
    await db.delete(schema.organization).where(eq(schema.organization.id, agencyId));
  });

  it("finds the listing pages and creates the listings with the agent the page names", async () => {
    const summary = await runTool(tools.importWebsiteListings, ctx, { websiteUrl: "www.immo-test.be", useAi: false, budgetSeconds: 20 });
    expect(summary).toMatchObject({ created: 2, found: 2, pages: 2, failed: 0, remaining: 0 });
    const [house] = await db.select().from(schema.listings).where(and(eq(schema.listings.agencyId, agencyId), eq(schema.listings.reference, "7900001")));
    expect(house).toMatchObject({ status: "active", transaction: "sale", propertyType: "house", price: 495000, street: "Statiestraat", houseNumber: "10", postcode: "2600", city: "Berchem", bedrooms: 3, livingArea: 160, epcScore: 180, websiteUrl: houseUrl });
    const [sofie] = await db.select().from(schema.agents).where(and(eq(schema.agents.agencyId, agencyId), eq(schema.agents.name, "Sofie Peeters")));
    expect(house!.agentId).toBe(sofie!.id);
    const status = await runTool(tools.websiteImportStatus, ctx, {});
    expect(status.websiteUrl).toBe("https://www.immo-test.be/");
    // Jan Nieuwe isn't an agent here yet: he is added from the website, with working hours.
    expect(status.withoutAgent).toBe(0);
    const [jan] = await db.select().from(schema.agents).where(and(eq(schema.agents.agencyId, agencyId), eq(schema.agents.name, "Jan Nieuwe")));
    expect(jan).toMatchObject({ source: "website", email: null });
    const [flat] = await db.select().from(schema.listings).where(and(eq(schema.listings.agencyId, agencyId), eq(schema.listings.reference, "7900002")));
    expect(flat!.agentId).toBe(jan!.id);
    const hours = await db.select().from(schema.availabilityRules).where(eq(schema.availabilityRules.agentId, jan!.id));
    expect(hours).toHaveLength(5);
  });

  it("updates a changed price and archives a listing whose page is gone", async () => {
    site.set(houseUrl, { status: 200, html: listingPage({ title: "Ruime woning te koop in Berchem", price: "€ 475.000", ref: "7900001", address: "Statiestraat 10, 2600 Berchem", agent: "Sofie Peeters" }) });
    site.delete(flatUrl);
    await db.update(schema.websitePages).set({ lastCheckedAt: new Date(Date.now() - 2 * 86400000) }).where(eq(schema.websitePages.agencyId, agencyId));
    const summary = await runTool(tools.importWebsiteListings, ctx, { useAi: false, budgetSeconds: 20 });
    expect(summary).toMatchObject({ created: 0, updated: 1, removed: 1 });
    const rows = await db.select().from(schema.listings).where(and(eq(schema.listings.agencyId, agencyId), eq(schema.listings.reference, "7900001")));
    expect(rows[0]!.price).toBe(475000);
    const [flat] = await db.select().from(schema.listings).where(and(eq(schema.listings.agencyId, agencyId), eq(schema.listings.reference, "7900002")));
    expect(flat!.status).toBe("archived");
  });

  it("reads a page a visitor opened, but only on the agency's own site", async () => {
    const newUrl = `${home}/aanbod/detail/7900003/te-koop-villa-schilde`;
    site.set(newUrl, { status: 200, html: listingPage({ title: "Villa te koop in Schilde", price: "€ 1.150.000", ref: "7900003", address: "Bosweg 2, 2970 Schilde", agent: "Sofie Peeters" }) });
    const result = await runTool(tools.importWebsitePage, ctx, { url: `${newUrl}?utm_source=widget`, useAi: false });
    expect(result).toMatchObject({ status: "created" });
    expect(await runTool(tools.importWebsitePage, ctx, { url: newUrl, useAi: false })).toMatchObject({ status: "skipped", reason: "read recently" });
    expect(await runTool(tools.importWebsitePage, ctx, { url: "https://evil.example/aanbod/detail/7900003/x", useAi: false })).toMatchObject({ status: "skipped" });
  });

  it("doesn't read pages the site's robots.txt disallows, and archives listings read from them before", async () => {
    site.set(`${home}/robots.txt`, { status: 200, html: `User-agent: *\nDisallow: /aanbod/detail/7900003\nSitemap: ${home}/sitemap.xml` });
    site.set(`${home}/sitemap.xml`, { status: 200, html: `<urlset><url><loc>${houseUrl}</loc></url><url><loc>${home}/aanbod/detail/7900003/te-koop-villa-schilde</loc></url></urlset>` });
    await db.update(schema.websitePages).set({ lastCheckedAt: new Date(Date.now() - 2 * 86400000) }).where(eq(schema.websitePages.agencyId, agencyId));
    const summary = await runTool(tools.importWebsiteListings, ctx, { useAi: false, budgetSeconds: 20 });
    expect(summary.blocked).toBeGreaterThanOrEqual(1);
    const [villa] = await db.select().from(schema.listings).where(and(eq(schema.listings.agencyId, agencyId), eq(schema.listings.reference, "7900003")));
    expect(villa!.status).toBe("archived");
    expect(await runTool(tools.importWebsitePage, ctx, { url: `${home}/aanbod/detail/7900003/villa-schilde-fr`, useAi: false })).toMatchObject({ status: "blocked" });
  });

  it("goes straight to reading while pages found earlier are still waiting", async () => {
    await db.insert(schema.websitePages).values({ agencyId, url: `${home}/aanbod/detail/7900005/te-koop-huis-mortsel` });
    requested.length = 0;
    await runTool(tools.importWebsiteListings, ctx, { useAi: false, budgetSeconds: 20 });
    expect(requested.filter((url) => url.endsWith("sitemap.xml"))).toHaveLength(0);
    expect(requested).toContain(`${home}/aanbod/detail/7900005/te-koop-huis-mortsel`);
  });

  it("archives a listing whose page stays up but says it is no longer online", async () => {
    site.set(houseUrl, { status: 200, html: `<html><body><h1>Ruime woning te koop in Berchem</h1><p>Helaas staat dit zoekertje niet meer online.</p></body></html>` });
    await db.update(schema.websitePages).set({ lastCheckedAt: new Date(Date.now() - 2 * 86400000) }).where(eq(schema.websitePages.agencyId, agencyId));
    const summary = await runTool(tools.importWebsiteListings, ctx, { useAi: false, budgetSeconds: 20 });
    expect(summary.removed).toBeGreaterThanOrEqual(1);
    const [house] = await db.select().from(schema.listings).where(and(eq(schema.listings.agencyId, agencyId), eq(schema.listings.reference, "7900001")));
    expect(house!.status).toBe("archived");
    const status = await runTool(tools.websiteImportStatus, ctx, {});
    expect(status.pageCounts.gone).toBeGreaterThanOrEqual(1);
  });

  it("leaves listings that are sold, rented or under option out of the list", async () => {
    const soldUrl = `${home}/aanbod/detail/7900006/verkocht-woning-edegem`;
    site.set(soldUrl, { status: 200, html: listingPage({ title: "Verkocht: woning in Edegem", price: "€ 395.000", ref: "7900006", address: "Kerkplein 1, 2650 Edegem", agent: "Sofie Peeters" }) });
    await runTool(tools.importWebsitePage, ctx, { url: soldUrl, useAi: false });
    const [sold] = await db.select().from(schema.listings).where(and(eq(schema.listings.agencyId, agencyId), eq(schema.listings.reference, "7900006")));
    expect(sold!.status).toBe("sold");
    const status = await runTool(tools.websiteImportStatus, ctx, {});
    expect(status.listings.map((l) => l.reference)).not.toContain("7900006");
    expect(status.pageCounts.offMarket).toBeGreaterThanOrEqual(1);
  });

  it("drafts a cancellation for planned viewings when a listing is sold, and cancels the viewing on approval", async () => {
    const url = `${home}/aanbod/detail/7900007/te-koop-woning-kontich`;
    const page = (title: string) => listingPage({ title, price: "€ 450.000", ref: "7900007", address: "Molenstraat 3, 2550 Kontich", agent: "Sofie Peeters" });
    site.set(url, { status: 200, html: page("Woning te koop in Kontich") });
    await runTool(tools.importWebsitePage, ctx, { url, useAi: false });
    const [listing] = await db.select().from(schema.listings).where(and(eq(schema.listings.agencyId, agencyId), eq(schema.listings.reference, "7900007")));
    const [agent] = await db.select().from(schema.agents).where(and(eq(schema.agents.agencyId, agencyId), eq(schema.agents.name, "Sofie Peeters")));
    const [contact] = await db.insert(schema.contacts).values({ agencyId, firstName: "Lien", email: "lien@example.com", language: "nl" }).returning();
    const startsAt = new Date(Date.now() + 3 * 86400000);
    const [viewing] = await db
      .insert(schema.appointments)
      .values({ agencyId, agentId: agent!.id, listingId: listing!.id, contactId: contact!.id, startsAt, endsAt: new Date(startsAt.getTime() + 1800000) })
      .returning();

    site.set(url, { status: 200, html: page("Verkocht: woning in Kontich") });
    await db.update(schema.websitePages).set({ lastCheckedAt: new Date(Date.now() - 2 * 86400000) }).where(eq(schema.websitePages.agencyId, agencyId));
    await runTool(tools.importWebsitePage, ctx, { url, useAi: false });

    const drafts = await db.select().from(schema.proposals).where(and(eq(schema.proposals.agencyId, agencyId), eq(schema.proposals.kind, "off_market")));
    expect(drafts).toHaveLength(1);
    expect(String(drafts[0]!.input.body)).toContain("verkocht");
    const [stillPlanned] = await db.select().from(schema.appointments).where(eq(schema.appointments.id, viewing!.id));
    expect(stillPlanned!.status).toBe("scheduled");

    await runTool(tools.decideProposal, ctx, { proposalId: drafts[0]!.id, decision: "approved" });
    const [cancelled] = await db.select().from(schema.appointments).where(eq(schema.appointments.id, viewing!.id));
    expect(cancelled!.status).toBe("cancelled");
  });

  it("finds the units of new-build projects through the project pages", async () => {
    const project = `${home}/nieuwbouw/aalst/hof-ten-berge`;
    const unit = `${project}/nieuwbouwwoning-met-3-slaapkamers/7946219`;
    site.set(home, { status: 200, html: `<a href="/aanbod/kopen">Te koop</a><a href="/nieuwbouw">Nieuwbouw</a>` });
    site.set(`${home}/nieuwbouw`, { status: 200, html: `<a href="${project}">Hof ten Berge</a>` });
    site.set(project, { status: 200, html: `<table><tr><td><a href="${unit}">A1</a></td><td>€ 389.000</td><td>Beschikbaar</td></tr></table>` });
    site.set(unit, { status: 200, html: listingPage({ title: "Nieuwbouwwoning met 3 slaapkamers", price: "€ 389.000", ref: "7946219", address: "Hof ten Berge 1, 9300 Aalst", agent: "Sofie Peeters" }) });
    await db.update(schema.agencySettings).set({ websiteSync: {} }).where(eq(schema.agencySettings.agencyId, agencyId));
    await runTool(tools.importWebsiteListings, ctx, { useAi: false, budgetSeconds: 20 });
    const [found] = await db.select().from(schema.listings).where(and(eq(schema.listings.agencyId, agencyId), eq(schema.listings.reference, "7946219")));
    expect(found).toMatchObject({ status: "active", city: "Aalst", price: 389000 });
  });

  it("goes back to the demo data: the import and its agents are gone, the demo is loaded again", async () => {
    const result = await runTool(tools.resetToDemoData, ctx, {});
    expect(result).toMatchObject({ seeded: true });
    const pages = await db.select().from(schema.websitePages).where(eq(schema.websitePages.agencyId, agencyId));
    expect(pages).toHaveLength(0);
    const fromWebsite = await db.select().from(schema.agents).where(and(eq(schema.agents.agencyId, agencyId), eq(schema.agents.source, "website")));
    expect(fromWebsite).toHaveLength(0);
    const imported = await db.select().from(schema.listings).where(and(eq(schema.listings.agencyId, agencyId), eq(schema.listings.reference, "7900001")));
    expect(imported).toHaveLength(0);
    const [settings] = await db.select().from(schema.agencySettings).where(eq(schema.agencySettings.agencyId, agencyId));
    expect(settings!.websiteUrl).toBeNull();
  });
});

describe.skipIf(!process.env.DATABASE_URL)("every listing on the site, each counted once", () => {
  const agencyId = newId("org");
  const ctx: ToolContext = { db, agencyId, actor: { type: "user", id: null } };
  const home = "https://www.immo-zone-test.be";
  const card = (n: number) => `${home}/te-koop/aalst/woning-${n}/${97000 + n}`;
  const detail = (n: number, badge = "") =>
    listingPage({ title: `${badge}Woning ${n} te koop in Aalst`, price: `€ ${300 + n}.000`, ref: String(3628100 + (n % 5)), address: `Kerkstraat ${n}, 9300 Aalst`, agent: "Sofie Peeters" });

  async function importAll() {
    for (let run = 0; run < 20; run++) {
      const result = await runTool(tools.importWebsiteListings, ctx, { useAi: false, budgetSeconds: 20 });
      if (!result.searching && !result.remaining) return result;
    }
    throw new Error("The import didn't finish");
  }

  beforeAll(async () => {
    crawlPace.minDelayMs = 0;
    await db.insert(schema.organization).values({ id: agencyId, name: "Immo Zone Test", slug: agencyId, createdAt: new Date() });
    await db.insert(schema.agencySettings).values({ agencyId, websiteUrl: `${home}/` });
    site.set(`${home}/robots.txt`, { status: 200, html: `User-agent: *` });
    site.set(home, { status: 200, html: `<a href="/kopen">Te koop</a>` });
    // 24 listings on three pages; two are under option (one says so only on its card), one sold. Their pages show only
    // five different references.
    const overview = (from: number, to: number, next?: number) =>
      `<h2>24 resultaten</h2>${Array.from({ length: to - from + 1 }, (_, i) => `<div class="card"><a href="${card(from + i)}">Bekijk</a>${from + i === 22 ? `<span class="badge">Optie</span>` : ""}</div>`).join("")}${next ? `<a href="/kopen?page=${next}">${next}</a>` : ""}`;
    site.set(`${home}/kopen`, { status: 200, html: overview(1, 10, 2) });
    site.set(`${home}/kopen?page=2`, { status: 200, html: overview(11, 20, 3) });
    site.set(`${home}/kopen?page=3`, { status: 200, html: overview(21, 24) });
    for (let n = 1; n <= 24; n++) site.set(card(n), { status: 200, html: detail(n, n === 23 ? "In optie: " : n === 24 ? "Verkocht: " : "") });
    // An old listing the sitemap still lists, whose page still shows it, but that no overview shows any more.
    site.set(`${home}/sitemap.xml`, { status: 200, html: `<urlset><url><loc>${card(99)}</loc></url></urlset>` });
    site.set(card(99), { status: 200, html: detail(99) });
  });
  afterAll(async () => {
    await db.delete(schema.organization).where(eq(schema.organization.id, agencyId));
  });

  it("finds every listing through the pages of the overview, also when pages show the same reference, and counts what the cards say", async () => {
    await importAll();
    const rows = await db.select().from(schema.listings).where(eq(schema.listings.agencyId, agencyId));
    expect(rows).toHaveLength(24);
    expect(new Set(rows.map((l) => l.reference)).size).toBe(24);
    const status = await runTool(tools.websiteImportStatus, ctx, {});
    expect(status.searching).toBe(false);
    expect(status.overviews).toEqual([
      expect.objectContaining({ url: `${home}/kopen`, stated: 24, found: 24, complete: true, counts: expect.objectContaining({ onOffer: 21, underOffer: 2, soldOrRented: 1, toRead: 0 }) }),
    ]);
    expect(status.listings).toHaveLength(21);
    const [old] = await db.select().from(schema.websitePages).where(and(eq(schema.websitePages.agencyId, agencyId), eq(schema.websitePages.url, card(99))));
    expect(old).toMatchObject({ kind: "gone", listingId: null });
  });

  it("splits listings an earlier import merged because their pages showed the same reference", async () => {
    const [two] = await db.select().from(schema.websitePages).where(and(eq(schema.websitePages.agencyId, agencyId), eq(schema.websitePages.url, card(2))));
    const [seven] = await db.select().from(schema.websitePages).where(and(eq(schema.websitePages.agencyId, agencyId), eq(schema.websitePages.url, card(7))));
    // As the old rules left it: page 7 pointing at the listing of page 2, read with older rules.
    await db.delete(schema.listings).where(eq(schema.listings.id, seven!.listingId!));
    await db.update(schema.websitePages).set({ listingId: two!.listingId, contentHash: "v3:old" }).where(eq(schema.websitePages.id, seven!.id));
    await importAll();
    const [after] = await db.select().from(schema.websitePages).where(eq(schema.websitePages.id, seven!.id));
    expect(after!.listingId).not.toBe(two!.listingId);
    const [listing7] = await db.select().from(schema.listings).where(eq(schema.listings.id, after!.listingId!));
    const [listing2] = await db.select().from(schema.listings).where(eq(schema.listings.id, two!.listingId!));
    expect(listing7).toMatchObject({ street: "Kerkstraat", houseNumber: "7", websiteUrl: card(7) });
    expect(listing2).toMatchObject({ street: "Kerkstraat", houseNumber: "2", websiteUrl: card(2) });
  });
});
