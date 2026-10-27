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
import { extractListing, isListingPage, isRemovedListingPage, pageLinks, pageText, sameSite } from "../src/website/extract";
import { cardStatuses, statedCount } from "../src/website/overview";
import { SiteReader } from "../src/website/reader";

// Only sites whose owner agreed to be read for testing.
const sites = ["https://www.immo-zone.be"];
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
  const sitemapOnly = [...shownOn].filter(([, t]) => t.size === 1 && t.has("*")).map(([url]) => url);
  console.log(
    `search ${discovery.doneAt ? "done" : "NOT done"} in ${Math.round((Date.now() - started) / 1000)}s: ${discovery.visited.length} pages read, ${discovery.queue.length} left, ${discovery.sitemapsRead ?? 0} sitemaps, language ${discovery.language ?? "(none)"}, paging ${discovery.pagingKey ?? "-"}, browser ${process.env.CHROMIUM_PATH ? "on" : "off"}${error ? `, error: ${error}` : ""}`,
  );
  console.log(`listing pages found: ${shownOn.size}, of which ${sitemapOnly.length} only in a sitemap`);
  for (const o of overviews) {
    const verdict = o.stated == null ? "no total shown" : o.found >= o.stated ? "ALL" : `MISSING ${o.stated - o.found}`;
    const badges = [...(pagesOf.get(o.url) ?? new Map<string, string[]>())].flatMap(([page, urls]) => {
      const statuses = cardStatuses(html.get(page) ?? "", page, urls);
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
      console.log(`      other links on it: ${others.slice(0, 30).map((url) => `${url.replace(site, "")}${reader.robots.allowed(url) ? "" : " (robots.txt: no)"}`).join(" ")}`);
    }
  }
  if (discovery.queue.length) console.log(`  next in queue: ${discovery.queue.slice(0, 5).map((q) => q.url).join(" ")}`);

  // Samples read the way the importer reads them: the pages only a sitemap lists first, then spread over the overviews.
  const readUntil = Date.now() + minutes("PROBE_READ_MINUTES", 8);
  const boilerplate = await reader.siteBoilerplate();
  const outcome = new Map<string, { status: string; why: string }>();
  const readOne = async (url: string, shownOnOverview: boolean) => {
    const page = await reader.read(url);
    if (!("html" in page)) return outcome.set(url, { status: "unreadable", why: page.error });
    const { listing } = extractListing(page.html, page.url, boilerplate);
    const text = pageText(page.html);
    const title = short(page.html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "", 80);
    if (page.status >= 400) return outcome.set(url, { status: "offline", why: `HTTP ${page.status}` });
    if (isRemovedListingPage(listing, page.html)) return outcome.set(url, { status: "offline", why: short(text.split("\n").find((l) => /niet (meer|langer)|plus disponible|no longer|verkocht|verhuurd/i.test(l)) ?? "", 100) });
    if (!isListingPage(listing, page.html, shownOnOverview)) return outcome.set(url, { status: "not a listing", why: title });
    const hint = text.split("\n").find((l) => /\b(verkocht|vendu|sold|verhuurd|lou[ée]|rented|optie|option|compromis)\b/i.test(l));
    return outcome.set(url, { status: listing.status ?? "active", why: `${listing.reference ?? "-"} ${listing.street ?? ""} ${listing.city ?? ""} €${listing.price ?? "?"}${hint ? ` | "${short(hint, 80)}"` : ""}` });
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
  };
  report("(only in a sitemap)", sitemapOnly);
  for (const [root, urls] of byOverview) report(root.replace(site, "") || "/", urls);
}

main();
