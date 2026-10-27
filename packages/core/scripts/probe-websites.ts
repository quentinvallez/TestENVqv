/*
 * Development probe: how do agency sites list their listings, and how do we read them? Prints what it
 * finds; stores nothing. Obeys robots.txt and its crawl delay.
 * Run: npx tsx packages/core/scripts/probe-websites.ts
 */
import { boilerplateLines, extractListing, isListingPage, isRemovedListingPage, normalizeUrl, pageLinks, pageText } from "../src/website/extract";
import { fetchSitePage } from "../src/website/fetch";
import { listingLinks, statedTotal } from "../src/website/overview";
import { allowAll, parseRobots, type RobotsPolicy } from "../src/website/robots";

type Plan = { site: string; overviews: string[]; tryPages?: string[]; details?: number };
const plans: Plan[] = [
  { site: "https://www.immo-zone.be", overviews: ["/kopen", "/huren"], details: 90 },
  { site: "https://www.trevi.be", overviews: ["/fr/acheter-bien-immobilier"], tryPages: ["/fr/acheter-bien-immobilier?currentPage_p=2", "/fr/acheter-bien-immobilier?page=2"], details: 6 },
  { site: "https://www.dewaele.com/nl", overviews: ["/nl/te-koop"], tryPages: ["/nl/te-koop?page=2", "/nl/te-koop/alle?page=2"], details: 6 },
  { site: "https://www.immodavinci.be", overviews: ["/residentieel/kopen"], tryPages: ["/residentieel/kopen?page=2"], details: 3 },
];

const short = (s: string, n = 160) => (s.length > n ? `${s.slice(0, n)}…` : s).replace(/\s+/g, " ");

async function main() {
  const only = process.argv.slice(2);
  for (const plan of plans) if (!only.length || only.some((o) => plan.site.includes(o))) await probe(plan).catch((e) => console.log(`!! ${plan.site}: ${e instanceof Error ? e.stack : e}`));
}

async function probe(plan: Plan) {
  const { site } = plan;
  console.log(`\n================ ${site}`);
  let robots: RobotsPolicy = allowAll;
  const r = await fetchSitePage(`${new URL(site).origin}/robots.txt`, site).catch(() => null);
  if (r?.status === 200) robots = parseRobots(r.html);
  const delay = Math.max(1000, Math.min(15, robots.crawlDelay ?? 0) * 1000);
  let last = 0;
  const get = async (url: string) => {
    if (!robots.allowed(url)) {
      console.log(`  (robots disallows ${url})`);
      return null;
    }
    const wait = last + delay - Date.now();
    if (wait > 0) await new Promise((res) => setTimeout(res, wait));
    try {
      return await fetchSitePage(url, site, robots.allowed);
    } catch (e) {
      console.log(`  fetch failed ${url}: ${e instanceof Error ? e.message : e}`);
      return null;
    } finally {
      last = Date.now();
    }
  };

  const cards = new Set<string>();
  for (const path of plan.overviews) {
    const url = new URL(path, site).toString();
    const page = await get(url);
    if (!page) continue;
    const found = listingLinks(page.html, page.url, site);
    found.forEach((c) => cards.add(c));
    const text = pageText(page.html);
    console.log(`\n--- ${url} (${page.status}, ${page.html.length} bytes) stated ${statedTotal(page.html)}, cards ${found.length}`);
    console.log(`count lines: ${text.split("\n").filter((l) => /\d/.test(l) && /(resultat|résultat|result|panden|biens|woningen|propert)/i.test(l)).slice(0, 6).map((l) => short(l, 80)).join(" | ")}`);
    for (const m of page.html.matchAll(/<form\b[^>]*method=["']?get["']?[^>]*>[\s\S]{0,4000}?<\/form>/gi)) {
      const inputs = [...m[0].matchAll(/<(?:input|select)\b[^>]*\bname=["']([^"']+)["'][^>]*?(?:\bvalue=["']([^"']*)["'])?[^>]*>/gi)].map((i) => `${i[1]}=${i[2] ?? ""}`);
      console.log(`  GET form ${short(m[0].match(/<form[^>]*>/i)![0], 160)} inputs: ${inputs.slice(0, 30).join(" ")}`);
    }
    for (const word of ["Suivant", "Volgende", "Toon meer", "Meer laden", "Load more", "page=", "currentPage"]) {
      const i = page.html.indexOf(word);
      if (i > 0) console.log(`  around "${word}": ${short(page.html.slice(Math.max(0, i - 500), i + 300), 800)}`);
    }
    const pageLinksFound = pageLinks(page.html, page.url).filter((l) => /[?&](page|pagina|p|currentPage\w*)=\d/i.test(l));
    console.log(`  page links: ${pageLinksFound.slice(0, 6).join(" ")}`);
  }
  for (const path of plan.tryPages ?? []) {
    const url = new URL(path, site).toString();
    const page = await get(url);
    if (!page) continue;
    const found = listingLinks(page.html, page.url, site);
    const fresh = found.filter((c) => !cards.has(c));
    console.log(`\n--- try ${url}: ${page.status}, cards ${found.length}, new ${fresh.length}; e.g. ${fresh.slice(0, 2).join(" ")}`);
  }

  // Read some cards the way the importer does.
  const n = plan.details ?? 0;
  if (!n) return;
  const home = await get(site);
  const boilerplate = home ? boilerplateLines(home.html) : new Set<string>();
  const refs = new Map<string, number>();
  const statuses = new Map<string, number>();
  for (const url of [...cards].slice(0, n)) {
    const page = await get(url);
    if (!page) continue;
    const { listing, structured } = extractListing(page.html, url, boilerplate);
    const listingPage = isListingPage(listing, page.html);
    const removed = isRemovedListingPage(listing, page.html);
    const key = `${removed ? "REMOVED" : listingPage ? listing.status ?? "active?" : "NOT-A-LISTING"}`;
    statuses.set(key, (statuses.get(key) ?? 0) + 1);
    refs.set(listing.reference ?? "-", (refs.get(listing.reference ?? "-") ?? 0) + 1);
    console.log(
      `  ${page.status} ${key} ref=${listing.reference} ${listing.transaction}/${listing.propertyType} €${listing.price} ${listing.street ?? ""} ${listing.houseNumber ?? ""} ${listing.postcode ?? ""} ${listing.city ?? ""} agent=${listing.agentName} ${structured ? "[structured]" : ""} ${normalizeUrl(page.url) !== url ? `→ ${page.url}` : ""} ${short(url.replace(site, ""), 70)}`,
    );
    if (key !== "active" && key !== "active?") {
      const text = pageText(page.html);
      const hits = text.split("\n").filter((l) => /(verkocht|verhuurd|optie|voorbehoud|compromis|vendu|lou[ée]|option|sold|rented|niet meer|plus disponible|offline)/i.test(l)).slice(0, 5);
      console.log(`      status lines: ${hits.map((l) => short(l, 90)).join(" | ")}`);
    }
  }
  console.log(`  statuses: ${[...statuses].map(([k, v]) => `${k} ${v}`).join(", ")}`);
  console.log(`  repeated references: ${[...refs].filter(([, v]) => v > 1).map(([k, v]) => `${k}×${v}`).join(", ") || "none"}`);
}

main();
