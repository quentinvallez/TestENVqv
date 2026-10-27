import type { WebsiteDiscovery, WebsiteOverview } from "@viewing/db/schema";
import { looksLikeListingUrl, looksLikeOverviewUrl, normalizeUrl, pageLinks, sitemapEntries } from "./extract";
import { firstPage, formPage, guessedPages, listingLinks, nextPageLinks, pageNumber, statedTotal } from "./overview";
import { ROBOTS_BLOCKED, type ReadResult } from "./reader";
import type { RobotsPolicy } from "./robots";

/*
 * Searching an agency's site for its listing pages, the way a visitor would:
 * from the home page to each overview (for sale, for rent, new builds), and
 * through every page of it, by its page links, the site's own search form, or
 * page addresses we try. Each overview records the count it states and what
 * we found, so a difference shows. Then the sitemaps, for anything the
 * overviews don't link. The search is spread over runs: its state is saved.
 */

/** Overviews we follow from the home page and other overviews; their filtered slices are skipped once the overview is complete. */
const MAX_OVERVIEWS = 40;
/** Pages of one overview, as a last stop: a walk already ends at a page that adds no listing. Large groups show 400 pages. */
const MAX_PAGES_PER_OVERVIEW = 600;
const MAX_SITEMAPS = 12;

export type DiscoveryReader = {
  site: string;
  robots: RobotsPolicy;
  read(url: string): Promise<ReadResult>;
  fits(deadline: number): boolean;
};

/** Reads a page with a browser (scrolling, "more" buttons) until the deadline and gives the HTML it ends up showing. */
export type Renderer = (url: string, deadline: number) => Promise<string | null>;

export type DiscoveryHooks = {
  /** Saves listing pages found on an overview (root null: found elsewhere) and says how many were new to it and to the search. */
  found(urls: string[], root: string | null): Promise<{ newToOverview: number; newToSite: number }>;
};

export type DiscoveryState = { discovery: WebsiteDiscovery; overviews: WebsiteOverview[] };
type QueueItem = WebsiteDiscovery["queue"][number];

export function newDiscovery(site: string, now = new Date()): DiscoveryState {
  return { discovery: { startedAt: now.toISOString(), queue: [{ url: site, root: null }], visited: [] }, overviews: [] };
}

const pathOf = (url: string) => new URL(url).pathname.replace(/\/$/, "").toLowerCase();
const depth = (url: string) => pathOf(url).split("/").filter(Boolean).length;

/** Whether an overview was read to its last page and holds everything it says it has. */
const whole = (o: WebsiteOverview) => o.complete && o.stated != null && o.found >= o.stated;

/** A filtered slice ("/kopen/aalst/huis") of an overview we have whole ("/kopen") adds nothing. */
function coveredBy(url: string, overviews: WebsiteOverview[]): boolean {
  return overviews.some((o) => whole(o) && o.url !== url && new URL(o.url).search === "" && pathOf(url).startsWith(`${pathOf(o.url)}/`));
}

/** The same address one page further: "?page=3" → "?page=4", "?start=24" → "?start=36", "/page/3" → "/page/4". */
export function followingPage(url: string, perPage: number): string | null {
  const n = pageNumber(url);
  if (!n) return null;
  const next = n.number + (n.offset ? perPage : 1);
  const u = new URL(url);
  for (const [key, value] of u.searchParams) {
    if (value === String(n.number)) {
      u.searchParams.set(key, String(next));
      return normalizeUrl(u.toString());
    }
  }
  u.pathname = u.pathname.replace(new RegExp(`(/(?:page|pagina|p|blz)[/-]?)${n.number}(/?)$`, "i"), `$1${next}$2`);
  return normalizeUrl(u.toString());
}

/**
 * Continues the search until the deadline. Returns an error when the site can't be read at all. The state is
 * changed in place; `discovery.doneAt` is set once every overview and sitemap was read.
 */
export async function continueDiscovery(
  reader: DiscoveryReader,
  state: DiscoveryState,
  hooks: DiscoveryHooks,
  deadline: number,
  renderer?: Renderer | null,
): Promise<{ error?: string }> {
  const { site } = reader;
  const { discovery, overviews } = state;
  const visited = new Set(discovery.visited);
  const visit = (url: string) => {
    visited.add(url);
    discovery.visited.push(url);
  };

  while (reader.fits(deadline)) {
    const item = discovery.queue.shift();
    if (!item) {
      if (!discovery.sitemapsQueued) {
        // Overviews done: the sitemaps, for listings no overview links.
        discovery.sitemapsQueued = true;
        const origin = new URL(site).origin;
        const maps = reader.robots.sitemaps.length ? reader.robots.sitemaps : [`${origin}/sitemap.xml`, `${origin}/sitemap_index.xml`];
        discovery.queue.push(...maps.map((url) => ({ url, root: null, sitemap: true })));
        continue;
      }
      for (const o of overviews) o.complete = true;
      if (await renderShortOverviews(state, hooks, renderer, reader, deadline)) discovery.doneAt = new Date().toISOString();
      break;
    }
    if (visited.has(item.url) || (item.root === item.url && coveredBy(item.url, overviews))) continue;
    if (item.sitemap && (discovery.sitemapsRead ?? 0) >= MAX_SITEMAPS) continue;
    visit(item.url);
    const isHome = item.url === site;
    // A home page robots.txt keeps us from is an error the agency sees; other pages are just skipped.
    if (!isHome && !reader.robots.allowed(item.url)) continue;

    const page = await reader.read(item.url);
    if (!("html" in page)) {
      if (isHome) return { error: "blocked" in page ? `${ROBOTS_BLOCKED} (home page)` : `The website could not be read: ${page.error}` };
      continue;
    }
    if (isHome && page.status >= 400) return { error: `The website answered with error ${page.status}` };
    if (page.status === 200 && item.sitemap) {
      discovery.sitemapsRead = (discovery.sitemapsRead ?? 0) + 1;
      const entries = sitemapEntries(page.html);
      // Listing sitemaps first: their names usually say so.
      const listingFirst = (url: string) => Number(/propert|listing|pand|bien|estate|detail|aanbod/i.test(url));
      discovery.queue.unshift(...entries.sitemaps.sort((a, b) => listingFirst(b) - listingFirst(a)).map((url) => ({ url, root: null, sitemap: true })));
      await hooks.found(entries.pages.map((entry) => normalizeUrl(entry)).filter((url): url is string => Boolean(url && looksLikeListingUrl(url, site))), null);
    }
    if (page.status !== 200 || item.sitemap) {
      if (item.root) settle(state, item.root);
      continue;
    }

    const cards = listingLinks(page.html, page.url, site);
    const fresh = await hooks.found(cards, item.root);
    if (item.root) walk(state, item, page.html, page.url, cards.length, fresh.newToOverview, fresh.newToSite, visited);

    // Overviews this page links to (the home page's menu, "new builds" on an overview): page 1 of each, the shallowest first.
    const roots = new Set([...overviews.map((o) => o.url), ...discovery.queue.filter((q) => q.root === q.url).map((q) => q.url)]);
    const links = pageLinks(page.html, page.url)
      .filter((url) => looksLikeOverviewUrl(url, site) && !looksLikeListingUrl(url, site) && !cards.includes(url))
      .map((url) => firstPage(url))
      .filter((url, i, all) => all.indexOf(url) === i && !visited.has(url) && !roots.has(url) && reader.robots.allowed(url))
      .sort((a, b) => depth(a) - depth(b));
    for (const url of links) {
      if (roots.size >= MAX_OVERVIEWS) break;
      roots.add(url);
      discovery.queue.push({ url, root: url });
    }
  }
  return {};
}

/** One page of an overview was read: count it, and queue the next page (by its links, the search form, or a guess). */
function walk(state: DiscoveryState, item: QueueItem, html: string, pageUrl: string, cardCount: number, fresh: number, newToSite: number, visited: Set<string>) {
  const { discovery, overviews } = state;
  const root = item.root!;
  const isFirst = item.url === root;
  let o = overviews.find((x) => x.url === root);
  if (!o) {
    if (!isFirst) return;
    o = { url: root, stated: null, found: 0, pages: 0, via: "single", complete: false };
    overviews.push(o);
  }
  o.pages++;
  o.found += fresh;
  o.stated ??= statedTotal(html);

  const queued = new Set(discovery.queue.map((q) => q.url));
  const unseen = (url: string | null): url is string => Boolean(url && !visited.has(url) && !queued.has(url) && url !== pageUrl);
  const next: QueueItem[] = [];
  if (item.guess && fresh > 0) {
    // A page address we tried works: go on that way, and drop the other tries.
    discovery.queue = discovery.queue.filter((q) => !(q.root === root && q.guess));
    o.via = "guess";
  }
  // Go on while pages add listings: new to the search, or new to an overview that doesn't hold what it says yet. A page
  // that adds nothing (the site shows page 1 again, or a slice of what we have) ends the overview.
  const goOn = (isFirst || newToSite > 0 || (fresh > 0 && o.stated != null && o.found < o.stated)) && o.pages < MAX_PAGES_PER_OVERVIEW;
  if (goOn) {
    const links = nextPageLinks(html, pageUrl).filter(unseen);
    const viaForm = formPage(html, pageUrl, (pageNumber(pageUrl)?.number ?? 1) + 1);
    if (o.via === "guess") {
      const following = followingPage(pageUrl, Math.max(cardCount, 1));
      if (unseen(following)) next.push({ url: following, root });
    } else if (links.length) {
      next.push(...links.map((url) => ({ url, root })));
      if (o.via === "single") o.via = "links";
    } else if (cardCount > 0 && unseen(viaForm)) {
      next.push({ url: viaForm, root });
      if (o.via === "single") o.via = "form";
    } else if (isFirst && cardCount > 0 && (o.stated == null || o.found < o.stated)) {
      next.push(...guessedPages(pageUrl, 2, cardCount).filter(unseen).map((url) => ({ url, root, guess: true })));
    }
  }
  discovery.queue.unshift(...next);
  settle(state, root);
}

/** An overview with nothing left in the queue is complete. */
function settle(state: DiscoveryState, root: string) {
  const o = state.overviews.find((x) => x.url === root);
  if (o && !state.discovery.queue.some((q) => q.root === root)) o.complete = true;
}

/**
 * Overviews that hold fewer listings than they say after reading all their pages: when a browser is available, read
 * them once more with it (some sites only load the rest while you scroll or click "more"). False while one is left.
 */
async function renderShortOverviews(state: DiscoveryState, hooks: DiscoveryHooks, renderer: Renderer | null | undefined, reader: DiscoveryReader, deadline: number) {
  if (!renderer) return true;
  const rendered = (state.discovery.rendered ??= []);
  for (const o of state.overviews) {
    if (o.stated == null || o.found >= o.stated || rendered.includes(o.url) || !reader.robots.allowed(o.url)) continue;
    // A browser read takes a while: leave it to the next run when this one is nearly over.
    if (deadline - Date.now() < 25_000) return false;
    rendered.push(o.url);
    const html = await renderer(o.url, deadline).catch(() => null);
    if (!html) continue;
    const fresh = await hooks.found(listingLinks(html, o.url, reader.site), o.url);
    if (fresh.newToOverview > 0) {
      o.found += fresh.newToOverview;
      o.via = "browser";
    }
  }
  return true;
}
