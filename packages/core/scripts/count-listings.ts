/*
 * Counts every listing on one agency site, as the import finds and reads them (robots.txt and its crawl delay
 * obeyed), and prints one JSON line per listing ("LISTING {...}") and per overview ("OVERVIEW {...}"), to be
 * turned into a spreadsheet. Also reads the overviews of what was sold or rented, which the import skips.
 * Stores nothing.
 * Run: npx tsx packages/core/scripts/count-listings.ts <site>
 */
import { continueDiscovery, newDiscovery, type DiscoveryHooks, type DiscoveryReader } from "../src/website/discover";
import { extractListing, isListingPage, isRemovedListingPage, looksLikeListingUrl, pageLinks, pageText, sameSite } from "../src/website/extract";
import { cardStatuses, statedCount } from "../src/website/overview";
import { SiteReader } from "../src/website/reader";

const site = process.argv[2];
if (!site?.includes("caenen")) throw new Error("Only sites Quentin chose for counting");

async function main() {
  const started = Date.now();
  const reader = await SiteReader.open(site);
  console.log(`crawl delay ${reader.delayMs / 1000}s`);
  const html = new Map<string, string>();
  let lastUrl = "";
  const recording: DiscoveryReader = {
    site: reader.site,
    robots: reader.robots,
    fits: (deadline) => reader.fits(deadline),
    read: async (url) => {
      const page = await reader.read(url);
      lastUrl = url;
      if ("html" in page) html.set(url, page.html);
      return page;
    },
  };
  const shownOn = new Map<string, Set<string>>();
  const badge = new Map<string, string>();
  const hooks: DiscoveryHooks = {
    found: async (urls, root) => {
      const tag = root ?? "sitemap";
      let newToOverview = 0;
      let newToSite = 0;
      for (const [url, b] of cardStatuses(html.get(lastUrl) ?? "", lastUrl, urls)) badge.set(url, b);
      for (const url of new Set(urls)) {
        const tags = shownOn.get(url) ?? new Set();
        if (!tags.size) newToSite++;
        if (!tags.has(tag)) newToOverview++;
        tags.add(tag);
        shownOn.set(url, tags);
      }
      return { newToOverview, newToSite };
    },
  };
  const state = newDiscovery(site);
  const { error } = await continueDiscovery(recording, state, hooks, started + 20 * 60_000);
  console.log(`search ${state.discovery.doneAt ? "done" : "NOT done"} in ${Math.round((Date.now() - started) / 1000)}s${error ? `, error: ${error}` : ""}; ${shownOn.size} listing pages`);
  for (const o of state.overviews) console.log(`OVERVIEW ${JSON.stringify({ url: o.url, stated: o.stated, found: o.found, via: o.via, pages: o.pages, complete: o.complete })}`);

  // Overviews of what was sold or rented, linked from the home page: the import skips them.
  const home = await reader.read(reader.site);
  const soldOverviews = "html" in home ? [...new Set(pageLinks(home.html, home.url).filter((u) => sameSite(u, site) && /verkocht|verhuurd|referenties|vendu|lou[eé]/i.test(u)))] : [];
  for (const root of soldOverviews) {
    const queue = [root];
    const seen = new Set<string>();
    const cards = new Set<string>();
    let stated: number | null = null;
    while (queue.length && seen.size < 40) {
      const url = queue.shift()!;
      if (seen.has(url) || !reader.robots.allowed(url)) continue;
      seen.add(url);
      const page = await reader.read(url);
      if (!("html" in page)) continue;
      if (url === root) stated = statedCount(page.html)?.total ?? null;
      const links = pageLinks(page.html, page.url).filter((u) => sameSite(u, site));
      for (const u of links) if (looksLikeListingUrl(u, site)) cards.add(u);
      const path = new URL(root).pathname;
      for (const u of links) if (new URL(u).pathname.startsWith(path) && new URL(u).search && !seen.has(u) && /page|pagina|p=/i.test(new URL(u).search)) queue.push(u);
    }
    console.log(`SOLD_OVERVIEW ${JSON.stringify({ url: root, stated, pages: seen.size, cards: cards.size })}`);
    for (const u of cards) {
      const tags = shownOn.get(u) ?? new Set();
      tags.add(`sold:${root}`);
      shownOn.set(u, tags);
    }
  }

  // Every listing page, read as the importer reads it.
  const boilerplate = await reader.siteBoilerplate();
  for (const [url, tags] of shownOn) {
    const page = await reader.read(url);
    const row: Record<string, unknown> = { url, overviews: [...tags], card: badge.get(url) ?? null };
    if (!("html" in page)) row.outcome = `unreadable: ${page.error}`;
    else {
      const { listing } = extractListing(page.html, page.url, boilerplate);
      const text = pageText(page.html);
      row.httpStatus = page.status;
      row.finalUrl = page.url;
      row.outcome =
        page.status >= 400 ? "offline" : isRemovedListingPage(listing, page.html) ? "removed" : isListingPage(listing, page.html, tags.size > 0) ? "listing" : "not a listing";
      row.reference = listing.reference;
      row.transaction = listing.transaction;
      row.status = listing.status;
      row.type = listing.propertyType;
      row.title = listing.title;
      row.street = listing.street;
      row.postcode = listing.postcode;
      row.city = listing.city;
      row.price = listing.price;
      row.bedrooms = listing.bedrooms;
      row.agent = listing.agentName;
      row.badgeText = text.split("\n").filter((l) => /^\s*(verkocht|verhuurd|optie|in optie|onder optie|compromis|nieuw|reeds \d+% verkocht)\s*$/i.test(l)).slice(0, 3);
    }
    console.log(`LISTING ${JSON.stringify(row)}`);
  }
  console.log(`done in ${Math.round((Date.now() - started) / 1000)}s`);
}

main().catch((e) => {
  console.log(`!! ${e instanceof Error ? e.stack : e}`);
  process.exit(1);
});
