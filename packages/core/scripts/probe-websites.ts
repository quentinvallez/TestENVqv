/*
 * Measures the website search on real agency sites, as the import runs it (robots.txt and its crawl delay
 * obeyed): per overview, the count the site states (and the line it says it in) next to what we found and how,
 * the status badges on its cards, then samples of the listings found, read to count them per status, with
 * examples of every status that isn't "on offer". Stores nothing.
 * Run: npx tsx packages/core/scripts/probe-websites.ts [words of the site addresses]
 * Env: PROBE_SEARCH_MINUTES (default 20), PROBE_READ_MINUTES (default 8), CHROMIUM_PATH (browser fallback).
 */
import { openBrowser } from "../src/website/browser";
import { continueDiscovery, newDiscovery, type DiscoveryHooks, type DiscoveryReader } from "../src/website/discover";
import { extractListing, isListingPage, isRemovedListingPage, looksLikeListingUrl, looksLikeOverviewUrl, pageLinks, pageText, sameSite, withoutVisitNumbers } from "../src/website/extract";
import { cardStatuses, statedCount } from "../src/website/overview";
import { listingFromPageData, pageDataUrl, withPageData } from "../src/website/page-data";
import { SiteReader } from "../src/website/reader";

// Only sites Quentin chose for testing (immo-zone since 2026-10-27; his 10 test agencies since 2026-10-28, immofrance, immotalenco, immodyck and century21-horizon since 2026-10-29).
const sites = [
  "https://www.immo-zone.be",
  "https://www.ngimmo.be",
  "https://www.tadam.immo",
  "https://www.alterimmoprestige.be",
  "https://www.immotop.be/fr/",
  "https://jurimex.be/nl",
  "https://immo-center.be/nl",
  "https://www.immobolle.be/fr",
  "https://www.leximmo.be",
  "https://www.caenen.be/nl",
  "https://www.vlaemynck.be",
  "https://www.immofrance.be",
  "https://www.immotalenco.com/nl/",
  "https://www.immodyck.be/nl/",
  "https://www.century21-horizon.be/",
];
/** Pages Quentin found missing or wrong, checked one by one. */
const checks: Record<string, string[]> = {
  ngimmo: ["https://www.ngimmo.be/fr/bien/a-louer/maison/6000-charleroi/6132111"],
  jurimex: [
    "https://jurimex.be/nl/aanbod/4295691/grond-te-koop-in-3600-genk",
    "https://jurimex.be/nl/aanbod/4012131/handelspand-te-koop-in-3600-genk",
    "https://jurimex.be/nl/aanbod/4406798/kantoorruimte-te-huur-in-3600-genk",
  ],
  immobolle: ["https://www.immobolle.be/fr/page/10004/protection-juridique"],
};
const minutes = (name: string, fallback: number) => Number(process.env[name] ?? fallback) * 60_000;
const short = (s: string, n = 140) => (s.length > n ? `${s.slice(0, n)}…` : s).replace(/\s+/g, " ").trim();
const tally = (values: string[]) => [...values.reduce((m, v) => m.set(v, (m.get(v) ?? 0) + 1), new Map<string, number>())].map(([k, v]) => `${k} ${v}`).join(", ");

async function main() {
  const only = process.argv.slice(2);
  for (const site of sites) if (!only.length || only.some((o) => site.includes(o))) await probe(site).catch((e) => console.log(`!! ${site}: ${e instanceof Error ? e.stack : e}`));
}

/** The text around a card's first link, as a rough check of what the card shows. */
function cardText(html: string, url: string): string {
  const u = new URL(url);
  const at = html.indexOf(u.pathname + u.search);
  return at < 0 ? "(not in the html)" : pageText(html.slice(Math.max(0, at - 300), at + 500));
}

async function probe(site: string) {
  console.log(`\n================ ${site}`);
  const started = Date.now();
  const reader = await SiteReader.open(site);
  console.log(`crawl delay ${reader.delayMs / 1000}s`);

  // Every page the search reads, and which overview showed each listing page ("*": a sitemap).
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
  const pagesOf = new Map<string, Map<string, string[]>>();
  const hooks: DiscoveryHooks = {
    found: async (urls, root) => {
      const tag = root ?? "*";
      if (root) pagesOf.set(root, (pagesOf.get(root) ?? new Map()).set(lastUrl, urls));
      let newToOverview = 0;
      let newToSite = 0;
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
  const browser = await openBrowser(reader);
  let error: string | undefined;
  try {
    error = (await continueDiscovery(recording, state, hooks, started + minutes("PROBE_SEARCH_MINUTES", 20), browser?.render)).error;
  } finally {
    await browser?.close();
  }
  const { discovery, overviews } = state;
  // The home page: what a visitor's first read shows, and where the search went from it.
  const home = await reader.read(reader.site);
  if ("html" in home) {
    const links = pageLinks(home.html, home.url).filter((url) => sameSite(url, site));
    const scripts = (home.html.match(/<script\b/gi) ?? []).length;
    const app = /__NEXT_DATA__|data-reactroot|ng-version|id="(app|root|__nuxt)"|window\.__NUXT__/i.test(home.html);
    console.log(`home ${home.status} ${home.url}: ${home.html.length} chars, ${links.length} links on the site, ${scripts} scripts${app ? ", script-built app" : ""}`);
    console.log(`  overview-like: ${links.filter((url) => looksLikeOverviewUrl(url, site)).slice(0, 25).map((u) => u.replace(site, "")).join(" ") || "-"}`);
    console.log(`  listing-like: ${links.filter((url) => looksLikeListingUrl(url, site)).length}`);
    console.log(`  other links: ${links.filter((url) => !looksLikeOverviewUrl(url, site) && !looksLikeListingUrl(url, site)).slice(0, 40).map((u) => u.replace(site, "")).join(" ")}`);
  } else console.log(`home unreadable: ${home.error}`);
  console.log(`robots sitemaps: ${reader.robots.sitemaps.join(" ") || "-"}`);
  const browser2 = await openBrowser(reader);
  const sitemapOnly = [...shownOn].filter(([, t]) => t.size === 1 && t.has("*")).map(([url]) => url);
  console.log(
    `search ${discovery.doneAt ? "done" : "NOT done"} in ${Math.round((Date.now() - started) / 1000)}s: ${discovery.visited.length} pages read, ${discovery.queue.length} left, ${discovery.sitemapsRead ?? 0} sitemaps, language ${discovery.language ?? "(none)"}, paging ${discovery.pagingKey ?? "-"}, browser ${process.env.CHROMIUM_PATH ? "on" : "off"}${error ? `, error: ${error}` : ""}`,
  );
  console.log(`listing pages found: ${shownOn.size}, of which ${sitemapOnly.length} only in a sitemap`);
  // What the importer keeps from the cards: their badge counts when the listing's own page says nothing else.
  const cardBadge = new Map<string, string>();
  for (const o of overviews) {
    const verdict = o.stated == null ? "no total shown" : o.found >= o.stated ? "ALL" : `MISSING ${o.stated - o.found}`;
    const badges = [...(pagesOf.get(o.url) ?? new Map<string, string[]>())].flatMap(([page, urls]) => {
      const statuses = cardStatuses(html.get(page) ?? "", page, urls);
      for (const [url, badge] of statuses) cardBadge.set(url, badge);
      return urls.map((url) => statuses.get(url) ?? "on offer");
    });
    console.log(`  ${o.url.replace(site, "") || "/"}  stated ${o.stated ?? "-"}  found ${o.found}  ${verdict}  via ${o.via}, ${o.pages} pages${o.complete ? "" : ", not complete"}  cards: ${tally(badges) || "-"}`);
    // What a few cards' own elements say, to check the badges are read from the right card.
    const [page, urls] = [...(pagesOf.get(o.url) ?? new Map<string, string[]>())][0] ?? ["", []];
    const statuses = cardStatuses(html.get(page) ?? "", page, urls);
    for (const url of [...urls.filter((u) => statuses.has(u)).slice(0, 3), ...urls.filter((u) => !statuses.has(u)).slice(0, 2)]) {
      console.log(`      card ${statuses.get(url) ?? "on offer"}: ${url.replace(site, "")}  "${short(cardText(html.get(page) ?? "", url), 200)}"`);
    }
    const first = html.get(o.url) ?? "";
    if (o.stated != null) console.log(`      stated in: "${short(statedCount(first)?.line ?? "?", 120)}"`);
    if (o.found === 0 || (o.stated != null && o.found < o.stated)) {
      const cards = new Set([...(pagesOf.get(o.url)?.values() ?? [])].flat());
      const others = pageLinks(first, o.url).filter((url) => sameSite(url, site) && !cards.has(url));
      if (browser2) {
        const rendered = await browser2.render(o.url, Date.now() + 60_000).catch((e) => `ERROR ${e}`);
        const renderedLinks = rendered && !rendered.startsWith("ERROR") ? pageLinks(rendered, o.url).filter((url) => sameSite(url, site)) : [];
        console.log(`      with a browser: ${rendered?.startsWith("ERROR") ? rendered : `${renderedLinks.filter((url) => looksLikeListingUrl(url, site)).length} listing-like of ${renderedLinks.length} links`}; e.g. ${renderedLinks.filter((url) => !looksLikeOverviewUrl(url, site)).slice(0, 15).map((u) => u.replace(site, "")).join(" ")}`);
      }
      console.log(`      other links on it: ${others.slice(0, 30).map((url) => `${url.replace(site, "")}${reader.robots.allowed(url) ? "" : " (robots.txt: no)"}`).join(" ")}`);
    }
  }
  if (discovery.queue.length) console.log(`  next in queue: ${discovery.queue.slice(0, 5).map((q) => q.url).join(" ")}`);


  // Samples read the way the importer reads them: the pages only a sitemap lists first, then spread over the overviews.
  const readUntil = Date.now() + minutes("PROBE_READ_MINUTES", 8);
  const boilerplate = await reader.siteBoilerplate();
  const outcome = new Map<string, { status: string; why: string }>();
  const readOne = async (url: string, shownOnOverview: boolean) => {
    const home = (address: string) => /^(\/[a-z]{2})?\/?$/i.test(new URL(address).pathname);
    let page = await reader.read(url);
    // As the importer: a page sent to the home page is read again without the numbers of the visit that found it.
    const lasting = "html" in page && home(page.url) && withoutVisitNumbers(url);
    if (lasting) {
      const again = await reader.read(lasting);
      if ("html" in again && !home(again.url)) page = again;
    }
    if (!("html" in page)) return outcome.set(url, { status: "unreadable", why: page.error });
    const dataUrl = pageDataUrl(page.html, page.url);
    const dataRead = dataUrl ? await reader.read(dataUrl) : null;
    const pageData = dataRead && "html" in dataRead && dataRead.status === 200 ? listingFromPageData(dataRead.html, page.url) : null;
    const read = extractListing(page.html, page.url, boilerplate).listing;
    const listing = pageData ? withPageData(read, pageData) : read;
    const text = pageText(page.html);
    const title = short(page.html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "", 80);
    if (page.status >= 400) return outcome.set(url, { status: "offline", why: `HTTP ${page.status}` });
    if (page.url !== url && home(page.url)) return outcome.set(url, { status: "offline", why: `sent to ${page.url}` });
    if (isRemovedListingPage(listing, page.html)) return outcome.set(url, { status: "offline", why: short(text.split("\n").find((l) => /niet (meer|langer)|plus disponible|no longer|verkocht|verhuurd/i.test(l)) ?? "", 100) });
    if (!isListingPage(listing, page.html, shownOnOverview)) return outcome.set(url, { status: "not a listing", why: title });
    const hint = text.split("\n").find((l) => /\b(verkocht|vendu|sold|verhuurd|lou[ée]|rented|optie|option|compromis)\b/i.test(l));
    const status = listing.status && listing.status !== "active" ? listing.status : (cardBadge.get(url) ?? "active");
    return outcome.set(url, { status, why: `${listing.reference ?? "-"} ${listing.street ?? ""} ${listing.city ?? ""} €${listing.price ?? "?"} (${listing.agentName ?? "no agent"})${hint ? ` | "${short(hint, 80)}"` : ""}` });
  };
  const sitemapSample = sitemapOnly.slice(0, 40);
  for (const url of sitemapSample) {
    if (!reader.fits(readUntil)) break;
    await readOne(url, false);
  }
  const byOverview = new Map<string, string[]>();
  for (const [url, tags] of shownOn) for (const tag of tags) if (tag !== "*") byOverview.set(tag, [...(byOverview.get(tag) ?? []), url]);
  for (let i = 0; reader.fits(readUntil); i++) {
    const round = [...byOverview.values()].map((urls) => urls[i]).filter((url): url is string => Boolean(url) && !outcome.has(url!));
    if (![...byOverview.values()].some((urls) => i < urls.length)) break;
    for (const url of round) {
      if (!reader.fits(readUntil)) break;
      await readOne(url, true);
    }
  }
  console.log(`read ${outcome.size} of ${shownOn.size} listing pages`);
  const report = (label: string, urls: string[]) => {
    const read = urls.filter((url) => outcome.has(url));
    if (!read.length) return;
    console.log(`  ${label}: ${urls.length} found, ${read.length} read: ${tally(read.map((url) => outcome.get(url)!.status))}`);
    const examples = new Map<string, number>();
    for (const url of read) {
      const { status, why } = outcome.get(url)!;
      const shown = examples.get(status) ?? 0;
      if (shown >= (status === "active" ? 1 : 3)) continue;
      examples.set(status, shown + 1);
      console.log(`      ${status}: ${url.replace(site, "")}  ${why}`);
    }
    // Cards with a status whose page read says otherwise: either the page or the card is read wrong.
    const disagree = read.filter((url) => cardBadge.has(url) && outcome.get(url)!.status !== cardBadge.get(url));
    if (disagree.length) console.log(`      card and page disagree on ${disagree.length}, e.g. ${disagree.slice(0, 3).map((url) => `${url.replace(site, "")} card ${cardBadge.get(url)} page ${outcome.get(url)!.status}`).join("; ")}`);
    // A small site: every address, to compare one by one with the agency's own list.
    if (shownOn.size <= 120) console.log(`      all: ${urls.map((url) => url.replace(site, "")).join(" ")}`);
    const badged = urls.filter((url) => cardBadge.has(url));
    console.log(`      cards with a status: ${badged.length}, of which read: ${badged.filter((url) => outcome.has(url)).length}`);
  };
  for (const [word, urls] of Object.entries(checks)) {
    if (!site.includes(word)) continue;
    for (const url of urls) {
      if (!outcome.has(url)) await readOne(url, shownOn.has(url));
      const { status, why } = outcome.get(url)!;
      console.log(`  check ${url.replace(site, "")}: listing-like ${looksLikeListingUrl(url, site)}, found on ${[...(shownOn.get(url) ?? [])].map((t) => t.replace(site, "") || "/").join(",") || "nothing"}; read as ${status}: ${why}`);
    }
  }
  await browser2?.close();
  report("(only in a sitemap)", sitemapOnly);
  for (const [root, urls] of byOverview) report(root.replace(site, "") || "/", urls);
}

main();
