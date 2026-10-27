/*
 * Measures the website search on real agency sites, as the import runs it (robots.txt and its crawl delay
 * obeyed): per overview, the count the site states next to what we found and how, then a sample of the
 * listings found read to count them per status. Stores nothing.
 * Run: npx tsx packages/core/scripts/probe-websites.ts [words of the site addresses]
 * Env: PROBE_SEARCH_MINUTES (default 20), PROBE_READ_MINUTES (default 8), CHROMIUM_PATH (browser fallback).
 */
import { continueDiscovery, newDiscovery, type DiscoveryHooks } from "../src/website/discover";
import { openBrowser } from "../src/website/browser";
import { extractListing, isListingPage, isRemovedListingPage } from "../src/website/extract";
import { SiteReader } from "../src/website/reader";

const sites = ["https://www.immo-zone.be", "https://www.trevi.be", "https://www.dewaele.com/nl", "https://www.immodavinci.be"];
const minutes = (name: string, fallback: number) => Number(process.env[name] ?? fallback) * 60_000;

async function main() {
  const only = process.argv.slice(2);
  for (const site of sites) if (!only.length || only.some((o) => site.includes(o))) await probe(site).catch((e) => console.log(`!! ${site}: ${e instanceof Error ? e.stack : e}`));
}

async function probe(site: string) {
  console.log(`\n================ ${site}`);
  const started = Date.now();
  const reader = await SiteReader.open(site);
  console.log(`crawl delay ${reader.delayMs / 1000}s`);

  // Which overviews showed each listing page ("*": a sitemap).
  const shownOn = new Map<string, Set<string>>();
  const hooks: DiscoveryHooks = {
    found: async (urls, root) => {
      const tag = root ?? "*";
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
    error = (await continueDiscovery(reader, state, hooks, started + minutes("PROBE_SEARCH_MINUTES", 20), browser?.render)).error;
  } finally {
    await browser?.close();
  }
  const { discovery, overviews } = state;
  console.log(
    `search ${discovery.doneAt ? "done" : "NOT done"} in ${Math.round((Date.now() - started) / 1000)}s: ${discovery.visited.length} pages read, ${discovery.queue.length} left, ${discovery.sitemapsRead ?? 0} sitemaps, browser ${process.env.CHROMIUM_PATH ? "on" : "off"}${error ? `, error: ${error}` : ""}`,
  );
  console.log(`listing pages found: ${shownOn.size} (${[...shownOn.values()].filter((t) => t.size === 1 && t.has("*")).length} only in a sitemap)`);
  for (const o of overviews) {
    const verdict = o.stated == null ? "no total shown" : o.found >= o.stated ? "ALL" : `MISSING ${o.stated - o.found}`;
    console.log(`  ${o.url.replace(site, "") || "/"}  stated ${o.stated ?? "-"}  found ${o.found}  ${verdict}  via ${o.via}, ${o.pages} pages${o.complete ? "" : ", not complete"}`);
  }
  if (discovery.queue.length) console.log(`  next in queue: ${discovery.queue.slice(0, 5).map((q) => q.url).join(" ")}`);

  // A sample of the listings, spread over the overviews, read the way the importer does.
  const readUntil = Date.now() + minutes("PROBE_READ_MINUTES", 8);
  const byOverview = new Map<string, string[]>();
  for (const [url, tags] of shownOn) for (const tag of tags) byOverview.set(tag, [...(byOverview.get(tag) ?? []), url]);
  const sample: string[] = [];
  for (let i = 0; sample.length < shownOn.size; i++) {
    let added = false;
    for (const urls of byOverview.values()) if (urls[i] && !sample.includes(urls[i])) (sample.push(urls[i]), (added = true));
    if (!added && [...byOverview.values()].every((urls) => i >= urls.length)) break;
  }
  const boilerplate = await reader.siteBoilerplate();
  const statusOf = new Map<string, string>();
  const references = new Map<string, number>();
  for (const url of sample) {
    if (!reader.fits(readUntil)) break;
    const page = await reader.read(url);
    if (!("html" in page)) {
      statusOf.set(url, "unreadable");
      continue;
    }
    const { listing } = extractListing(page.html, page.url, boilerplate);
    const status =
      page.status >= 400 || isRemovedListingPage(listing, page.html) ? "offline" : !isListingPage(listing, page.html) ? "not a listing" : (listing.status ?? "active");
    statusOf.set(url, status);
    if (listing.reference) references.set(listing.reference, (references.get(listing.reference) ?? 0) + 1);
  }
  console.log(`read ${statusOf.size} of ${shownOn.size} listing pages`);
  for (const [tag, urls] of byOverview) {
    const counts = new Map<string, number>();
    for (const url of urls) if (statusOf.has(url)) counts.set(statusOf.get(url)!, (counts.get(statusOf.get(url)!) ?? 0) + 1);
    const read = [...counts.values()].reduce((a, b) => a + b, 0);
    console.log(`  ${tag === "*" ? "(sitemaps)" : tag.replace(site, "") || "/"}: ${urls.length} found, ${read} read: ${[...counts].map(([k, v]) => `${k} ${v}`).join(", ")}`);
  }
  const repeated = [...references].filter(([, n]) => n > 1);
  console.log(`references shared by several listings: ${repeated.length}${repeated.length ? ` (e.g. ${repeated.slice(0, 5).map(([r, n]) => `${r}×${n}`).join(", ")})` : ""}`);
}

main();
