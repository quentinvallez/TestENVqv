import { and, asc, db, eq, inArray, isNull, lt, or, schema, sql } from "@viewing/db";
import type { WebsiteOverview, WebsiteSync } from "@viewing/db/schema";
import { z } from "zod";
import { aiAvailable } from "../ai/client";
import { recordEvent } from "../events";
import { draftOffMarketNotices } from "../planner/off-market";
import { defineTool, type ToolContext } from "../tool";
import { extractWithAi, mergeExtraction } from "../website/ai";
import { openBrowser } from "../website/browser";
import { continueDiscovery, newDiscovery, onlyBrowserLeft, type DiscoveryHooks, type DiscoveryState } from "../website/discover";
import {
  extractListing,
  isListingPage,
  isRemovedListingPage,
  looksLikeListingUrl,
  matchAgent,
  missingKeyFacts,
  normalizeUrl,
  pageText,
  referenceFromUrl,
  sameSite,
  textFingerprint,
  withoutVisitNumbers,
  type ExtractedListing,
} from "../website/extract";
import { SiteReader } from "../website/reader";

/*
 * Listings from the agency's own website: we go through its overview pages
 * (every page of them) and sitemaps to find the listing pages, read each one
 * and create or update the listing, with the agent the page names. Pages are
 * remembered in website_pages, so a daily run only re-reads what may have
 * changed and archives listings that vanished. Each overview keeps the count
 * it states next to what we found on it, so a difference shows.
 */

const { agencySettings, agents, availabilityRules, listings, postcodes, websitePages } = schema;

const HOUR = 3600 * 1000;
/** Listing pages are read again at most this often (prices and status change). */
const RECHECK_LISTING = 20 * HOUR;
/** Listings the agency still offers; the import page leaves out the rest (sold, rented, under option). */
/** Listings shown in the list: on offer, or under option (shown with that status, no bookings on the site). */
const LISTED: ("draft" | "active" | "under_offer")[] = ["draft", "active", "under_offer"];
/** Pages that weren't listings, or failed, are tried again after this. */
const RECHECK_OTHER = 14 * 24 * HOUR;
const RECHECK_ERROR = 24 * HOUR;
/** Sitemaps and overview pages are searched again at most this often while pages are still waiting to be read. */
const REDISCOVER = 20 * HOUR;
/** A page visit reported by the widget triggers a read at most this often. */
const RECHECK_VISIT = 6 * HOUR;

/** Bump when the reading rules change, so listings read with older rules are read again. */
const EXTRACTION_VERSION = "v7";

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

/**
 * Reads one page and creates, updates or archives its listing. `overviewsWhole`: the site's overviews were read in
 * full and hold what they state, so a listing page only a sitemap lists is no longer on offer (sitemaps keep old pages).
 */
async function processPage(ctx: ToolContext, reader: SiteReader, page: PageRow, team: AgentRow[], useAi: boolean, overviewsWhole = false): Promise<PageOutcome> {
  const { site } = reader;
  const now = new Date();
  const shownOnOverview = page.foundOn.some((tag) => tag !== ELSEWHERE);
  if (overviewsWhole && page.foundOn.length === 1 && page.foundOn[0] === ELSEWHERE) return removePage(ctx, page, now);
  let fetched = await reader.read(page.url);
  const lasting = "html" in fetched && isHomePage(fetched.url) && withoutVisitNumbers(page.url);
  if (lasting) {
    const again = await reader.read(lasting);
    if ("html" in again && !isHomePage(again.url)) fetched = again;
  }
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
  // Sites often redirect a removed listing to the overview or the home page.
  const landed = normalizeUrl(fetched.url) ?? page.url;
  if (landed !== page.url && (isHomePage(landed) || (page.kind === "listing" && !looksLikeListingUrl(landed, site)))) return removePage(ctx, page, now);

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
  let isListing = isListingPage(listing, fetched.html, shownOnOverview);
  const knownAgent = matchAgent(team, listing.agentName, text);
  const missing = missingKeyFacts(listing).filter((field) => !(field === "agentName" && knownAgent));
  if (useAi && aiAvailable() && (isListing || looksLikeListingUrl(page.url, site)) && missing.length > 1) {
    try {
      const ai = await extractWithAi(page.url, text);
      isListing = ai.isListing || (shownOnOverview && isListing);
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
  // "Optie" or "Verkocht" on the overview's card counts when the page itself says nothing else: some sites show it only there.
  if (page.cardStatus && (listing.status ?? "active") === "active") listing = { ...listing, status: page.cardStatus };

  const agent = matchAgent(team, listing.agentName) ?? knownAgent ?? (await addWebsiteAgent(ctx, team, listing));
  if (agent && (listing.agentEmail || listing.agentPhone)) await completeAgent(ctx, agent.id, listing);
  const outcome = await saveListing(ctx, page, listing, agent?.id ?? null, extractedBy);
  await ctx.db
    .update(websitePages)
    .set({ kind: "listing", listingId: outcome.listingId, contentHash: hash, extractedBy, agentName: listing.agentName, lastCheckedAt: now, lastError: null })
    .where(eq(websitePages.id, page.id));
  return outcome.created ? "created" : "updated";
}

const isHomePage = (url: string) => /^(\/[a-z]{2})?\/?$/i.test(new URL(url).pathname);

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
  // Only when the site took it down: a page robots.txt closes to us says nothing about the property.
  if (kind === "gone") await draftOffMarketNotices(ctx, archived.id, "unavailable");
  return "removed";
}

/**
 * Whether a listing we have is the one this page shows: it has no page yet (made by hand), it is this page, or it is
 * the same property in another language (the same id in the address). A reference alone doesn't say so: some sites
 * show the same number on different properties.
 */
function isSameListing(listing: { websiteUrl: string | null }, url: string) {
  if (!listing.websiteUrl || listing.websiteUrl === url) return true;
  const id = referenceFromUrl(url);
  return id != null && id === referenceFromUrl(listing.websiteUrl);
}

async function saveListing(ctx: ToolContext, page: PageRow, facts: ExtractedListing, agentId: string | null, extractedBy: string) {
  const mine = (where: ReturnType<typeof eq>) => ctx.db.select().from(listings).where(and(eq(listings.agencyId, ctx.agencyId), where));
  const fromUrl = referenceFromUrl(page.url);
  const wanted = (facts.reference ?? fromUrl ?? `WEB-${textFingerprint(page.url).slice(0, 8)}`).slice(0, 40);
  const candidates = [
    ...(page.listingId ? await mine(eq(listings.id, page.listingId)) : []),
    ...(await mine(eq(listings.websiteUrl, page.url))),
    ...(await mine(eq(listings.reference, wanted))),
  ];
  const existing = candidates.find((l) => isSameListing(l, page.url));
  // A reference another property already has: this one goes by the id in its address, so the two stay apart.
  let reference = wanted;
  if (!existing) {
    for (const option of [wanted, fromUrl, `WEB-${textFingerprint(page.url).slice(0, 8)}`]) {
      if (!option) continue;
      const [taken] = await mine(eq(listings.reference, option.slice(0, 40)));
      if (!taken) {
        reference = option.slice(0, 40);
        break;
      }
    }
  }

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
      if (status !== "active") await draftOffMarketNotices(ctx, existing.id, status);
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

/**
 * Someone the website names as contact for a listing who isn't an agent here yet: added with working
 * hours Mon–Fri 9:00–18:00 (the agency adjusts them), so their listings can be booked straight away.
 */
async function addWebsiteAgent(ctx: ToolContext, known: AgentRow[], listing: ExtractedListing): Promise<AgentRow | null> {
  const name = listing.agentName?.replace(/\s+/g, " ").trim();
  if (!name || name.split(" ").length < 2 || name.length > 60) return null;
  if (listing.agentEmail) {
    const [sameEmail] = await ctx.db.select({ id: agents.id, name: agents.name }).from(agents).where(and(eq(agents.agencyId, ctx.agencyId), eq(agents.email, listing.agentEmail)));
    if (sameEmail) return sameEmail;
  }
  const [created] = await ctx.db
    .insert(agents)
    .values({ agencyId: ctx.agencyId, name, email: listing.agentEmail, phone: listing.agentPhone, source: "website" })
    .onConflictDoNothing()
    .returning({ id: agents.id, name: agents.name });
  if (!created) return null;
  await ctx.db.insert(availabilityRules).values([1, 2, 3, 4, 5].map((weekday) => ({ agencyId: ctx.agencyId, agentId: created.id, weekday, startMinute: 9 * 60, endMinute: 18 * 60 })));
  await recordEvent(ctx, { type: "agent.added_from_website", subjectType: "agent", subjectId: created.id, data: { name, email: listing.agentEmail, phone: listing.agentPhone } });
  known.push(created);
  return created;
}

/** Fills in an agent's email or phone from the website when we don't have them yet. */
async function completeAgent(ctx: ToolContext, agentId: string, listing: ExtractedListing) {
  const [row] = await ctx.db.select({ email: agents.email, phone: agents.phone }).from(agents).where(and(eq(agents.agencyId, ctx.agencyId), eq(agents.id, agentId)));
  if (!row) return;
  const changes = {
    ...(!row.email && listing.agentEmail ? { email: listing.agentEmail } : {}),
    ...(!row.phone && listing.agentPhone ? { phone: listing.agentPhone } : {}),
  };
  if (!Object.keys(changes).length) return;
  // Another agent may already use that email; then we leave it.
  await ctx.db.update(agents).set(changes).where(and(eq(agents.agencyId, ctx.agencyId), eq(agents.id, agentId))).catch(() => undefined);
}

/** Marks a listing page found outside any overview (the home page, a sitemap) in this search. */
const ELSEWHERE = "*";

/** The search's findings go into website_pages, each page marked with the overviews that show it. */
function foundPages(ctx: ToolContext, reader: SiteReader, onBlocked: (count: number) => void): DiscoveryHooks {
  return {
    async found(urls, root, badges) {
      const unique = [...new Set(urls)];
      const allowed = unique.filter((url) => reader.robots.allowed(url));
      onBlocked(unique.length - allowed.length);
      if (!allowed.length) return { newToOverview: 0, newToSite: 0 };
      const tag = root ?? ELSEWHERE;
      const inserted = await ctx.db
        .insert(websitePages)
        .values(allowed.map((url) => ({ agencyId: ctx.agencyId, url, foundOn: [tag], cardStatus: root ? (badges?.get(url) ?? null) : null })))
        .onConflictDoNothing()
        .returning({ url: websitePages.url });
      const added = new Set(inserted.map((row) => row.url));
      const known = allowed.filter((url) => !added.has(url));
      const marked = known.length
        ? await ctx.db
            .update(websitePages)
            .set({ foundOn: sql`array_append(${websitePages.foundOn}, ${tag}::text)` })
            .where(and(eq(websitePages.agencyId, ctx.agencyId), inArray(websitePages.url, known), sql`not (${tag}::text = any(${websitePages.foundOn}))`))
            .returning({ foundOn: websitePages.foundOn })
        : [];
      if (root && known.length) {
        // What the card shows now ("Optie" added or gone): the page is read again so its listing follows. A page we
        // had given up as gone that an overview shows again is read again too.
        for (const status of [null, "under_offer", "sold", "rented"] as const) {
          const group = known.filter((url) => (badges?.get(url) ?? null) === status);
          if (!group.length) continue;
          await ctx.db
            .update(websitePages)
            .set({ cardStatus: status, contentHash: null, kind: sql`case when ${websitePages.kind} = 'gone' then 'pending' else ${websitePages.kind} end` })
            .where(
              and(
                eq(websitePages.agencyId, ctx.agencyId),
                inArray(websitePages.url, group),
                or(sql`${websitePages.cardStatus} is distinct from ${status}::text`, eq(websitePages.kind, "gone")),
              ),
            );
        }
      }
      return { newToOverview: inserted.length + marked.length, newToSite: inserted.length + marked.filter((row) => row.foundOn.length === 1).length };
    },
  };
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

    // Finding the listing pages takes at most two thirds of the budget; reading them the rest. A search of the site
    // goes on over runs until it is done; a new one starts when nothing is waiting, or after a day.
    const reader = await SiteReader.open(site);
    const previous = settings?.websiteSync ?? {};
    const [{ count: waiting } = { count: 0 }] = await ctx.db
      .select({ count: sql<number>`count(*)::int` })
      .from(websitePages)
      .where(and(eq(websitePages.agencyId, ctx.agencyId), eq(websitePages.kind, "pending")));
    const searching = Boolean(previous.discovery && !previous.discovery.doneAt && !siteChanged);
    const recentlyDiscovered = previous.discoveredAt && Date.now() - new Date(previous.discoveredAt).getTime() < REDISCOVER;
    let state: DiscoveryState | null = searching ? { discovery: previous.discovery!, overviews: previous.overviews ?? [] } : null;
    if (!state && (siteChanged || waiting === 0 || !recentlyDiscovered)) {
      state = newDiscovery(site);
      // Which overview shows which page is counted again in each search.
      await ctx.db.update(websitePages).set({ foundOn: [] }).where(eq(websitePages.agencyId, ctx.agencyId));
    }
    let blockedLinks = 0;
    let discoveryError: string | undefined;
    if (state) {
      const browser = await openBrowser(reader);
      try {
        // The browser reads at the end of a search get the whole run: scrolling a long list takes a while.
        const until = onlyBrowserLeft(state) ? deadline - 5_000 : started + ((deadline - started) * 2) / 3;
        discoveryError = (await continueDiscovery(reader, state, foundPages(ctx, reader, (n) => (blockedLinks += n)), until, browser?.render)).error;
      } finally {
        await browser?.close();
      }
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
      // New pages an overview shows first, then new pages only a sitemap lists (often old or sold), then the known ones.
      .orderBy(
        asc(
          sql`case when ${websitePages.kind} = 'pending' and ${websitePages.foundOn} <> array[${ELSEWHERE}]::text[] and cardinality(${websitePages.foundOn}) > 0 then 0 when ${websitePages.kind} = 'pending' then 1 when ${websitePages.kind} = 'listing' then 2 else 3 end`,
        ),
        asc(websitePages.lastCheckedAt),
      );
    const people = await team(ctx);
    // Overviews read in full that hold what they state: a page only a sitemap lists is then an old one.
    const overviewsNow = state?.overviews ?? previous.overviews ?? [];
    const overviewsWhole = overviewsNow.some((o) => o.found > 0) && overviewsNow.every((o) => o.complete && (o.stated == null || o.found >= o.stated));
    const tally: Record<PageOutcome, number> = { created: 0, updated: 0, unchanged: 0, removed: 0, other: 0, failed: 0, blocked: 0 };
    let checked = 0;
    for (const page of due) {
      // Blocked pages cost no request, so they don't wait for a slot.
      if (reader.robots.allowed(page.url) && !reader.fits(deadline)) break;
      tally[await processPage(ctx, reader, page, people, input.useAi, overviewsWhole)]++;
      checked++;
    }

    // Listings on offer or under option: sold and rented are kept (valuations use sales) but not counted.
    const [{ count: listingPages } = { count: 0 }] = await ctx.db
      .select({ count: sql<number>`count(distinct ${listings.id})::int` })
      .from(websitePages)
      .innerJoin(listings, eq(listings.id, websitePages.listingId))
      .where(and(eq(websitePages.agencyId, ctx.agencyId), eq(websitePages.kind, "listing"), inArray(listings.status, LISTED)));
    const [{ count: pagesFound } = { count: 0 }] = await ctx.db
      .select({ count: sql<number>`count(*)::int` })
      .from(websitePages)
      .where(and(eq(websitePages.agencyId, ctx.agencyId), inArray(websitePages.kind, ["pending", "listing", "error"])));
    const done = state?.discovery.doneAt;
    const summary: WebsiteSync = {
      lastRunAt: new Date().toISOString(),
      discoveredAt: done ?? previous.discoveredAt,
      found: listingPages,
      pages: pagesFound,
      created: tally.created,
      updated: tally.updated + tally.unchanged,
      removed: tally.removed,
      failed: tally.failed,
      blocked: (state && !searching ? 0 : (previous.blocked ?? 0)) + tally.blocked + blockedLinks,
      crawlDelay: reader.robots.crawlDelay ?? undefined,
      remaining: due.length - checked,
      overviews: state?.overviews ?? previous.overviews,
      // A finished search keeps only when it ran; one still going keeps where it is.
      discovery: state ? (done ? { startedAt: state.discovery.startedAt, doneAt: done, queue: [], visited: [] } : state.discovery) : previous.discovery,
      ...(discoveryError && !due.length ? { error: discoveryError } : {}),
    };
    await ctx.db.update(agencySettings).set({ websiteSync: summary }).where(eq(agencySettings.agencyId, ctx.agencyId));
    // The event leaves out the search's own queue and visited pages.
    const { discovery: _, ...facts } = summary;
    await recordEvent(ctx, { type: "website.imported", subjectType: "agency", subjectId: ctx.agencyId, data: { ...facts, site } });
    // `checked`: pages read in this run, so a caller running several in a row can show progress. `searching`: the
    // search for listing pages isn't done, so a next run has more to do even when no page is waiting.
    return { ...summary, checked, searching: Boolean(state && !done) };
  },
});

export const importWebsitePage = defineTool({
  name: "listings_import_page",
  description: "Read one page of the agency's website (e.g. a listing a visitor just opened) and create or update its listing. Only pages on the agency's own site are read.",
  mutates: true,
  input: z.object({
    url: z.string().min(8),
    useAi: z.boolean().default(true),
    force: z.boolean().default(false).describe("Someone at the agency says this listing is missing: read it now, also when it was read recently"),
  }),
  run: async (ctx, input) => {
    const settings = await settingsRow(ctx);
    const site = settings?.websiteUrl;
    const url = normalizeUrl(input.url);
    if (!site || !url || !sameSite(url, site)) return { status: "skipped" as const, reason: "not on the agency's website" };
    const [inserted] = await ctx.db.insert(websitePages).values({ agencyId: ctx.agencyId, url }).onConflictDoNothing().returning();
    const page = inserted ?? (await ctx.db.select().from(websitePages).where(and(eq(websitePages.agencyId, ctx.agencyId), eq(websitePages.url, url))))[0]!;
    if (!input.force && !inserted && page.lastCheckedAt && Date.now() - page.lastCheckedAt.getTime() < RECHECK_VISIT) return { status: "skipped" as const, reason: "read recently" };
    // A listing the search missed: kept as an event, so the search can be improved for every site like this one.
    if (input.force) await recordEvent(ctx, { type: "website.listing_missed", subjectType: "agency", subjectId: ctx.agencyId, data: { url, known: !inserted, kind: page.kind } });
    // Claim the page so parallel visits don't read it twice.
    await ctx.db.update(websitePages).set({ lastCheckedAt: new Date() }).where(eq(websitePages.id, page.id));
    const outcome = await processPage(ctx, await SiteReader.open(site), page, await team(ctx), input.useAi);
    const [after] = await ctx.db.select({ listingId: websitePages.listingId }).from(websitePages).where(eq(websitePages.id, page.id));
    return { status: outcome, listingId: after?.listingId ?? null };
  },
});

/** What the listing cards of an overview turned out to be. */
export type CardCounts = { onOffer: number; underOffer: number; soldOrRented: number; toRead: number; offline: number; notListing: number; failed: number };

const cardBucket = (kind: string, status: string | null): keyof CardCounts => {
  if (kind === "pending") return "toRead";
  if (kind === "gone") return "offline";
  if (kind === "other") return "notListing";
  if (kind === "error") return "failed";
  if (status === "under_offer") return "underOffer";
  if (status === "sold" || status === "rented") return "soldOrRented";
  return status === "archived" ? "offline" : "onOffer";
};

/**
 * The overviews a visitor starts from (for sale, for rent, new builds; not their filtered slices), each with the count
 * it states and what its cards turned out to be: on offer, under option, sold or rented, still to read.
 */
async function overviewCounts(ctx: ToolContext, sync: WebsiteSync | undefined) {
  const all = sync?.overviews ?? [];
  const path = (url: string) => new URL(url).pathname.replace(/\/$/, "").toLowerCase();
  const sliceOf = (o: WebsiteOverview, p: WebsiteOverview) => p !== o && p.found > 0 && new URL(p.url).search === "" && path(o.url).startsWith(`${path(p.url)}/`);
  const shown = all.filter((o) => (o.found > 0 || o.stated != null) && !all.some((p) => sliceOf(o, p)));
  if (!shown.length) return [];
  const { rows } = await ctx.db.execute<{ root: string; kind: string; status: string | null; count: number }>(sql`
    select r.root, p.kind, l.status, count(distinct coalesce(p.listing_id, p.id))::int as count
    from ${websitePages} p
    cross join unnest(p.found_on) as r(root)
    left join ${listings} l on l.id = p.listing_id
    where p.agency_id = ${ctx.agencyId} and r.root in (${sql.join(
      shown.map((o) => sql`${o.url}`),
      sql`, `,
    )})
    group by r.root, p.kind, l.status`);
  return shown.map((o) => {
    const counts: CardCounts = { onOffer: 0, underOffer: 0, soldOrRented: 0, toRead: 0, offline: 0, notListing: 0, failed: 0 };
    for (const row of rows) if (row.root === o.url) counts[cardBucket(row.kind, row.status)] += row.count;
    return { ...o, counts };
  });
}

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
    const all = pages.filter((p) => p.kind === "listing" && p.listingId && !seen.has(p.listingId) && Boolean(seen.add(p.listingId)));
    const imported = all.filter((p) => p.status && (LISTED as string[]).includes(p.status));
    const unknownNames = [...new Set(imported.filter((p) => !p.listingAgentId && p.agentName).map((p) => p.agentName!))];
    return {
      websiteUrl: settings?.websiteUrl ?? null,
      sync: settings?.websiteSync ?? {},
      aiAvailable: aiAvailable(),
      listings: imported,
      withoutAgent: imported.filter((p) => !p.listingAgentId).length,
      /** People the website names as contact who aren't agents here yet. */
      unknownAgents: unknownNames,
      /** Agents added because the website names them, with the default working hours. */
      websiteAgents: await ctx.db
        .select({ id: agents.id, name: agents.name })
        .from(agents)
        .where(and(eq(agents.agencyId, ctx.agencyId), eq(agents.source, "website")))
        .orderBy(asc(agents.name)),
      failed: pages.filter((p) => p.kind === "error").map((p) => ({ url: p.url, error: p.lastError })),
      /** Pages we know of, by what they turned out to be. */
      pageCounts: {
        onOffer: imported.filter((p) => p.status !== "under_offer").length,
        underOffer: imported.filter((p) => p.status === "under_offer").length,
        offMarket: all.length - imported.length,
        pending: pages.filter((p) => p.kind === "pending").length,
        gone: pages.filter((p) => p.kind === "gone").length,
        other: pages.filter((p) => p.kind === "other").length,
        error: pages.filter((p) => p.kind === "error").length,
      },
      pending: pages.filter((p) => p.kind === "pending").length,
      overviews: await overviewCounts(ctx, settings?.websiteSync),
      /** A search of the site for listing pages is still going; the next run continues it. */
      searching: Boolean(settings?.websiteSync?.discovery && !settings.websiteSync.discovery.doneAt),
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

