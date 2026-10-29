import { decodeEntities, looksLikeListingUrl, normalizeUrl, pageLinks, pageText, sameSite, type WebsiteListingStatus } from "./extract";

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
  return statedCount(html)?.total ?? null;
}

/** The stated count with the line it was read from. */
export function statedCount(html: string): { total: number; line: string } | null {
  const text = pageText(html);
  const toNumber = (raw: string) => {
    const n = Number(raw.replace(/[.\s  ]/g, ""));
    return Number.isInteger(n) && n > 0 && n < 100_000 ? n : null;
  };
  // "1 - 12 van 265", "1–24 of 265", "1 à 12 sur 265"
  const range = text.match(/\b\d{1,5}\s*(?:-|–|à|tot|to)\s*\d{1,5}\s*(?:van|of|sur|de|\/)\s*(\d{1,3}(?:[.\s  ]\d{3})*|\d{1,6})\b/i);
  const total = range && toNumber(range[1]!);
  if (total) return { total, line: range[0] };
  // "265 resultaten", "(265) panden", but not "3 slaapkamers", a price, or a card's title ("Project X – 9 woningen met tuin").
  const linkTexts = [...html.matchAll(/<a\b[^>]*>([\s\S]*?)<\/a>/gi)].map((m) => pageText(m[1]!)).filter((t) => /\d/.test(t));
  const counted = new RegExp(`(?:^|[^\\d€.,])(\\d{1,3}(?:[.\\u00a0\\u202f]\\d{3})*|\\d{1,6})\\)?\\s*(?:${countWords})\\b`, "im");
  for (const line of text.split("\n")) {
    if (line.length > 120 || /€|eur\b/i.test(line) || linkTexts.some((t) => t.includes(line))) continue;
    const m = line.match(counted);
    const found = m && toNumber(m[1]!);
    if (found) return { total: found, line: line.trim() };
  }
  return null;
}

// The template a URL follows: "/te-koop/aalst/charmante-woning/97188" becomes "te-koop/*/*/#". Listing cards share one.
export function urlShape(url: string): string {
  const u = new URL(url);
  const segments = decodeURIComponent(u.pathname).split("/").filter(Boolean);
  const path = segments.map((s, i) => (/\d{3,}/.test(s) ? "#" : i === 0 ? s.toLowerCase() : "*")).join("/");
  return u.search ? `${path}?${[...u.searchParams.keys()].sort().join("&")}` : path;
}

/**
 * The listing cards on a page: links that look like a listing, and the other links with the same template (an older
 * listing with a shorter id), also when they sit in data attributes or the page's own data (JSON) instead of links.
 */
export function listingLinks(html: string, pageUrl: string, site: string): string[] {
  // Links in the page itself; a script's templates ("<a href='/te-koop/' + id + '">") aren't links.
  const links = new Set(pageLinks(html.replace(/<script\b[\s\S]*?<\/script>/gi, " "), pageUrl).filter((url) => sameSite(url, site)));
  for (const m of html.matchAll(/["'(]((?:https?:)?(?:\\?\/){1,2}[^"'\s()<>]{4,300})["')]/gi)) {
    const raw = decodeEntities(m[1]!.replace(/\\\//g, "/"));
    if (!raw.startsWith("/") && !/^https?:/i.test(raw)) continue;
    const url = normalizeUrl(raw, pageUrl);
    if (url && looksLikeListingUrl(url, site)) links.add(url);
  }
  const byShape = new Map<string, string[]>();
  for (const url of links) byShape.set(urlShape(url), [...(byShape.get(urlShape(url)) ?? []), url]);
  const found: string[] = [];
  for (const [shape, urls] of byShape) {
    const listingLike = urls.filter((url) => looksLikeListingUrl(url, site));
    // Most of a template looks like a listing and the rest has a number too: the rest are listings as well.
    const whole = shape.includes("#") && listingLike.length >= 2 && listingLike.length * 2 >= urls.length;
    found.push(...(whole ? urls.filter((url) => /\d{3,}/.test(new URL(url).pathname)) : listingLike));
  }
  // Cards whose addresses carry no id, recognised by how the page shows them.
  for (const url of repeatedCards(html, pageUrl, site)) if (!found.includes(url) && !looksLikeOverviewOnly(url)) found.push(url);
  return found;
}

/** An address that is plainly an overview, not one property: "/te-koop", "/fr/biens", "/nl/aanbod/huizen". */
function looksLikeOverviewOnly(url: string): boolean {
  const segments = decodeURIComponent(new URL(url).pathname).toLowerCase().split("/").filter(Boolean);
  const last = segments.at(-1) ?? "";
  return segments.length === 0 || /^(nl|fr|en|de|te-koop|te-huur|kopen|huren|aanbod|nieuwbouw|projecten|a-vendre|a-louer|acheter|louer|biens|vente|location|for-sale|for-rent|buy|rent|properties|panden|woningen|huizen|appartementen|neuf)$/.test(last);
}

/** Query fields that number pages ("page", "pagina", "currentPage_p", "p") or count listings to skip ("start", "offset"). */
const isPageKey = (key: string) => (/page|pagina/i.test(key) && !/size|count|limit|len|type/i.test(key)) || /^(p|pg|pag|blz)$/i.test(key);
const isOffsetKey = (key: string) => /^(start|offset|from|skip)$/i.test(key);

/** The page number a URL asks for, when it asks for one (1 for the plain overview). */
export function pageNumber(url: string): { number: number; offset: boolean } | null {
  const u = new URL(url);
  for (const [key, value] of u.searchParams) {
    if (isPageKey(key) && /^\d{1,4}$/.test(value)) return { number: Number(value), offset: false };
    if (isOffsetKey(key) && /^\d{1,6}$/.test(value)) return { number: Number(value), offset: true };
  }
  const path = u.pathname.match(/\/(?:page|pagina|p|blz)[/-]?(\d{1,4})\/?$/i);
  return path ? { number: Number(path[1]), offset: false } : null;
}

/** The overview without its page number: page 1, the key the pages of one overview share. */
export function firstPage(url: string): string {
  const u = new URL(url);
  for (const key of [...u.searchParams.keys()]) if (isPageKey(key) || isOffsetKey(key)) u.searchParams.delete(key);
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

/**
 * The next page through the site's own search form, when it pages that way: a GET form for this overview with a
 * page field ("currentPage_p"), sent with its other fields as they are.
 */
export function formPage(html: string, pageUrl: string, page: number): string | null {
  const here = new URL(pageUrl);
  for (const m of html.matchAll(/<form\b([^>]*)>([\s\S]*?)<\/form>/gi)) {
    const attrs = m[1]!;
    if (/method\s*=\s*["']?post/i.test(attrs)) continue;
    const action = new URL(decodeEntities(attrs.match(/\baction\s*=\s*["']([^"']*)["']/i)?.[1] ?? "") || pageUrl, pageUrl);
    if (action.origin !== here.origin || action.pathname.replace(/\/$/, "") !== here.pathname.replace(/\/$/, "")) continue;
    const fields: [string, string][] = [];
    const nameOf = (attrs: string) => decodeEntities(attrs.match(/\bname\s*=\s*["']([^"']+)["']/i)?.[1] ?? "");
    const valueOf = (attrs: string) => decodeEntities(attrs.match(/\bvalue\s*=\s*["']([^"']*)["']/i)?.[1] ?? "");
    for (const input of m[2]!.matchAll(/<input\b([^>]*)>/gi)) {
      const a = input[1]!;
      const type = a.match(/\btype\s*=\s*["']?(\w+)/i)?.[1]?.toLowerCase() ?? "text";
      if (["submit", "button", "image", "reset", "file", "password"].includes(type)) continue;
      if ((type === "checkbox" || type === "radio") && !/\bchecked\b/i.test(a)) continue;
      if (nameOf(a)) fields.push([nameOf(a), valueOf(a)]);
    }
    // A select sends its chosen option: the filter the overview shows (for sale, for rent).
    for (const select of m[2]!.matchAll(/<select\b([^>]*)>([\s\S]*?)<\/select>/gi)) {
      const chosen = select[2]!.match(/<option\b([^>]*\bselected\b[^>]*)>/i);
      if (nameOf(select[1]!) && chosen) fields.push([nameOf(select[1]!), valueOf(chosen[1]!)]);
    }
    const pageField = fields.find(([name]) => isPageKey(name))?.[0];
    if (!pageField) continue;
    const next = new URL(action.origin + action.pathname);
    for (const [name, value] of fields) if (name !== pageField && value) next.searchParams.append(name, value);
    next.searchParams.set(pageField, String(page));
    return normalizeUrl(next.toString());
  }
  return null;
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

const LANGUAGE = /^(nl|fr|en|de)(?:[-_][a-z]{2})?$/i;

/** The language an address starts with: "/fr/acheter" → "fr", "/nl-be/kopen" → "nl"; null without one. */
export function languageOf(url: string): string | null {
  const first = new URL(url).pathname.split("/").find(Boolean) ?? "";
  return LANGUAGE.test(first) ? first.slice(0, 2).toLowerCase() : null;
}

/** Overviews of what was sold or rented ("Referenties", "Recent verkocht"): no listing on offer there. */
export function isArchiveUrl(url: string): boolean {
  return /referenti|references|realisati|verkocht|verhuurd|\bvendus?\b|\blou[ée]s?\b|\bsold\b|\brented\b/i.test(decodeURIComponent(new URL(url).pathname));
}

/** Which way a page address numbers its pages: the query key ("page", "start"), or "path" for "/page/2". */
export function pagingKey(url: string): string | null {
  const n = pageNumber(url);
  if (!n) return null;
  for (const [key, value] of new URL(url).searchParams) if (value === String(n.number)) return key.toLowerCase();
  return "path";
}

const VOID_ELEMENTS = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"]);
/** What a card's badge can say: a listing on offer has none. */
export type CardBadge = Exclude<WebsiteListingStatus, "active">;

const BADGES: [RegExp, CardBadge][] = [
  [/\b(verkocht|vendus?|sold)\b/i, "sold"],
  [/\b(verhuurd|lou[ée]s?|rented|let agreed)\b/i, "rented"],
  [/\b(optie|option|compromis|sous offre|under offer|bod aanvaard|offre accept[ée]e|gereserveerd|r[ée]serv[ée]|reserved)\b/i, "under_offer"],
];

type Element = { name: string; start: number; end: number; shape: string };
type Anchor = { url: string; at: number; around: Element[] };

/** The page's elements around each link, with scripts, styles, comments and form controls blanked out (offsets kept). */
function anchorsOf(html: string, pageUrl: string): { doc: string; anchors: Anchor[] } {
  const doc = html.replace(/<!--[\s\S]*?-->|<(script|style|template|select|textarea)\b[\s\S]*?<\/\1>/gi, (m) => " ".repeat(m.length));
  const open: Element[] = [];
  const anchors: Anchor[] = [];
  for (const m of doc.matchAll(/<(\/?)([a-zA-Z][\w-]*)\b(?:[^>"']|"[^"]*"|'[^']*')*?(\/?)>/g)) {
    const name = m[2]!.toLowerCase();
    if (m[1]) {
      // A closing tag closes its element and anything left open inside it.
      const i = open.map((e) => e.name).lastIndexOf(name);
      if (i >= 0) for (const e of open.splice(i)) e.end = m.index! + m[0].length;
      continue;
    }
    if (VOID_ELEMENTS.has(name) || m[3]) continue;
    // The element's kind: its tag and first class, which every card of a list shares.
    // (Not a class that names this one element, as page builders add: "comp-kq6hr2s2", "elementor-element-3f2a9c".)
    const classes = m[0].match(/\bclass\s*=\s*["']([^"']*)/i)?.[1]?.split(/\s+/) ?? [];
    const cls = classes.find((c) => c && !/^(comp|elementor-element|node|post|item|block)-/i.test(c))?.replace(/\d+/g, "") ?? "";
    open.push({ name, start: m.index!, end: doc.length, shape: `${name}.${cls}` });
    // Some sites draw the cards of sold listings as an element with an address but no link ("<div href=…>").
    if (name !== "a" && !/\shref\s*=/i.test(m[0])) continue;
    const href = m[0].match(/\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);
    const url = href && normalizeUrl(decodeEntities(href[1] ?? href[2] ?? href[3] ?? ""), pageUrl);
    if (url) anchors.push({ url, at: m.index!, around: [...open] });
  }
  return { doc, anchors };
}

const PAGE_PARTS = ["html", "body", "main", "header", "nav", "footer"];

/**
 * Each card's own markup: the largest element around its link that holds no other card, and isn't the page itself
 * (a page with one card would read its menu as the card).
 */
function cardMarkup(doc: string, anchors: Anchor[], cards: Set<string>): Map<string, string> {
  const mine = anchors.filter((a) => cards.has(a.url));
  const chains = new Map<string, Element[]>();
  for (const { url, around } of mine) {
    if (chains.has(url)) continue;
    const chain: Element[] = [];
    for (let i = around.length - 1; i >= 0; i--) {
      const e = around[i]!;
      if (mine.some((a) => a.url !== url && a.at >= e.start && a.at < e.end)) break;
      if (PAGE_PARTS.includes(e.name) || e.end - e.start > 40_000) break;
      chain.push(e);
    }
    if (chain.length) chains.set(url, chain);
  }
  // Cards of one list are elements of one kind. The first card's largest element can take in what stands above the
  // list (a sort menu with "Verkocht"), so a card stops at the element of the kind most cards end at, when it has one.
  const ends = new Map<string, number>();
  for (const chain of chains.values()) ends.set(chain.at(-1)!.shape, (ends.get(chain.at(-1)!.shape) ?? 0) + 1);
  const usual = [...ends].sort((a, b) => b[1] - a[1])[0]?.[0];
  const out = new Map<string, string>();
  for (const [url, chain] of chains) {
    const card = (chains.size >= 3 && [...chain].reverse().find((e) => e.shape === usual)) || chain.at(-1)!;
    out.set(url, doc.slice(card.start, card.end));
  }
  return out;
}

const cardText = (part: string) => `${pageText(part)} ${[...part.matchAll(/\b(?:alt|title)\s*=\s*"([^"]*)"/gi)].map((m) => m[1]).join(" ")}`;

/**
 * A badge is a short label on the card ("Verkocht", "Sous option"), not a word in its description ("Lot 1: verkocht !"),
 * or the name of its photo when the label is drawn on it ("…rue du Vicinal - Sous offre.jpg").
 */
const badgeText = (part: string) =>
  [...pageText(part).split("\n").filter((line) => line.trim().length <= 40), ...[...part.matchAll(/\b(?:alt|title)\s*=\s*"([^"]*)"/gi)].map((m) => decodeEntities(m[1]!).replace(/[_]/g, " "))]
    .join("\n")
    // "81% verkocht" on a new-build project: some units are sold, the project isn't.
    .replace(/\b\d{1,2}\s?%\s*(verkocht|vendus?|sold)\b/gi, "");

/**
 * The status each card shows on an overview ("Optie" or "Verkocht" on its photo), read from the card's own element.
 * Some sites show it only there, not on the listing's page. Cards without such a badge are left out.
 */
export function cardStatuses(html: string, pageUrl: string, cards: string[]): Map<string, CardBadge> {
  const { doc, anchors } = anchorsOf(html, pageUrl);
  const statuses = new Map<string, CardBadge>();
  for (const [url, part] of cardMarkup(doc, anchors, new Set(cards))) {
    const badge = BADGES.find(([pattern]) => pattern.test(badgeText(part)));
    if (badge) statuses.set(url, badge[1]);
  }
  return statuses;
}

/** What a listing card shows: a price, an area, rooms. */
const LISTING_FACTS = /€\s?\d|\d\s?€|\d\s?(?:m²|m2\b)|\b(?:slaapkamers?|slpk|chambres?|bedrooms?|prijs|prix|loyer|huurprijs|vraagprijs|op aanvraag|sur demande)\b/i;

/**
 * Listing cards recognised by how the page is built, whatever their addresses look like ("/arlon-app-004-rue-du-camp"):
 * at least three links to different pages of the site, placed in elements of the same kind, whose cards show a price,
 * an area or rooms. Menus, headers and footers don't count.
 */
export function repeatedCards(html: string, pageUrl: string, site: string): string[] {
  const { doc, anchors } = anchorsOf(html, pageUrl);
  const groups = new Map<string, Set<string>>();
  for (const a of anchors) {
    if (!sameSite(a.url, site) || a.around.some((e) => ["nav", "header", "footer"].includes(e.name)) || pageNumber(a.url) || a.url === normalizeUrl(pageUrl)) continue;
    if (/\.(jpe?g|png|gif|webp|svg|pdf|docx?|zip)$/i.test(new URL(a.url).pathname)) continue;
    const shape = a.around.slice(-5).map((e) => e.shape).join(">");
    groups.set(shape, (groups.get(shape) ?? new Set()).add(a.url));
  }
  const found = new Set<string>();
  for (const urls of groups.values()) {
    if (urls.size < 3) continue;
    const parts = cardMarkup(doc, anchors, urls);
    const withFacts = [...parts.values()].filter((part) => LISTING_FACTS.test(cardText(part))).length;
    if (withFacts >= 3 && withFacts * 10 >= urls.size * 6) for (const url of parts.keys()) found.add(url);
  }
  return [...found];
}
