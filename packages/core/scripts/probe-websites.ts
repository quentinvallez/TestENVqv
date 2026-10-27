/*
 * Development probe: how do agency sites list their listings? Prints, per overview page, the count
 * the site states, the links we find, pagination and data hints. Stores nothing.
 * Run: npx tsx packages/core/scripts/probe-websites.ts https://www.immo-zone.be ...
 */
import { looksLikeListingUrl, looksLikeOverviewUrl, normalizeUrl, pageLinks, pageText } from "../src/website/extract";
import { fetchSitePage } from "../src/website/fetch";
import { allowAll, parseRobots, type RobotsPolicy } from "../src/website/robots";

const sites = process.argv.slice(2);
const short = (s: string, n = 160) => (s.length > n ? `${s.slice(0, n)}…` : s).replace(/\s+/g, " ");

async function main() {
  for (const site of sites) await probe(site).catch((e) => console.log(`!! ${site}: ${e instanceof Error ? e.message : e}`));
}

async function probe(site: string) {
  console.log(`\n================ ${site}`);
  let robots: RobotsPolicy = allowAll;
  const r = await fetchSitePage(`${new URL(site).origin}/robots.txt`, site).catch(() => null);
  if (r?.status === 200) robots = parseRobots(r.html);
  const delay = Math.max(1000, (robots.crawlDelay ?? 0) * 1000);
  console.log(`robots: status ${r?.status} crawl-delay ${robots.crawlDelay} sitemaps ${robots.sitemaps.join(" ")}`);
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

  const home = await get(site);
  if (!home) return;
  console.log(`home: ${home.status} ${home.url} ${home.html.length} bytes`);
  const depth = (u: string) => new URL(u).pathname.split("/").filter(Boolean).length;
  const homeLinks = pageLinks(home.html, home.url);
  const overviews = homeLinks.filter((l) => looksLikeOverviewUrl(l, site)).sort((a, b) => depth(a) - depth(b));
  console.log(`home links ${homeLinks.length}, listing-like ${homeLinks.filter((l) => looksLikeListingUrl(l, site)).length}, overview-like ${overviews.length}:`);
  for (const o of overviews.slice(0, 25)) console.log(`  ${o}`);

  const extra = (process.env.PROBE_PATHS ?? "").split(",").filter(Boolean).map((p) => new URL(p, site).toString());
  const toRead = [...new Set([...extra.filter((u) => new URL(u).hostname === new URL(site).hostname), ...overviews.slice(0, 6)])];
  for (const url of toRead) {
    const page = await get(url);
    if (!page) continue;
    analyse(page.url, page.status, page.html, site);
  }
}

function shape(url: string) {
  const u = new URL(url);
  const segs = u.pathname.split("/").filter(Boolean);
  return `${segs.map((s, i) => (i === 0 ? s : /\d{3,}/.test(s) ? "#" : "*")).join("/")}${u.search ? "?" + [...u.searchParams.keys()].join("&") : ""}`;
}

function analyse(url: string, status: number, html: string, site: string) {
  console.log(`\n--- ${url} (${status}, ${html.length} bytes)`);
  const text = pageText(html);
  const counts = [...text.matchAll(/(.{0,40}?)(\d[\d.  ]{0,6}\d|\d)\s*(resultaten|resultaat|results?|résultats?|panden|biens|woningen|properties|objecten|zoekertjes|annonces|immeubles|eigendommen|items)(.{0,30})/gi)]
    .slice(0, 8)
    .map((m) => short(m[0], 100));
  console.log(`stated: ${counts.length ? counts.join(" | ") : "(none)"}`);
  const links = pageLinks(html, url).filter((l) => new URL(l).hostname.replace(/^www\./, "") === new URL(site).hostname.replace(/^www\./, ""));
  const listing = links.filter((l) => looksLikeListingUrl(l, site));
  console.log(`same-site links ${links.length}, listing-like ${listing.length}; e.g. ${listing.slice(0, 3).join(" ")}`);
  const groups = new Map<string, string[]>();
  for (const l of links) groups.set(shape(l), [...(groups.get(shape(l)) ?? []), l]);
  for (const [k, v] of [...groups].sort((a, b) => b[1].length - a[1].length).slice(0, 8)) console.log(`  shape ${k}: ${v.length}  e.g. ${v[0]}`);
  // Any quoted URL-ish strings that look like listings but aren't <a href>.
  const quoted = new Set<string>();
  for (const m of html.matchAll(/["'(]((?:https?:\/\/[^"'\s)]+)|(?:\/[a-z0-9][^"'\s)<>]{4,200}))["')]/gi)) {
    const u = normalizeUrl(m[1]!.replace(/\\\//g, "/"), url);
    if (u && looksLikeListingUrl(u, site) && !listing.includes(u)) quoted.add(u);
  }
  console.log(`listing-like urls outside <a href>: ${quoted.size}; e.g. ${[...quoted].slice(0, 3).join(" ")}`);
  const pagination = links.filter((l) => /[?&](page|pagina|p|pg|pageindex|start|offset|from|skip)=\d|\/(page|pagina|p)\/\d/i.test(l));
  console.log(`pagination links ${pagination.length}: ${pagination.slice(0, 8).join(" ")}`);
  for (const m of html.matchAll(/<link[^>]+rel=["']?(next|prev)["']?[^>]*>/gi)) console.log(`  ${short(m[0])}`);
  for (const m of html.matchAll(/<(a|button|div|span)[^>]*>[^<]{0,40}(meer laden|toon meer|meer tonen|load more|show more|voir plus|plus de biens|charger plus|volgende|suivant|next)[^<]{0,40}<\/\1>/gi)) console.log(`  more: ${short(m[0], 300)}`);
  for (const m of html.matchAll(/<[^>]+(data-(?:url|href|src|endpoint|api|ajax|source|next|page|total|count|pages)[a-z-]*)=["']([^"']{1,200})["'][^>]*>/gi)) console.log(`  attr ${m[1]}="${short(m[2]!, 120)}"`);
  const scripts = [...html.matchAll(/<script[^>]*\bsrc=["']([^"']+)["']/gi)].map((m) => m[1]!);
  console.log(`scripts ${scripts.length}: ${scripts.map((s) => short(s, 90)).join(" ")}`);
  const inline = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]!);
  console.log(`inline scripts ${inline.length}, sizes ${inline.map((s) => s.length).join(",")}`);
  const hints = new Set<string>();
  for (const s of inline) for (const m of s.matchAll(/["'`]([^"'`\s]{0,80}(?:api|ajax|json|search|zoek|load|page|pand|propert|estate|listing|biens?)[^"'`\s]{0,80})["'`]/gi)) hints.add(short(m[1]!, 140));
  console.log(`inline hints: ${[...hints].slice(0, 25).join(" | ")}`);
  for (const marker of ["__NEXT_DATA__", "__NUXT__", "__INITIAL_STATE__", "__APOLLO_STATE__", "application/ld+json", "wp-json", "admin-ajax", "x-data", "hx-get", "infinite", "lazy", "omnicasa", "whise", "skarabee", "sweepbright", "zabun", "realo", "immoweb"]) {
    const n = html.split(marker).length - 1;
    if (n) console.log(`  marker ${marker}: ${n}`);
  }
  for (const m of html.matchAll(/<form[^>]*>/gi)) console.log(`  form ${short(m[0], 200)}`);
  // One card, to see its markup.
  if (listing[0]) {
    const i = html.indexOf(new URL(listing[0]).pathname);
    if (i > 0) console.log(`card: ${short(html.slice(Math.max(0, i - 700), i + 600), 1300)}`);
  }
}

main();
