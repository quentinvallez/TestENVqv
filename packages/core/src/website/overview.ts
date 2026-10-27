import { decodeEntities, looksLikeListingUrl, normalizeUrl, pageLinks, pageText, sameSite } from "./extract";

/*
 * Overview pages ("Te koop", "À louer", "Nieuwbouw"): the count the site says
 * it has, the listing cards on the page, and the way to the next page. Pure
 * functions of the HTML, so they are tested without the network.
 */

const countWords =
  "resultaten|resultaat|results?|résultats?|panden|pand|biens?|woningen|woning|properties|property|objecten|zoekertjes|annonces?|immeubles?|eigendommen|projecten|projets?|appartementen|huizen|listings?|offres?|aanbiedingen";

/**
 * The number of listings the page says it shows: "265 resultaten", "80 panden te koop", "Résultats 1 - 12 sur 265",
 * "1-24 of 265". Null when the page doesn't say.
 */
export function statedTotal(html: string): number | null {
  const text = pageText(html);
  const toNumber = (raw: string) => {
    const n = Number(raw.replace(/[.\s  ]/g, ""));
    return Number.isInteger(n) && n > 0 && n < 100_000 ? n : null;
  };
  // "1 - 12 van 265", "1–24 of 265", "1 à 12 sur 265"
  const range = text.match(/\b\d{1,5}\s*(?:-|–|à|tot|to)\s*\d{1,5}\s*(?:van|of|sur|de|\/)\s*(\d{1,3}(?:[.\s  ]\d{3})*|\d{1,6})\b/i);
  if (range) return toNumber(range[1]!);
  // "265 resultaten", "(265) panden", but not "3 slaapkamers" or a price.
  const counted = new RegExp(`(?:^|[^\\d€.,])(\\d{1,3}(?:[.\\u00a0\\u202f]\\d{3})*|\\d{1,6})\\)?\\s*(?:${countWords})\\b`, "im");
  for (const line of text.split("\n")) {
    if (line.length > 120 || /€|eur\b/i.test(line)) continue;
    const m = line.match(counted);
    if (m) return toNumber(m[1]!);
  }
  return null;
}

/** Listing URLs on a page, also when they sit in data attributes or the page's own data (JSON) instead of links. */
export function listingLinks(html: string, pageUrl: string, site: string): string[] {
  const found = new Set(pageLinks(html, pageUrl).filter((url) => looksLikeListingUrl(url, site)));
  for (const m of html.matchAll(/["'(]((?:https?:)?(?:\\?\/){1,2}[^"'\s()<>]{4,300})["')]/gi)) {
    const raw = decodeEntities(m[1]!.replace(/\\\//g, "/"));
    if (!raw.startsWith("/") && !/^https?:/i.test(raw)) continue;
    const url = normalizeUrl(raw, pageUrl);
    if (url && looksLikeListingUrl(url, site)) found.add(url);
  }
  return [...found];
}

const pageParams = ["page", "pagina", "p", "pg", "pageindex", "pagenr", "pagenumber", "paged", "pag", "currentpage", "blz"];
const offsetParams = ["start", "offset", "from", "skip"];

/** The page number a URL asks for, when it asks for one (1 for the plain overview). */
export function pageNumber(url: string): { number: number; offset: boolean } | null {
  const u = new URL(url);
  for (const [key, value] of u.searchParams) {
    const k = key.toLowerCase();
    if (pageParams.includes(k) && /^\d{1,4}$/.test(value)) return { number: Number(value), offset: false };
    if (offsetParams.includes(k) && /^\d{1,6}$/.test(value)) return { number: Number(value), offset: true };
  }
  const path = u.pathname.match(/\/(?:page|pagina|p|blz)[/-]?(\d{1,4})\/?$/i);
  return path ? { number: Number(path[1]), offset: false } : null;
}

/** The overview without its page number: page 1, the key the pages of one overview share. */
export function firstPage(url: string): string {
  const u = new URL(url);
  for (const key of [...u.searchParams.keys()]) if ([...pageParams, ...offsetParams].includes(key.toLowerCase())) u.searchParams.delete(key);
  u.pathname = u.pathname.replace(/\/(?:page|pagina|p|blz)[/-]?\d{1,4}\/?$/i, "") || "/";
  return normalizeUrl(u.toString()) ?? url;
}

/** Links to further pages of the same overview, in page order: rel="next" and numbered page links. */
export function nextPageLinks(html: string, pageUrl: string): string[] {
  const base = firstPage(pageUrl);
  const current = pageNumber(pageUrl)?.number ?? 0;
  const out = new Map<string, number>();
  for (const m of html.matchAll(/<(?:link|a)\b[^>]*\brel=["']?next["']?[^>]*>/gi)) {
    const href = m[0].match(/\bhref\s*=\s*["']([^"']+)["']/i)?.[1];
    const url = href && normalizeUrl(decodeEntities(href), pageUrl);
    if (url && url !== normalizeUrl(pageUrl)) out.set(url, pageNumber(url)?.number ?? current + 1);
  }
  for (const url of pageLinks(html, pageUrl)) {
    const n = pageNumber(url);
    if (n && n.number > current && firstPage(url) === base) out.set(url, n.number);
  }
  return [...out].sort((a, b) => a[1] - b[1]).map(([url]) => url);
}

/** Ways sites commonly number their overview pages, to try when the page shows no page links but says it has more. */
export function guessedPages(pageUrl: string, page: number, perPage: number): string[] {
  const base = new URL(firstPage(pageUrl));
  const withParam = (key: string, value: number) => {
    const u = new URL(base);
    u.searchParams.set(key, String(value));
    return u.toString();
  };
  const withPath = (segment: string) => {
    const u = new URL(base);
    u.pathname = `${u.pathname.replace(/\/$/, "")}/${segment}`;
    return u.toString();
  };
  return [withParam("page", page), withParam("pagina", page), withPath(`page/${page}`), withParam("p", page), withParam("pageindex", page), withParam("start", (page - 1) * perPage), withParam("offset", (page - 1) * perPage)]
    .map((url) => normalizeUrl(url))
    .filter((url): url is string => Boolean(url));
}

/** Overview pages on a site, from the links on a page; the shallowest first ("/kopen" lists everything, "/kopen/aalst" a slice). */
export function sameSiteLinks(html: string, pageUrl: string, site: string): string[] {
  return pageLinks(html, pageUrl).filter((url) => sameSite(url, site));
}
