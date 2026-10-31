import type { WebsiteDiscovery, WebsiteOverview } from "@viewing/db/schema";
import { listingKey, looksLikeListingUrl, looksLikeOverviewUrl, normalizeUrl, pageLinks, sameSite, sitemapEntries } from "./extract";
import { cardStatuses, type CardBadge, firstPage, formPage, guessedPages, isArchiveUrl, languageOf, listingLinks, linksWithShapes, nextPageLinks, pageNumber, pagingKey, statedTotal, urlShape } from "./overview";
import { ROBOTS_BLOCKED, type ReadResult } from "./reader";
import type { RobotsPolicy } from "./robots";

/*
 * Searching an agency's site for its listing pages, the way a visitor would:
 * from the home page to each overview (for sale, for rent, new builds), and
 * through every page of it, by its page links, the site's own search form, or
 * page addresses we try. Each overview records the count it states and what
 * we found, so a difference shows. Then the sitemaps, for anything the
 * overviews don't link. The search is spread over runs: its state is saved.
 * One language is read (a site in Dutch, French and English shows every
 * listing three times), and overviews of what was sold are skipped.
 * A new-build overview shows projects: each project page gives its units, or
 * is one listing itself when it has no page per unit.
 */

/** Overviews we follow from the home page and other overviews; their filtered slices are skipped once the overview is complete. */
const MAX_OVERVIEWS = 40;
/** Pages of one overview, as a last stop: a walk already ends at a page that adds no listing. Large groups show 400 pages. */
const MAX_PAGES_PER_OVERVIEW = 600;
const MAX_SITEMAPS = 12;
/** A page with fewer cards is an article or a teaser, not an overview whose further pages are worth trying. */
const MIN_CARDS = 6;
/** Project pages read per site. */
const MAX_PROJECTS = 200;
/** The site's main overviews: what is for sale or for rent. */
const SALE_OR_RENT = /\/(te-koop|te-huur|kopen|huren|aanbod|a-vendre|a-louer|acheter|louer|vente|location|biens|for-sale|for-rent|buy|rent|properties|panden)$/i;
/** Overviews of new builds, whose links one level deeper are projects. */
const PROJECTS = /\/(nieuwbouw|nieuwbouwprojecten|projecten|projets?|projects?|neuf|immobilier-neuf|new-builds?|new-developments?)$/i;

export type DiscoveryReader = {
  site: string;
  robots: RobotsPolicy;
  read(url: string): Promise<ReadResult>;
  fits(deadline: number): boolean;
};

/** Reads a page with a browser (scrolling, "more" buttons) until the deadline and gives the HTML it ends up showing. */
export type Renderer = (url: string, deadline: number) => Promise<string | null>;

export type DiscoveryHooks = {
  /**
   * Saves listing pages found on an overview (root null: found elsewhere), with the status badges their cards show
   * there, and says how many were new to it and to the search.
   */
  found(urls: string[], root: string | null, badges?: Map<string, CardBadge>): Promise<{ newToOverview: number; newToSite: number }>;
};

export type DiscoveryState = { discovery: WebsiteDiscovery; overviews: WebsiteOverview[] };
type QueueItem = WebsiteDiscovery["queue"][number];

/** Whether the search has only the browser reads left, which deserve a run's whole time. */
export function onlyBrowserLeft(state: DiscoveryState): boolean {
  return !state.discovery.doneAt && state.discovery.queue.length === 0 && Boolean(state.discovery.sitemapsQueued);
}

export function newDiscovery(site: string, now = new Date()): DiscoveryState {
  return { discovery: { startedAt: now.toISOString(), queue: [{ url: site, root: null }], visited: [], language: languageOf(site) ?? undefined }, overviews: [] };
}

/**
 * The language to read when the site's address has none: the one the home page redirects to ("/fr"), else, when every
 * overview it links is in a language, Dutch, French or English in that order; else the addresses without a language.
 */
function homeLanguage(homeUrl: string, links: string[]): string | null {
  const redirected = languageOf(homeUrl);
  if (redirected) return redirected;
  const languages = links.map(languageOf);
  if (!languages.length || languages.includes(null)) return null;
  return ["nl", "fr", "en", "de"].find((l) => languages.includes(l)) ?? languages[0]!;
}

const pathOf = (url: string) => new URL(url).pathname.replace(/\/$/, "").toLowerCase();
const depth = (url: string) => pathOf(url).split("/").filter(Boolean).length;

/** Whether an overview was read to its last page and holds everything it says it has. */
const whole = (o: WebsiteOverview) => o.complete && o.stated != null && o.found >= o.stated;

/** A filtered slice ("/kopen/aalst/huis", "/kopen?city=aalst") of an overview we have whole ("/kopen") adds nothing. */
function coveredBy(url: string, overviews: WebsiteOverview[]): boolean {
  return overviews.some(
    (o) => whole(o) && o.url !== url && new URL(o.url).search === "" && (pathOf(url).startsWith(`${pathOf(o.url)}/`) || (pathOf(url) === pathOf(o.url) && new URL(url).search !== "")),
  );
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
  hooks = oneAddressPerListing(state, hooks);
  const visited = new Set(discovery.visited);
  const inLanguage = (url: string) => {
    const language = languageOf(url);
    return language === null || language === (discovery.language ?? null);
  };
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
      if (await renderShortOverviews(state, hooks, renderer, reader, deadline)) {
        // A count on a page where not a single listing shows (a project's title, "9 woningen") says nothing we can check.
        for (const o of overviews) if (o.found === 0) o.stated = null;
        discovery.doneAt = new Date().toISOString();
      }
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
      const pages = entries.pages.map((entry) => normalizeUrl(entry)).filter((url): url is string => Boolean(url && inLanguage(url)));
      // An overview that showed no listing in its page (it shows them through scripts) has the ones the sitemap lists
      // below its own address ("/nl/kopen/deurne/appartement/5626" under "/nl/kopen"), also with a short number. Other
      // overviews keep only what they show: sitemaps keep old pages.
      const placed = new Set<string>();
      for (const o of overviews.filter((x) => x.found === 0 || x.via === "sitemap")) {
        const below = pages.filter((url) => listingBelow(url, o.url));
        if (!below.length) continue;
        o.via = "sitemap";
        below.forEach((url) => placed.add(url));
        const fresh = await hooks.found(below, o.url);
        o.found += fresh.newToOverview;
      }
      await hooks.found(pages.filter((url) => !placed.has(url) && looksLikeListingUrl(url, site)), null);
    }
    if (page.status !== 200 || item.sitemap) {
      if (item.root) settle(state, item.root);
      continue;
    }

    if (item.project && item.root) {
      // A new-build project: the units it links below its own address, or the project itself when it has no page per unit.
      const units = listingLinks(page.html, page.url, site).filter((url) => inLanguage(url) && pathOf(url).startsWith(`${pathOf(item.url)}/`));
      const fresh = await hooks.found(units.length ? units : [item.url], item.root, cardStatuses(page.html, page.url, units));
      const o = overviews.find((x) => x.url === item.root);
      if (o) o.found += fresh.newToOverview;
      settle(state, item.root);
      continue;
    }

    if (isHome && discovery.language === undefined) {
      const overviewLinks = pageLinks(page.html, page.url).filter((url) => looksLikeOverviewUrl(url, site) && !looksLikeListingUrl(url, site));
      discovery.language = homeLanguage(page.url, overviewLinks);
    }
    let cards = listingLinks(page.html, page.url, site).filter(inLanguage);
    // A page the menu or a teaser links like an overview, whose address follows the template of the listings on the
    // overviews ("/te-koop/ghoy/grond/landbouwgrond-5000m2/230" next to ".../793"), is one more listing.
    if (item.root === item.url && isListingShape(discovery, item.url)) {
      await hooks.found([item.url, ...cards], null);
      continue;
    }
    if (item.root) {
      // Cards too few to tell by their markup (an overview's last page), known by the template of the cards seen before.
      for (const url of linksWithShapes(page.html, page.url, site, discovery.listingShapes ?? [])) if (!cards.includes(url) && inLanguage(url)) cards.push(url);
      rememberShapes(discovery, cards);
    }
    const projectsRoot = item.root && PROJECTS.test(pathOf(item.root)) ? item.root : null;
    // On a new-build overview, cards without a listing id below it are projects, read for their units.
    if (projectsRoot) cards = cards.filter((url) => looksLikeListingUrl(url, site) || !pathOf(url).startsWith(`${pathOf(projectsRoot)}/`));
    const fresh = await hooks.found(cards, item.root, item.root ? cardStatuses(page.html, page.url, cards) : undefined);
    if (process.env.WEBSITE_DEBUG) console.log(`  [walk] ${page.url} root=${item.root ?? "-"} cards=${cards.length} new=${fresh.newToOverview}/${fresh.newToSite}`);
    if (item.root) walk(state, item, page.html, page.url, cards.length, fresh.newToOverview, fresh.newToSite, visited);
    const projects = projectsRoot ? queueProjects(state, projectsRoot, page.html, page.url, cards, visited, reader, inLanguage) : [];

    // Overviews this page links to (the home page's menu, "new builds" on an overview): page 1 of each, the shallowest first.
    const roots = new Set([...overviews.map((o) => o.url), ...discovery.queue.filter((q) => q.root === q.url).map((q) => q.url)]);
    const links = pageLinks(page.html, page.url)
      .filter((url) => looksLikeOverviewUrl(url, site) && !looksLikeListingUrl(url, site) && !cards.includes(url) && !projects.includes(url) && inLanguage(url) && !isArchiveUrl(url))
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

/** An address two or more levels below an overview's that ends in a number: one listing of that overview. */
export function listingBelow(url: string, overview: string): boolean {
  const path = pathOf(url).replace(/\/+$/, "");
  const base = pathOf(overview).replace(/\/+$/, "");
  if (!base || !path.startsWith(`${base}/`)) return false;
  const rest = path.slice(base.length + 1).split("/");
  return rest.length >= 2 && /^\d{3,9}$/.test(rest.at(-1)!);
}

const MAX_SHAPES = 20;

/** Remembers the address templates of an overview's cards that carry a number, to know listings linked elsewhere. */
function rememberShapes(discovery: WebsiteDiscovery, cards: string[]) {
  const shapes = new Set(discovery.listingShapes ?? []);
  for (const url of cards) {
    const shape = urlShape(url);
    if (shape.includes("#") && shapes.size < MAX_SHAPES) shapes.add(shape);
  }
  if (shapes.size) discovery.listingShapes = [...shapes];
}

const isListingShape = (discovery: WebsiteDiscovery, url: string) => (discovery.listingShapes ?? []).includes(urlShape(url));

/** Each listing under the first address the search saw for it, also when the site links it under several. */
function oneAddressPerListing(state: DiscoveryState, hooks: DiscoveryHooks): DiscoveryHooks {
  return {
    found(urls, root, badges) {
      const keys = (state.discovery.keys ??= {});
      const same = new Map<string, string>();
      for (const url of urls) same.set(url, (keys[listingKey(url)] ??= url));
      const mapped = badges && new Map([...badges].map(([url, badge]) => [same.get(url) ?? url, badge]));
      return hooks.found([...new Set(same.values())], root, mapped);
    },
  };
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
  // A page showing more cards than it says it has isn't saying how many it has.
  const said = statedTotal(html);
  if (o.stated == null && said != null && said >= cardCount) o.stated = said;

  const queued = new Set(discovery.queue.map((q) => q.url));
  const unseen = (url: string | null): url is string => Boolean(url && !visited.has(url) && !queued.has(url) && url !== pageUrl);
  const next: QueueItem[] = [];
  if (item.guess && fresh > 0) {
    // A page address we tried works: go on that way, drop the other tries, and try only this way on the site's other overviews.
    discovery.queue = discovery.queue.filter((q) => !(q.root === root && q.guess));
    discovery.pagingKey ??= pagingKey(item.url) ?? undefined;
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
    } else if (isFirst && cardCount > 0 && (o.stated != null ? o.found < o.stated : cardCount >= MIN_CARDS && newToSite > 0)) {
      // Without a stated count, only an overview that brought listings we didn't have: one showing only known ones is a slice of another.
      const tries = guessedPages(pageUrl, 2, cardCount).filter(unseen);
      const known = discovery.pagingKey;
      next.push(...(known ? tries.filter((url) => pagingKey(url) === known) : tries).map((url) => ({ url, root, guess: true })));
    }
  }
  discovery.queue.unshift(...next);
  settle(state, root);
}

/**
 * The projects a new-build overview links, queued to be read: pages below its address without a listing id, at
 * /nieuwbouw/<city>/<name> when there are such, else /nieuwbouw/<name>.
 */
function queueProjects(
  state: DiscoveryState,
  root: string,
  html: string,
  pageUrl: string,
  cards: string[],
  visited: Set<string>,
  reader: DiscoveryReader,
  inLanguage: (url: string) => boolean,
): string[] {
  const { discovery } = state;
  const below = [...new Set(pageLinks(html, pageUrl))].filter(
    (url) =>
      sameSite(url, reader.site) &&
      pathOf(url).startsWith(`${pathOf(root)}/`) &&
      new URL(url).search === "" &&
      firstPage(url) === url &&
      !cards.includes(url) &&
      !looksLikeListingUrl(url, reader.site) &&
      inLanguage(url) &&
      reader.robots.allowed(url),
  );
  const twoDown = below.filter((url) => depth(url) === depth(root) + 2);
  const projects = twoDown.length ? twoDown : below.filter((url) => depth(url) === depth(root) + 1);
  const queued = new Set(discovery.queue.map((q) => q.url));
  const fresh = projects.filter((url) => !visited.has(url) && !queued.has(url)).slice(0, Math.max(0, MAX_PROJECTS - (discovery.projects ?? 0)));
  discovery.projects = (discovery.projects ?? 0) + fresh.length;
  discovery.queue.unshift(...fresh.map((url) => ({ url, root, project: true })));
  return below;
}

/** An overview with nothing left in the queue is complete. */
function settle(state: DiscoveryState, root: string) {
  const o = state.overviews.find((x) => x.url === root);
  if (o && !state.discovery.queue.some((q) => q.root === root)) o.complete = true;
}

/**
 * Overviews that hold fewer listings than they say after reading all their pages, or none at all: when a browser is
 * available, read them once more with it (some sites only load the rest while you scroll or click "more", or build the
 * whole list with scripts). False while one is left.
 */
async function renderShortOverviews(state: DiscoveryState, hooks: DiscoveryHooks, renderer: Renderer | null | undefined, reader: DiscoveryReader, deadline: number) {
  if (!renderer) return true;
  const rendered = (state.discovery.rendered ??= []);
  for (const o of state.overviews) {
    // Short of what it states, or a for-sale or for-rent overview where not one listing showed (built by its scripts).
    const short = o.stated != null ? o.found < o.stated : o.found === 0 && SALE_OR_RENT.test(pathOf(o.url));
    // Twice at most: a read cut short by the end of a run gets one more go in a run of its own.
    if (!short || rendered.filter((url) => url === o.url).length >= 2 || !reader.robots.allowed(o.url)) continue;
    // A browser read takes a while: leave it to the next run when this one is nearly over.
    if (deadline - Date.now() < 25_000) return false;
    rendered.push(o.url);
    const html = await renderer(o.url, deadline).catch(() => null);
    // Stopped by the end of the run rather than by the list's end: what it saw counts, and the next run reads it again.
    const cut = Date.now() >= deadline - 2_000;
    if (!html) {
      if (cut) return false;
      continue;
    }
    const language = state.discovery.language ?? null;
    const cards = listingLinks(html, o.url, reader.site).filter((url) => [null, language].includes(languageOf(url)));
    const fresh = await hooks.found(cards, o.url, cardStatuses(html, o.url, cards));
    if (fresh.newToOverview > 0) {
      o.found += fresh.newToOverview;
      o.via = "browser";
    }
    if (cut) return false;
  }
  return true;
}
