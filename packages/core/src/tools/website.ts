import { and, asc, db, eq, inArray, isNull, lt, or, schema, sql } from "@viewing/db";
import type { WebsiteSync } from "@viewing/db/schema";
import { z } from "zod";
import { aiAvailable } from "../ai/client";
import { recordEvent } from "../events";
import { defineTool, type ToolContext } from "../tool";
import { extractWithAi, mergeExtraction } from "../website/ai";
import {
  boilerplateLines,
  extractListing,
  isListingPage,
  isRemovedListingPage,
  looksLikeListingUrl,
  looksLikeOverviewUrl,
  matchAgent,
  missingKeyFacts,
  normalizeUrl,
  pageLinks,
  pageText,
  referenceFromUrl,
  sameSite,
  sitemapEntries,
  textFingerprint,
  type ExtractedListing,
} from "../website/extract";
import { fetchSitePage, type FetchedPage } from "../website/fetch";
import { allowAll, disallowAll, parseRobots, type RobotsPolicy } from "../website/robots";

/*
 * Listings from the agency's own website: we find the listing pages (sitemap,
 * then overview pages), read each one and create or update the listing, with
 * the agent the page names. Pages are remembered in website_pages, so a daily
 * run only re-reads what may have changed and archives listings that vanished.
 */

const { agencySettings, agents, listings, postcodes, websitePages } = schema;

const HOUR = 3600 * 1000;
/** Listing pages are read again at most this often (prices and status change). */
const RECHECK_LISTING = 20 * HOUR;
/** Pages that weren't listings, or failed, are tried again after this. */
const RECHECK_OTHER = 14 * 24 * HOUR;
const RECHECK_ERROR = 24 * HOUR;
/** Sitemaps and overview pages are searched again at most this often while pages are still waiting to be read. */
const REDISCOVER = 20 * HOUR;
/** A page visit reported by the widget triggers a read at most this often. */
const RECHECK_VISIT = 6 * HOUR;
const MAX_SITEMAPS = 12;
const MAX_OVERVIEW_PAGES = 15;
const MAX_NEW_PAGES_PER_RUN = 400;
/** The longest crawl delay we wait for; a site asking more is read at this pace. */
const MAX_DELAY_MS = 60_000;

/** At least this long between two requests to the same site, whatever its robots.txt says. Tests set it to 0. */
export const crawlPace = { minDelayMs: 1000 };

/** Bump when the reading rules change, so listings read with older rules are read again. */
const EXTRACTION_VERSION = "v2";

export const ROBOTS_BLOCKED = "Not allowed by the website's robots.txt";

type PageRow = typeof websitePages.$inferSelect;
type AgentRow = { id: string; name: string };
type PageOutcome = "created" | "updated" | "unchanged" | "removed" | "other" | "failed" | "blocked";

async function settingsRow(ctx: ToolContext) {
  const [row] = await ctx.db.select().from(agencySettings).where(eq(agencySettings.agencyId, ctx.agencyId));
  return row;
}

/** The address an agency types ("dewaele.com/nl") as a full URL. */
export function websiteFromInput(input: string): string | null {
  const trimmed = input.trim();
  return normalizeUrl(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
}

type ReadResult = FetchedPage | { error: string; blocked?: boolean };

/**
 * Reads one site the way its robots.txt asks: only paths it allows for our
 * crawler (or for all crawlers), one request at a time, with the delay it
 * sets between requests. Without a robots.txt everything is allowed; when the
 * file can't be read because the site fails, nothing is (as search engines do).
 */
class SiteReader {
  private lastRequest = 0;
  /** The agency's own details repeated on every page (office address), left out when reading a listing. */
  private boilerplate: Set<string> | null = null;
  private constructor(
    readonly site: string,
    readonly robots: RobotsPolicy,
  ) {}

  static async open(site: string) {
    let robots = allowAll;
    try {
      const file = await fetchSitePage(`${new URL(site).origin}/robots.txt`, site);
      if (file.status === 200) robots = parseRobots(file.html);
      else if (file.status >= 500) robots = disallowAll;
    } catch {
      robots = disallowAll;
    }
    const reader = new SiteReader(site, robots);
    reader.lastRequest = Date.now();
    return reader;
  }

  /** Read from the home page once per run, on first use. */
  async siteBoilerplate(): Promise<Set<string>> {
    if (!this.boilerplate) {
      const home = await this.read(this.site);
      this.boilerplate = "html" in home && home.status < 400 ? boilerplateLines(home.html) : new Set();
    }
    return this.boilerplate;
  }

  get delayMs() {
    return Math.max(crawlPace.minDelayMs, Math.min((this.robots.crawlDelay ?? 0) * 1000, MAX_DELAY_MS));
  }

  /** Whether one more request still fits before the deadline, counting the wait. */
  fits(deadline: number) {
    return Math.max(Date.now(), this.lastRequest + this.delayMs) < deadline;
  }

  async read(url: string): Promise<ReadResult> {
    if (!this.robots.allowed(url)) return { error: ROBOTS_BLOCKED, blocked: true };
    const wait = this.lastRequest + this.delayMs - Date.now();
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
    try {
      return await fetchSitePage(url, this.site, this.robots.allowed);
    } catch (error) {
      return { error: error instanceof Error ? error.message : String(error) };
    } finally {
      this.lastRequest = Date.now();
    }
  }
}

/** Candidate listing URLs: from overview pages linked from the home page, then from sitemaps. */
async function discover(reader: SiteReader, deadline: number): Promise<{ listings: Set<string>; error?: string }> {
  const { site } = reader;
  const found = new Set<string>();
  const origin = new URL(site).origin;

  // Overview pages first: they show what is on offer today, while sitemaps are often stale. They get
  // at most two thirds of the time, so sitemaps still add the listings the overviews don't link.
  const overviewDeadline = Date.now() + (deadline - Date.now()) * (2 / 3);
  const home = await reader.read(site);
  if (!("html" in home)) return { listings: found, error: "blocked" in home ? `${ROBOTS_BLOCKED} (home page)` : `The website could not be read: ${home.error}` };
  if (home.status >= 400) return { listings: found, error: `The website answered with error ${home.status}` };
  const queue = [home];
  const visited = new Set([normalizeUrl(home.url) ?? site]);
  let overviews = 0;
  while (queue.length && reader.fits(overviewDeadline)) {
    const page = queue.shift()!;
    // Shallow overview pages first: "/kopen" lists everything, "/kopen/aalst/huis" a slice.
    const depth = (url: string) => new URL(url).pathname.split("/").filter(Boolean).length;
    const links = pageLinks(page.html, page.url).sort((a, b) => depth(a) - depth(b));
    for (const link of links) {
      if (looksLikeListingUrl(link, site)) found.add(link);
      else if (overviews < MAX_OVERVIEW_PAGES && !visited.has(link) && looksLikeOverviewUrl(link, site) && reader.robots.allowed(link) && reader.fits(overviewDeadline)) {
        visited.add(link);
        overviews++;
        const next = await reader.read(link);
        if ("html" in next && next.status === 200) queue.push(next);
      }
    }
  }

  const sitemapQueue: string[] = [...reader.robots.sitemaps];
  if (!sitemapQueue.length) sitemapQueue.push(`${origin}/sitemap.xml`, `${origin}/sitemap_index.xml`);
  const seenSitemaps = new Set<string>();
  while (sitemapQueue.length && seenSitemaps.size < MAX_SITEMAPS && reader.fits(deadline)) {
    const next = sitemapQueue.shift()!;
    if (seenSitemaps.has(next)) continue;
    seenSitemaps.add(next);
    const page = await reader.read(next);
    if (!("html" in page) || page.status !== 200) continue;
    const entries = sitemapEntries(page.html);
    // Listing sitemaps first: their names usually say so.
    sitemapQueue.push(...entries.sitemaps.sort((a, b) => Number(/propert|listing|pand|bien|estate|detail|aanbod/i.test(b)) - Number(/propert|listing|pand|bien|estate|detail|aanbod/i.test(a))));
    for (const entry of entries.pages) {
      const url = normalizeUrl(entry);
      if (url && looksLikeListingUrl(url, site)) found.add(url);
    }
  }

  return { listings: found };
}

/** Reads one page and creates, updates or archives its listing. */
async function processPage(ctx: ToolContext, reader: SiteReader, page: PageRow, team: AgentRow[], useAi: boolean): Promise<PageOutcome> {
  const { site } = reader;
  const now = new Date();
  const fetched = await reader.read(page.url);
  if ("blocked" in fetched) {
    // The site doesn't want this page read: we stop using what we read from it before.
    await ctx.db.update(websitePages).set({ kind: "error", lastError: fetched.error, lastCheckedAt: now }).where(eq(websitePages.id, page.id));
    return page.listingId ? removePage(ctx, { ...page, kind: "error" }, now, "error") : "blocked";
  }
  if (!("html" in fetched)) {
    await ctx.db.update(websitePages).set({ kind: page.kind === "listing" ? "listing" : "error", lastError: fetched.error, lastCheckedAt: now }).where(eq(websitePages.id, page.id));
    return "failed";
  }
  if (fetched.status === 404 || fetched.status === 410) return removePage(ctx, page, now);
  if (fetched.status >= 400) {
    await ctx.db.update(websitePages).set({ lastError: `HTTP ${fetched.status}`, lastCheckedAt: now, kind: page.kind === "listing" ? "listing" : "error" }).where(eq(websitePages.id, page.id));
    return "failed";
  }
  // Sites often redirect a removed listing to the overview.
  const landed = normalizeUrl(fetched.url) ?? page.url;
  if (landed !== page.url && page.kind === "listing" && !looksLikeListingUrl(landed, site)) return removePage(ctx, page, now);

  const text = pageText(fetched.html);
  // A new version of the rules reads every page again, even when it didn't change.
  const hash = `${EXTRACTION_VERSION}:${textFingerprint(text)}`;
  if (page.kind === "listing" && page.listingId && page.contentHash === hash) {
    await ctx.db.update(websitePages).set({ lastCheckedAt: now, lastError: null }).where(eq(websitePages.id, page.id));
    return "unchanged";
  }

  const read = extractListing(fetched.html, page.url, await reader.siteBoilerplate());
  let listing: ExtractedListing = read.listing;
  let extractedBy: "structured" | "rules" | "ai" = read.structured ? "structured" : "rules";
  // Some sites keep a removed listing's page up with a notice instead of a 404.
  if (isRemovedListingPage(listing, fetched.html)) return removePage(ctx, page, now);
  let isListing = isListingPage(listing, fetched.html);
  const knownAgent = matchAgent(team, listing.agentName, text);
  const missing = missingKeyFacts(listing).filter((field) => !(field === "agentName" && knownAgent));
  if (useAi && aiAvailable() && (isListing || looksLikeListingUrl(page.url, site)) && missing.length > 1) {
    try {
      const ai = await extractWithAi(page.url, text);
      isListing = ai.isListing;
      listing = mergeExtraction(listing, ai.listing);
      extractedBy = "ai";
    } catch (error) {
      console.error(`Claude could not read ${page.url}`, error);
    }
  }
  if (!isListing) {
    await ctx.db.update(websitePages).set({ kind: "other", contentHash: hash, lastCheckedAt: now, lastError: null }).where(eq(websitePages.id, page.id));
    return "other";
  }

  const agent = matchAgent(team, listing.agentName) ?? knownAgent;
  const outcome = await saveListing(ctx, page, listing, agent?.id ?? null, extractedBy);
  await ctx.db
    .update(websitePages)
    .set({ kind: "listing", listingId: outcome.listingId, contentHash: hash, extractedBy, agentName: listing.agentName, lastCheckedAt: now, lastError: null })
    .where(eq(websitePages.id, page.id));
  return outcome.created ? "created" : "updated";
}

async function removePage(ctx: ToolContext, page: PageRow, now: Date, kind: "gone" | "error" = "gone"): Promise<PageOutcome> {
  if (kind === "gone") await ctx.db.update(websitePages).set({ kind: "gone", lastCheckedAt: now, lastError: null }).where(eq(websitePages.id, page.id));
  if (!page.listingId) return "other";
  const [archived] = await ctx.db
    .update(listings)
    .set({ status: "archived" })
    .where(and(eq(listings.agencyId, ctx.agencyId), eq(listings.id, page.listingId), inArray(listings.status, ["draft", "active", "under_offer"])))
    .returning({ id: listings.id, reference: listings.reference });
  if (!archived) return "other";
  await recordEvent(ctx, { type: "listing.removed_from_website", subjectType: "listing", subjectId: archived.id, data: { url: page.url, reference: archived.reference } });
  return "removed";
}

async function saveListing(ctx: ToolContext, page: PageRow, facts: ExtractedListing, agentId: string | null, extractedBy: string) {
  const byPage = page.listingId ? await ctx.db.select().from(listings).where(and(eq(listings.agencyId, ctx.agencyId), eq(listings.id, page.listingId))) : [];
  const byUrl = byPage.length ? byPage : await ctx.db.select().from(listings).where(and(eq(listings.agencyId, ctx.agencyId), eq(listings.websiteUrl, page.url)));
  const reference = (facts.reference ?? referenceFromUrl(page.url) ?? `WEB-${textFingerprint(page.url).slice(0, 8)}`).slice(0, 40);
  const byReference = byUrl.length ? byUrl : await ctx.db.select().from(listings).where(and(eq(listings.agencyId, ctx.agencyId), eq(listings.reference, reference)));
  const existing = byReference[0];

  // Sites that show "street number, city" without a postcode: look the postcode up by town.
  if (!facts.postcode && facts.city) {
    const [known] = await ctx.db
      .select({ postcode: postcodes.postcode })
      .from(postcodes)
      .where(or(sql`lower(${postcodes.locality}) = lower(${facts.city})`, sql`lower(${postcodes.municipality}) = lower(${facts.city})`))
      .orderBy(asc(postcodes.postcode))
      .limit(1);
    if (known) facts = { ...facts, postcode: known.postcode };
  }
  const status = facts.status ?? "active";
  const values = {
    status,
    transaction: facts.transaction ?? existing?.transaction ?? "sale",
    propertyType: facts.propertyType ?? existing?.propertyType ?? "other",
    title: facts.title,
    description: facts.description,
    street: facts.street,
    houseNumber: facts.houseNumber,
    postcode: facts.postcode,
    city: facts.city,
    price: facts.price,
    bedrooms: facts.bedrooms,
    bathrooms: facts.bathrooms,
    livingArea: facts.livingArea,
    plotArea: facts.plotArea,
    epcScore: facts.epcScore,
    epcLabel: facts.epcLabel,
    websiteUrl: page.url,
  };
  // Keep what we had for anything this read of the page didn't find.
  const changes = Object.fromEntries(Object.entries(values).filter(([, v]) => v != null)) as Partial<typeof values>;
  // The address is one fact: a new read replaces all of it, so no part of an older, wrong one stays.
  if (facts.street || facts.city) Object.assign(changes, { street: facts.street, houseNumber: facts.houseNumber, postcode: facts.postcode, city: facts.city });
  const photos = facts.photos.slice(0, 20).map((url) => ({ url }));
  const soldNow = (status === "sold" || status === "rented") && !existing?.soldAt;

  if (existing) {
    // A listing someone archived or marked sold by hand isn't revived by a stale page.
    if (existing.status === "archived" && status === "active") delete changes.status;
    await ctx.db
      .update(listings)
      .set({
        ...changes,
        ...(photos.length ? { photos } : {}),
        ...(agentId && !existing.agentId ? { agentId } : {}),
        ...(soldNow ? { soldAt: new Date() } : {}),
        features: { ...existing.features, source: "website", extractedBy },
      })
      .where(eq(listings.id, existing.id));
    if (existing.status !== status && changes.status) {
      await recordEvent(ctx, { type: "listing.status_changed", subjectType: "listing", subjectId: existing.id, data: { from: existing.status, to: status, source: "website" } });
    }
    return { listingId: existing.id, created: false };
  }

  const [created] = await ctx.db
    .insert(listings)
    .values({
      ...changes,
      agencyId: ctx.agencyId,
      reference,
      status,
      transaction: values.transaction,
      propertyType: values.propertyType,
      agentId,
      photos,
      soldAt: soldNow ? new Date() : null,
      features: { source: "website", extractedBy },
    })
    .onConflictDoNothing()
    .returning({ id: listings.id });
  if (!created) {
    // Two pages with the same reference (a listing in two languages): link to the one we have.
    const [same] = await ctx.db.select({ id: listings.id }).from(listings).where(and(eq(listings.agencyId, ctx.agencyId), eq(listings.reference, reference)));
    return { listingId: same!.id, created: false };
  }
  await recordEvent(ctx, { type: "listing.imported", subjectType: "listing", subjectId: created.id, data: { url: page.url, reference, extractedBy } });
  return { listingId: created.id, created: true };
}

async function team(ctx: ToolContext): Promise<AgentRow[]> {
  return ctx.db.select({ id: agents.id, name: agents.name }).from(agents).where(and(eq(agents.agencyId, ctx.agencyId), eq(agents.active, true)));
}

export const importWebsiteListings = defineTool({
  name: "listings_import_website",
  description:
    "Find the listings on the agency's own website and create or update them here, with the agent each page names. Saves the website address when one is given. Runs within a time budget; a next run continues where it stopped.",
  mutates: true,
  input: z.object({
    websiteUrl: z.string().min(4).optional().describe("The agency's website, e.g. https://www.agency.be/nl"),
    budgetSeconds: z.number().int().min(5).max(280).default(45),
    useAi: z.boolean().default(true),
  }),
  run: async (ctx, input) => {
    const started = Date.now();
    const deadline = started + input.budgetSeconds * 1000;
    const settings = await settingsRow(ctx);
    const site = input.websiteUrl ? websiteFromInput(input.websiteUrl) : settings?.websiteUrl;
    if (!site) throw new Error("Set the agency's website address first");
    const siteChanged = Boolean(input.websiteUrl && site !== settings?.websiteUrl);
    if (siteChanged) {
      await ctx.db.insert(agencySettings).values({ agencyId: ctx.agencyId, websiteUrl: site }).onConflictDoUpdate({ target: agencySettings.agencyId, set: { websiteUrl: site } });
    }

    // Finding the listing pages takes at most a third of the budget; reading them the rest. While pages
    // found earlier are still waiting, a run goes straight to reading them (runs follow each other).
    const reader = await SiteReader.open(site);
    const previous = settings?.websiteSync ?? {};
    const [{ count: waiting } = { count: 0 }] = await ctx.db
      .select({ count: sql<number>`count(*)::int` })
      .from(websitePages)
      .where(and(eq(websitePages.agencyId, ctx.agencyId), eq(websitePages.kind, "pending")));
    const recentlyDiscovered = previous.discoveredAt && Date.now() - new Date(previous.discoveredAt).getTime() < REDISCOVER;
    const rediscover = siteChanged || waiting === 0 || !recentlyDiscovered;
    const discovered = rediscover ? await discover(reader, started + (deadline - started) / 3) : { listings: new Set<string>() };
    const allowed = [...discovered.listings].filter((url) => reader.robots.allowed(url));
    const blockedLinks = discovered.listings.size - allowed.length;
    const candidates = allowed.slice(0, MAX_NEW_PAGES_PER_RUN);
    if (candidates.length) {
      await ctx.db
        .insert(websitePages)
        .values(candidates.map((url) => ({ agencyId: ctx.agencyId, url })))
        .onConflictDoNothing();
    }

    const now = Date.now();
    const due = await ctx.db
      .select()
      .from(websitePages)
      .where(
        and(
          eq(websitePages.agencyId, ctx.agencyId),
          or(
            eq(websitePages.kind, "pending"),
            and(
              eq(websitePages.kind, "listing"),
              or(
                isNull(websitePages.lastCheckedAt),
                lt(websitePages.lastCheckedAt, new Date(now - RECHECK_LISTING)),
                sql`${websitePages.contentHash} is null or ${websitePages.contentHash} not like ${`${EXTRACTION_VERSION}:%`}`,
              ),
            ),
            and(eq(websitePages.kind, "error"), lt(websitePages.lastCheckedAt, new Date(now - RECHECK_ERROR))),
            and(
              eq(websitePages.kind, "other"),
              or(lt(websitePages.lastCheckedAt, new Date(now - RECHECK_OTHER)), sql`${websitePages.contentHash} not like ${`${EXTRACTION_VERSION}:%`}`),
            ),
          ),
        ),
      )
      .orderBy(asc(sql`case ${websitePages.kind} when 'pending' then 0 when 'listing' then 1 else 2 end`), asc(websitePages.lastCheckedAt));
    const people = await team(ctx);
    const tally: Record<PageOutcome, number> = { created: 0, updated: 0, unchanged: 0, removed: 0, other: 0, failed: 0, blocked: 0 };
    let done = 0;
    for (const page of due) {
      // Blocked pages cost no request, so they don't wait for a slot.
      if (reader.robots.allowed(page.url) && !reader.fits(deadline)) break;
      tally[await processPage(ctx, reader, page, people, input.useAi)]++;
      done++;
    }

    const [{ count: listingPages } = { count: 0 }] = await ctx.db
      .select({ count: sql<number>`count(*)::int` })
      .from(websitePages)
      .where(and(eq(websitePages.agencyId, ctx.agencyId), eq(websitePages.kind, "listing")));
    const [{ count: pagesFound } = { count: 0 }] = await ctx.db
      .select({ count: sql<number>`count(*)::int` })
      .from(websitePages)
      .where(and(eq(websitePages.agencyId, ctx.agencyId), inArray(websitePages.kind, ["pending", "listing", "error"])));
    const summary: WebsiteSync = {
      lastRunAt: new Date().toISOString(),
      discoveredAt: rediscover ? new Date(started).toISOString() : previous.discoveredAt,
      found: listingPages,
      pages: pagesFound,
      created: tally.created,
      updated: tally.updated + tally.unchanged,
      removed: tally.removed,
      failed: tally.failed,
      blocked: rediscover ? tally.blocked + blockedLinks : (previous.blocked ?? 0) + tally.blocked,
      crawlDelay: reader.robots.crawlDelay ?? undefined,
      remaining: due.length - done,
      ...("error" in discovered && discovered.error && !due.length ? { error: discovered.error } : {}),
    };
    await ctx.db.update(agencySettings).set({ websiteSync: summary }).where(eq(agencySettings.agencyId, ctx.agencyId));
    await recordEvent(ctx, { type: "website.imported", subjectType: "agency", subjectId: ctx.agencyId, data: { ...summary, site } });
    // `checked`: pages read in this run, so a caller running several in a row can show progress.
    return { ...summary, checked: done };
  },
});

export const importWebsitePage = defineTool({
  name: "listings_import_page",
  description: "Read one page of the agency's website (e.g. a listing a visitor just opened) and create or update its listing. Only pages on the agency's own site are read.",
  mutates: true,
  input: z.object({ url: z.string().min(8), useAi: z.boolean().default(true) }),
  run: async (ctx, input) => {
    const settings = await settingsRow(ctx);
    const site = settings?.websiteUrl;
    const url = normalizeUrl(input.url);
    if (!site || !url || !sameSite(url, site)) return { status: "skipped" as const, reason: "not on the agency's website" };
    const [inserted] = await ctx.db.insert(websitePages).values({ agencyId: ctx.agencyId, url }).onConflictDoNothing().returning();
    const page = inserted ?? (await ctx.db.select().from(websitePages).where(and(eq(websitePages.agencyId, ctx.agencyId), eq(websitePages.url, url))))[0]!;
    if (!inserted && page.lastCheckedAt && Date.now() - page.lastCheckedAt.getTime() < RECHECK_VISIT) return { status: "skipped" as const, reason: "read recently" };
    // Claim the page so parallel visits don't read it twice.
    await ctx.db.update(websitePages).set({ lastCheckedAt: new Date() }).where(eq(websitePages.id, page.id));
    const outcome = await processPage(ctx, await SiteReader.open(site), page, await team(ctx), input.useAi);
    const [after] = await ctx.db.select({ listingId: websitePages.listingId }).from(websitePages).where(eq(websitePages.id, page.id));
    return { status: outcome, listingId: after?.listingId ?? null };
  },
});

export const websiteImportStatus = defineTool({
  name: "website_import_status",
  description: "The agency's website address, the outcome of the last listing import, and imported listings that still need an agent.",
  mutates: false,
  input: z.object({}),
  run: async (ctx) => {
    const settings = await settingsRow(ctx);
    const pages = await ctx.db
      .select({
        url: websitePages.url,
        kind: websitePages.kind,
        extractedBy: websitePages.extractedBy,
        agentName: websitePages.agentName,
        lastError: websitePages.lastError,
        lastCheckedAt: websitePages.lastCheckedAt,
        listingId: listings.id,
        reference: listings.reference,
        title: listings.title,
        status: listings.status,
        street: listings.street,
        houseNumber: listings.houseNumber,
        city: listings.city,
        price: listings.price,
        transaction: listings.transaction,
        photo: sql<string | null>`${listings.photos}->0->>'url'`,
        listingAgentId: listings.agentId,
        listingAgentName: agents.name,
      })
      .from(websitePages)
      .leftJoin(listings, eq(listings.id, websitePages.listingId))
      .leftJoin(agents, eq(agents.id, listings.agentId))
      .where(eq(websitePages.agencyId, ctx.agencyId))
      .orderBy(asc(sql`case ${websitePages.kind} when 'listing' then 0 when 'error' then 1 when 'pending' then 2 else 3 end`), asc(listings.city));
    // A listing can have several pages (a project, or the same house in two languages): show it once.
    const seen = new Set<string>();
    const imported = pages.filter((p) => p.kind === "listing" && p.listingId && !seen.has(p.listingId) && Boolean(seen.add(p.listingId)));
    const unknownNames = [...new Set(imported.filter((p) => !p.listingAgentId && p.agentName).map((p) => p.agentName!))];
    return {
      websiteUrl: settings?.websiteUrl ?? null,
      sync: settings?.websiteSync ?? {},
      aiAvailable: aiAvailable(),
      listings: imported,
      withoutAgent: imported.filter((p) => !p.listingAgentId).length,
      /** People the website names as contact who aren't agents here yet. */
      unknownAgents: unknownNames,
      failed: pages.filter((p) => p.kind === "error").map((p) => ({ url: p.url, error: p.lastError })),
      /** Pages we know of, by what they turned out to be. */
      pageCounts: {
        listing: imported.length,
        pending: pages.filter((p) => p.kind === "pending").length,
        gone: pages.filter((p) => p.kind === "gone").length,
        other: pages.filter((p) => p.kind === "other").length,
        error: pages.filter((p) => p.kind === "error").length,
      },
      pending: pages.filter((p) => p.kind === "pending").length,
    };
  },
});

/** Daily re-read of every agency's website, so new, changed and removed listings follow on their own. */
export async function syncWebsitesForAllAgencies(totalSeconds = 270, database: ToolContext["db"] = db) {
  const rows = await database.select({ agencyId: agencySettings.agencyId }).from(agencySettings).where(sql`${agencySettings.websiteUrl} is not null`);
  // Sites with a crawl delay are read slowly, so each agency gets its share of the run.
  const budgetSeconds = Math.max(20, Math.min(240, Math.floor(totalSeconds / Math.max(rows.length, 1))));
  const results: Record<string, WebsiteSync | { error: string }> = {};
  for (const { agencyId } of rows) {
    try {
      results[agencyId] = await importWebsiteListings.run({ db: database, agencyId, actor: { type: "system", id: null } }, { budgetSeconds, useAi: true });
    } catch (error) {
      results[agencyId] = { error: error instanceof Error ? error.message : String(error) };
    }
  }
  return results;
}

