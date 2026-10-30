/*
 * Reading listings from an agency's own website. Pure functions of a page's
 * HTML and URL, so they are tested without the network: finding listing links,
 * turning a page into text, and reading the listing facts from structured data
 * (schema.org, Open Graph) and from the label/value tables Belgian agency sites
 * use ("Slaapkamers 3", "Prix | 995.000 €", "Superficie terrain | 14.15 ares").
 */

export type PropertyType = "house" | "apartment" | "villa" | "land" | "commercial" | "office" | "garage" | "other";
export type WebsiteListingStatus = "active" | "under_offer" | "sold" | "rented";

export type ExtractedListing = {
  reference: string | null;
  transaction: "sale" | "rent" | null;
  status: WebsiteListingStatus | null;
  propertyType: PropertyType | null;
  title: string | null;
  description: string | null;
  street: string | null;
  houseNumber: string | null;
  postcode: string | null;
  city: string | null;
  price: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  livingArea: number | null;
  plotArea: number | null;
  epcScore: number | null;
  epcLabel: string | null;
  photos: string[];
  /** The contact person the page names for this listing, if any. */
  agentName: string | null;
  /** Their email and phone when the page shows them next to the name. */
  agentEmail: string | null;
  agentPhone: string | null;
};

export const emptyListing = (): ExtractedListing => ({
  reference: null,
  transaction: null,
  status: null,
  propertyType: null,
  title: null,
  description: null,
  street: null,
  houseNumber: null,
  postcode: null,
  city: null,
  price: null,
  bedrooms: null,
  bathrooms: null,
  livingArea: null,
  plotArea: null,
  epcScore: null,
  epcLabel: null,
  photos: [],
  agentName: null,
  agentEmail: null,
  agentPhone: null,
});

// --- URLs ---------------------------------------------------------------

/** The host without "www.", so example.be and www.example.be are the same site. */
export function siteHost(url: string | URL): string {
  return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
}

export function sameSite(a: string | URL, b: string | URL): boolean {
  try {
    return siteHost(a) === siteHost(b);
  } catch {
    return false;
  }
}

/** Query fields that show the same page another way (a print view, a menu position): one listing, one address. */
const NOISE_KEYS = /^(tmpl|layout|print|goal|itemid|format|lightbox|slideshow|share)$/i;

/** One spelling per page: no fragment, no tracking parameters, no trailing slash. */
export function normalizeUrl(input: string, base?: string): string | null {
  let url: URL;
  try {
    url = new URL(input.trim(), base);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  url.hash = "";
  url.protocol = "https:";
  for (const key of [...new Set(url.searchParams.keys())]) {
    if (/^(utm_|fbclid|gclid|mc_|_ga)/i.test(key) || NOISE_KEYS.test(key)) url.searchParams.delete(key);
    else if (url.searchParams.getAll(key).length > 1) {
      // "?view=list&view=list" is "?view=list".
      const values = [...new Set(url.searchParams.getAll(key))];
      url.searchParams.delete(key);
      for (const value of values) url.searchParams.append(key, value);
    }
  }
  if (url.pathname.length > 1) url.pathname = url.pathname.replace(/\/+$/, "");
  return url.toString();
}

const notPages = /\.(jpe?g|png|gif|webp|avif|svg|pdf|docx?|xlsx?|zip|mp4|mov|webm|mp3|css|js|ico|xml|json|txt|woff2?|ttf|otf|eot)$/i;
const notListings =
  /\/(blog|nieuws|news|actualites?|actua|jobs?|vacatures?|careers?|contact|team|over-ons|about|a-propos|privacy|cookies?|disclaimer|login|account|wp-admin|wp-content|wp-json|tag|category|auteur|author|content|cms|media|uploads?|assets?|cms-assets|files?|images?|img|downloads?|documents?|api)(\/|$)/i;
/** CMS pages ("/fr/page/10004/protection-juridique"); "/page/2" of an overview is no listing either. */
const cmsPages = /\/(page|pages|pagina)(\/|$)/i;
/** A file's address in a content store ("/cms-assets/3f2a9c1e-5b7d-…"): not a page. */
const uuid = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
/** Query fields that carry a listing's id on sites that show every listing through one page ("?view=detail&id=1462"). */
const idKeys = /^(id|ref|pand|pandid|bien|bienid|property|propertyid|estate|estateid|object|objectid|listing|listingid|detail)$/i;
const listingWords = /(te-koop|te-huur|kopen|huren|aanbod|pand|panden|detail|woning|woningen|vastgoed|a-vendre|a-louer|acheter|louer|bien|biens|for-sale|for-rent|property|properties|estate|listing|immo)/i;

/**
 * A link that looks like a single listing: on the same site, with the numeric
 * id agency CRMs put in listing URLs (/detail/7917339/…, /bien/7892200/…,
 * …-d8500-26222-264763). The page itself still has to look like a listing.
 */
export function looksLikeListingUrl(url: string, site: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (!sameSite(parsed, site)) return false;
  const path = decodeURIComponent(parsed.pathname);
  if (notPages.test(path) || notListings.test(path) || cmsPages.test(path) || uuid.test(path)) return false;
  if (queryId(parsed) && (listingWords.test(path) || /\bview=details?\b/i.test(parsed.search))) return true;
  const segments = path.split("/").filter(Boolean);
  if (segments.length < 2) return false;
  const hasId = /(^|[^\d])\d{5,9}([^\d]|$)/.test(path);
  return hasId && (listingWords.test(path) || segments.length >= 3);
}

/**
 * What makes two addresses one listing: its id in the query ("?view=detail&id=1462" on any page of the site), or its
 * address without the position numbers some sites append to each card ("/te-koop/niel/4493114/0/70084328/1/2/0/0").
 */
export function listingKey(url: string): string {
  const u = new URL(url);
  const host = siteHost(u);
  const id = queryId(u);
  if (id) return `${host}?${id}`;
  const segments = u.pathname.split("/").filter(Boolean);
  const at = segments.findIndex((segment) => /(^|[^\d])\d{5,9}([^\d]|$)/.test(segment));
  const tail = segments.slice(at + 1);
  if (at >= 0 && tail.length >= 2 && tail.every((segment) => /^\d+$/.test(segment))) return `${host}/${segments.slice(0, at + 1).join("/")}`;
  return `${host}${u.pathname}${u.search}`;
}

/**
 * The address without the numbers of the visit that found it ("/4493114/0/70089374/1/2/0/0" → "/4493114/0/0/0/0/0/0"):
 * some sites tie those to a search that expires and send a later visit to the home page. Null when there are none.
 */
export function withoutVisitNumbers(url: string): string | null {
  const u = new URL(url);
  const segments = u.pathname.split("/");
  const at = segments.findIndex((segment) => /(^|[^\d])\d{5,9}([^\d]|$)/.test(segment));
  const tail = segments.slice(at + 1).filter(Boolean);
  if (at < 0 || tail.length < 2 || !tail.every((segment) => /^\d+$/.test(segment)) || tail.every((segment) => segment === "0")) return null;
  u.pathname = [...segments.slice(0, at + 1), ...tail.map(() => "0"), ""].join("/");
  return u.toString();
}

/** The listing id a query string carries ("?view=detail&id=1462"), if any. */
function queryId(url: URL): string | null {
  for (const [key, value] of url.searchParams) if (idKeys.test(key) && /^\d{3,9}$/.test(value)) return value;
  return null;
}

/** Overview pages worth following to find listings when the site has no sitemap. */
export function looksLikeOverviewUrl(url: string, site: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (!sameSite(parsed, site)) return false;
  const path = decodeURIComponent(parsed.pathname + parsed.search).toLowerCase();
  if (notPages.test(parsed.pathname) || notListings.test(parsed.pathname)) return false;
  return /(te-koop|te-huur|kopen|huren|aanbod|nieuwbouw|projecten|projets|projects|neuf|new-build|verkocht|verhuurd|a-vendre|a-louer|acheter|louer|vendus?|for-sale|for-rent|to-rent|buy|rent|sold|properties|biens|panden|page=|pagina=)/.test(path);
}

/** Every link on the page, absolute and normalised. */
export function pageLinks(html: string, pageUrl: string): string[] {
  const links = new Set<string>();
  for (const match of html.matchAll(/<a\b[^>]*?\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi)) {
    const href = decodeEntities(match[1] ?? match[2] ?? match[3] ?? "");
    if (!href || href.startsWith("#") || /^(javascript|mailto|tel):/i.test(href)) continue;
    const url = normalizeUrl(href, pageUrl);
    if (url) links.add(url);
  }
  return [...links];
}

/** Page URLs and nested sitemaps listed in a sitemap.xml. */
export function sitemapEntries(xml: string): { pages: string[]; sitemaps: string[] } {
  const locs = [...xml.matchAll(/<loc>\s*(?:<!\[CDATA\[)?\s*([^<\]]+?)\s*(?:\]\]>)?\s*<\/loc>/gi)].map((m) => decodeEntities(m[1]!));
  if (/<sitemapindex/i.test(xml)) return { pages: [], sitemaps: locs };
  return { pages: locs, sitemaps: [] };
}

export function robotsSitemaps(robots: string): string[] {
  return [...robots.matchAll(/^\s*sitemap\s*:\s*(\S+)/gim)].map((m) => m[1]!);
}

// --- Page text ----------------------------------------------------------

const entities: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", euro: "€", sup2: "²", eacute: "é", egrave: "è", ecirc: "ê", agrave: "à", ccedil: "ç", ocirc: "ô", euml: "ë", iuml: "ï", uuml: "ü" };

export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z0-9]+);/gi, (whole, code: string) => {
    if (code[0] === "#") {
      const n = code[1]?.toLowerCase() === "x" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : whole;
    }
    return entities[code.toLowerCase()] ?? whole;
  });
}

/**
 * The visible text of a page, one line per block or table cell, without
 * scripts, styles, navigation and footer (where menus repeat words such as
 * "verkocht" that would mislead the rules).
 */
export function pageText(html: string): string {
  let body = html.replace(/<!--[\s\S]*?-->/g, " ");
  body = body.replace(/<(script|style|noscript|svg|template|iframe|head)\b[\s\S]*?<\/\1>/gi, " ");
  body = body.replace(/<(nav|footer)\b[\s\S]*?<\/\1>/gi, " ");
  body = body.replace(/<br\s*\/?>/gi, "\n");
  body = body.replace(/<\/?(p|div|section|article|aside|main|li|ul|ol|dl|dt|dd|tr|td|th|table|tbody|thead|h[1-6]|label|figure|figcaption|button|form|span)\b[^>]*>/gi, "\n");
  body = body.replace(/<[^>]+>/g, " ");
  return decodeEntities(body)
    .split("\n")
    .map((line) => line.replace(/[ \t\u00a0]+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
}

/** A short, stable fingerprint of the page text, to skip pages that didn't change. */
export function textFingerprint(text: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = (Math.imul(h2, 31) + c) >>> 0;
  }
  return `${h1.toString(16)}${h2.toString(16)}:${text.length}`;
}

// --- Numbers ------------------------------------------------------------

/** "€ 362.500", "995.000 €", "1 250 000", "362,500.00" → whole euros. */
export function parseAmount(raw: string): number | null {
  const match = raw.match(/\d[\d.,'\s\u00a0\u202f]*/);
  if (!match) return null;
  let digits = match[0].replace(/[\s\u00a0\u202f']/g, "");
  // A trailing ",00" or ".00" holds cents.
  digits = digits.replace(/[.,]\d{1,2}$/, "");
  digits = digits.replace(/[.,]/g, "");
  const value = Number(digits);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function parseArea(raw: string): number | null {
  const match = raw.match(/(\d[\d.,\s]*)\s*(m²|m2|m\b|ares?|a\b|ha|ca\b)?/i);
  if (!match) return null;
  const number = Number(match[1]!.replace(/\s/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", "."));
  if (!Number.isFinite(number) || number <= 0) return null;
  const unit = (match[2] ?? "m²").toLowerCase();
  if (unit.startsWith("ha")) return Math.round(number * 10000);
  if (unit === "a" || unit.startsWith("are")) return Math.round(number * 100);
  return Math.round(number);
}

// --- Structured data ----------------------------------------------------

function jsonLdNodes(html: string): Record<string, unknown>[] {
  const nodes: Record<string, unknown>[] = [];
  const visit = (value: unknown) => {
    if (Array.isArray(value)) value.forEach(visit);
    else if (value && typeof value === "object") {
      const node = value as Record<string, unknown>;
      nodes.push(node);
      if (node["@graph"]) visit(node["@graph"]);
      for (const key of ["mainEntity", "itemOffered", "about"]) if (node[key]) visit(node[key]);
    }
  };
  for (const match of html.matchAll(/<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      visit(JSON.parse(match[1]!.trim()));
    } catch {
      // Broken JSON-LD is common; the rules still read the page.
    }
  }
  return nodes;
}

const types = (node: Record<string, unknown>) => ([] as unknown[]).concat(node["@type"] ?? []).map(String);
const text = (value: unknown): string | null => (typeof value === "string" && value.trim() ? decodeEntities(value.trim()) : typeof value === "number" ? String(value) : null);
const realEstateTypes = /RealEstateListing|Residence|House|Apartment|SingleFamilyResidence|Accommodation|Place|Product|Offer|Room|LandForm/i;

export function metaContent(html: string, name: string): string | null {
  const re = new RegExp(`<meta\\b[^>]*(?:property|name)\\s*=\\s*["']${name.replace(/[:.]/g, "\\$&")}["'][^>]*>`, "i");
  const tag = html.match(re)?.[0];
  const content = tag?.match(/content\s*=\s*(?:"([^"]*)"|'([^']*)')/i);
  return content ? text(content[1] ?? content[2]) : null;
}

/** Facts from schema.org JSON-LD and Open Graph tags, when the site publishes them. */
export function structuredData(html: string, pageUrl: string): Partial<ExtractedListing> & { found: boolean } {
  const out: Partial<ExtractedListing> = {};
  let found = false;
  for (const node of jsonLdNodes(html)) {
    if (!types(node).some((t) => realEstateTypes.test(t))) continue;
    const address = (node.address ?? (node.location as Record<string, unknown> | undefined)?.address) as Record<string, unknown> | undefined;
    if (address && typeof address === "object") {
      const street = text(address.streetAddress);
      if (street) {
        const split = splitStreet(street);
        out.street ??= split.street;
        out.houseNumber ??= split.houseNumber;
      }
      out.postcode ??= text(address.postalCode)?.match(/\b[1-9]\d{3}\b/)?.[0] ?? null;
      out.city ??= text(address.addressLocality);
      found = true;
    }
    const offers = ([] as unknown[]).concat(node.offers ?? (types(node).some((t) => /Offer/.test(t)) ? node : []));
    for (const offer of offers as Record<string, unknown>[]) {
      const price = parseAmount(String(offer.price ?? (offer.priceSpecification as Record<string, unknown> | undefined)?.price ?? ""));
      if (price && price >= 100) {
        out.price ??= price;
        found = true;
      }
    }
    const bedrooms = Number(node.numberOfBedrooms ?? node.numberOfRooms);
    if (Number.isInteger(bedrooms) && bedrooms >= 0 && bedrooms < 50) out.bedrooms ??= bedrooms;
    const bathrooms = Number(node.numberOfBathroomsTotal ?? node.numberOfFullBathrooms);
    if (Number.isInteger(bathrooms) && bathrooms >= 0 && bathrooms < 30) out.bathrooms ??= bathrooms;
    const floor = node.floorSize as Record<string, unknown> | undefined;
    if (floor && typeof floor === "object") out.livingArea ??= parseArea(String(floor.value ?? ""));
    out.title ??= text(node.name);
    out.description ??= text(node.description);
    const images = ([] as unknown[]).concat(node.image ?? []).map((i) => (typeof i === "string" ? i : text((i as Record<string, unknown>)?.url))).filter(Boolean) as string[];
    if (images.length && !out.photos?.length) out.photos = images;
    out.reference ??= text(node.sku) ?? text(node.productID) ?? text(node.identifier);
  }
  const ogTitle = metaContent(html, "og:title");
  const ogImage = metaContent(html, "og:image");
  const ogDescription = metaContent(html, "og:description");
  const ogPrice = metaContent(html, "product:price:amount") ?? metaContent(html, "og:price:amount");
  out.title ??= ogTitle;
  out.description ??= ogDescription;
  if (ogImage && !out.photos?.length) out.photos = [ogImage];
  if (ogPrice) out.price ??= parseAmount(ogPrice);
  if (out.photos) out.photos = out.photos.map((p) => normalizeUrl(p, pageUrl) ?? p).filter((p) => /^https:/.test(p));
  return { ...out, found };
}

// --- Rules on the page text ----------------------------------------------

/** "Sint-Dionysiusstraat 54" → street and number; "Rue Victor Hugo 190 bus 3" too. */
export function splitStreet(value: string): { street: string | null; houseNumber: string | null } {
  const clean = value.replace(/\s+/g, " ").trim().replace(/[\s,–-]+$/, "");
  const nl = clean.match(/^(.*?[A-Za-zÀ-ÿ.'’)-])\s+(\d+[A-Za-z]?(?:\s*(?:bus|bte|boîte|box|\/)?\s*\w+)?)$/i);
  if (nl) return { street: nl[1]!.trim(), houseNumber: nl[2]!.trim() };
  const fr = clean.match(/^(\d+[A-Za-z]?),?\s+(.+)$/);
  if (fr) return { street: fr[2]!.trim(), houseNumber: fr[1]!.trim() };
  return { street: clean || null, houseNumber: null };
}

type Rule = { field: keyof ExtractedListing; labels: string; value: RegExp; parse: (raw: string) => unknown };

const integer = (max: number) => (raw: string) => {
  const n = Number(raw);
  return Number.isInteger(n) && n >= 0 && n <= max ? n : null;
};

const rules: Rule[] = [
  { field: "price", labels: "vraagprijs|prijs|price|asking price|prix|prix demandé|huurprijs|loyer|rent", value: /^[^\n\d]{0,12}((?:€\s*)?\d[\d.,\s\u00a0]{2,}(?:\s*€|\s*eur\b)?)/i, parse: parseAmount },
  { field: "reference", labels: "referentie|referentienummer|ref\\.?|réf\\.?|référence|reference|ref nr|ref\\. nr|dossiernummer", value: /^[\s:|#.]{0,6}([A-Z0-9][A-Z0-9/_-]{2,24})/i, parse: (raw) => raw },
  { field: "bedrooms", labels: "slaapkamers|slaapkamer|slpks?|chambres?|chambre\\(s\\)|nbre de chambres|nombre de chambres|nombre de chambre\\(s\\)|bedrooms?", value: /^[^\n\d]{0,10}(\d{1,2})\b/i, parse: integer(40) },
  { field: "bathrooms", labels: "badkamers?|salles? de bains?|salle\\(s\\) de bain\\(s\\)|bathrooms?", value: /^[^\n\d]{0,10}(\d{1,2})\b/i, parse: integer(20) },
  { field: "livingArea", labels: "bewoonbare oppervlakte|woonoppervlakte|bewoonbare opp\\.?|oppervlakte|superficie habitable|surface habitable|living area|habitable", value: /^[^\n\d]{0,12}(\d[\d.,]*\s*(?:m²|m2|m\b)?)/i, parse: parseArea },
  { field: "plotArea", labels: "perceelsoppervlakte|perceeloppervlakte|perceel|grondoppervlakte|grond oppervlakte|oppervlakte grond|superficie terrain|superficie du terrain|terrain|plot|plot size|land area", value: /^[^\n\d]{0,12}(\d[\d.,]*\s*(?:m²|m2|ares?|a\b|ha|ca\b|m\b)?)/i, parse: parseArea },
  { field: "epcScore", labels: "epc-score|epc score|epc-waarde|epc waarde|e-peil|epc|peb|e spec|espec|énergie primaire|energy performance", value: /^[^\n\d]{0,14}(\d{2,4})\s*kwh/i, parse: integer(2000) },
  { field: "epcLabel", labels: "epc-label|epc label|epc klasse|epc-klasse|energielabel|label|classe énergétique|peb|epc", value: /^[\s:|-]{0,6}([A-G](?:\+{1,3})?)(?![a-z])/, parse: (raw) => raw.toUpperCase() },
  { field: "agentName", labels: "uw contactpersoon|contactpersoon|uw makelaar|makelaar|votre contact|votre agent|contact person|your agent|agent", value: /^[\s:|-]{0,6}([A-ZÀ-Ý][a-zà-ÿ'’-]+(?:\s+(?:van|de|der|den|le|la|du|des|von|d'|[A-ZÀ-Ý][a-zà-ÿ'’-]+)){1,3})/, parse: (raw) => raw.trim() },
];

function labelled(textBlock: string, rule: Rule): unknown {
  const re = new RegExp(`(?:^|\\n|\\|)\\s*(?:${rule.labels})(?![a-zà-ÿ])\\s*(?::|\\|)?[ \\t]*\\n?`, "gi");
  for (const match of textBlock.matchAll(re)) {
    const after = textBlock.slice(match.index! + match[0].length, match.index! + match[0].length + 60);
    const value = after.match(rule.value);
    if (!value) continue;
    const parsed = rule.parse(value[1]!.trim());
    if (parsed != null) return parsed;
  }
  return null;
}

const propertyWords: [PropertyType, RegExp][] = [
  ["villa", /\b(villa|landhuis|fermette|kasteel|château|bien exceptionnel)\b/i],
  ["apartment", /\b(appartement|apartment|studio|duplex|triplex|penthouse|flat|loft|serviceflat|assistentiewoning|kot|studentenkamer)\b/i],
  ["land", /\b(bouwgrond|grond|perceel|terrain à bâtir|terrain|building plot|land)\b/i],
  ["office", /\b(kantoor|kantoren|bureau|bureaux|office)\b/i],
  ["commercial", /\b(handelspand|handelshuis|winkel|commerce|commercial|horeca|opbrengsteigendom|immeuble de rapport|industrie|magazijn|entrepôt|bedrijfsvastgoed)\b/i],
  ["garage", /\b(garage|staanplaats|parking|autostaanplaats|garagebox)\b/i],
  ["house", /\b(huis|woning|rijwoning|halfopen|open bebouwing|bel-étage|bel-etage|maison|house|herenhuis|maison de maître|bungalow|cottage|hoeve)\b/i],
];

export function propertyTypeFrom(...hints: (string | null | undefined)[]): PropertyType | null {
  const textHints = hints.filter(Boolean).join(" ").replace(/[-_/]/g, " ");
  for (const [type, re] of propertyWords) if (re.test(textHints)) return type;
  return null;
}

export function transactionFrom(...hints: (string | null | undefined)[]): "sale" | "rent" | null {
  const textHints = hints.filter(Boolean).join(" ").replace(/[-_/]/g, " ").toLowerCase();
  if (/\b(te huur|huren|verhuurd|à louer|a louer|louer|loué|location|for rent|to rent|rented|huurprijs|loyer)\b/.test(textHints)) return "rent";
  if (/\b(te koop|kopen|verkocht|à vendre|a vendre|vendre|vendu|acheter|for sale|sold|vraagprijs)\b/.test(textHints)) return "sale";
  return null;
}

export function statusFrom(...hints: (string | null | undefined)[]): WebsiteListingStatus | null {
  const textHints = hints.filter(Boolean).join(" ").toLowerCase();
  if (/\b(verkocht|vendu|sold)\b/.test(textHints)) return "sold";
  if (/\b(verhuurd|loué|rented|let agreed)\b/.test(textHints)) return "rented";
  if (/\b(onder optie|in optie|optie|sous option|sous compromis|compromis|under offer|bod aanvaard|offre acceptée)\b/.test(textHints)) return "under_offer";
  if (/\b(te koop|te huur|à vendre|à louer|for sale|for rent|beschikbaar|disponible|available)\b/.test(textHints)) return "active";
  return null;
}

/** "9051 Gent Sint-Denijs-Westrem" or "1410 Waterloo" (Belgian postcodes have four digits). */
function postcodeCity(textBlock: string): { postcode: string; city: string; before: string } | null {
  const match = textBlock.match(/(?:^|\n|,[ \t]*|\|[ \t]*)([^\n,|]{0,60}?)[, \t]*\b([1-9]\d{3})[ \t]+([A-ZÀ-Ý][A-Za-zÀ-ÿ'’. -]{1,40}?)(?=[ \t]*(?:\n|$|,|\||\())/);
  if (!match) return null;
  return { before: match[1]!.trim(), postcode: match[2]!, city: titleCase(match[3]!.trim()) };
}

/** "KORTRIJK" → "Kortrijk", "SINT-MARTENS-LATEM" → "Sint-Martens-Latem"; mixed case is kept. */
function titleCase(value: string): string {
  if (value !== value.toUpperCase()) return value;
  return value.toLowerCase().replace(/(^|[\s'’-])([a-zà-ÿ])/g, (_, sep: string, ch: string) => sep + ch.toUpperCase());
}

/**
 * An unlabelled address line, as many sites show it under the title:
 * "Patersmotestraat 2 , KORTRIJK", "Keizersplein 56 11, AALST", "Kerkstraat 4, 9000 Gent".
 */
function streetCityLine(textBlock: string): { street: string; houseNumber: string | null; postcode: string | null; city: string } | null {
  for (const line of textBlock.split("\n").slice(0, 120)) {
    const match = line.match(/^([A-ZÀ-Ý][A-Za-zÀ-ÿ'’. -]{2,50}?\s\d+[A-Za-z]?(?:\s*(?:bus|bte|box|\/)?\s*\w{1,4})?)\s*,\s*(?:([1-9]\d{3})\s+)?([A-ZÀ-Ý][A-Za-zÀ-ÿ'’. -]{1,40})$/);
    if (!match) continue;
    const split = splitStreet(match[1]!);
    if (!split.street || /oppervlakte|surface|superficie|slaapkamer|chambre|m2|m²/i.test(line)) continue;
    return { street: split.street, houseNumber: split.houseNumber, postcode: match[2] ?? null, city: titleCase(match[3]!.trim()) };
  }
  return null;
}

/** Headings of the blocks with other listings under a listing ("Gelijkaardige panden", "Net gemist", "Biens similaires"). */
const otherListings =
  /^(gelijkaardige|vergelijkbare|andere|meer|soortgelijke) (panden|woningen|eigendommen|aanbod)|^(ook interessant|misschien ook|net gemist|recent bekeken|bekijk ook)|^(biens|annonces) similaires|^(vous aimerez|autres biens|à découvrir aussi|ces biens)|^(similar|related|other) (properties|listings)|^you (may|might) also like/i;

/** The page text without the blocks of other listings it shows below the listing, whose prices and places aren't this one's. */
export function mainPart(text: string): string {
  const lines = text.split("\n");
  const at = lines.findIndex((line, i) => i >= 10 && line.length <= 60 && otherListings.test(line.trim()));
  return at < 0 ? text : lines.slice(0, at).join("\n");
}

/**
 * Lines of the home page that are the agency's own details (an office
 * address, a VAT number), which every page repeats in its footer. Removing
 * them keeps the office address from being taken for the listing's.
 */
export function boilerplateLines(homeHtml: string): Set<string> {
  return new Set(
    pageText(homeHtml)
      .split("\n")
      .filter((line) => /\b[1-9]\d{3}\s+[A-ZÀ-Ý]/.test(line) || /\b(BTW|TVA|VAT|BE\s?0\d{3}|ondernemingsnummer|BIV|IPI)\b/i.test(line)),
  );
}

/** "€ 300 000" or "€ 1 350/mnd" near the top of a page that shows its price without a label. */
function unlabelledPrice(textBlock: string): { price: number; rent: boolean } | null {
  const amounts = textBlock.matchAll(/(?:€\s?(\d{1,3}(?:[ .\u00a0\u202f]\d{3})+|\d{3,})|(\d{1,3}(?:[ .\u00a0\u202f]\d{3})+|(?<=^|\n)\d{3,}(?=\s?€[ \t]*(?:\n|$|\/)))\s?€)(?:[,.]\d{2})?\s*(\/\s*(?:mnd|maand|mois|month)|per maand|par mois)?/gi);
  // Amounts that a label calls something else (cadastral income, charges, taxes) aren't the price.
  const other = /(cadastr|kadastr|\b(?:KI|RC)\b|charges|kosten|provisie|provision|syndic|frais|voorheffing|pr[ée]compte|taxe|belasting|huurwaarde|garantie)[^\n]*\n?[^\n]*$/i;
  for (const match of amounts) {
    if (other.test(textBlock.slice(Math.max(0, (match.index ?? 0) - 80), match.index))) continue;
    const price = parseAmount(match[1] ?? match[2] ?? "");
    if (price && price >= 100) return { price, rent: Boolean(match[3]) };
  }
  return null;
}

function headline(html: string): string | null {
  const h1 = html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1];
  const value = h1 ? decodeEntities(h1.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim() : null;
  return value || null;
}

function titleTag(html: string): string | null {
  const t = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  return t ? decodeEntities(t).replace(/\s+/g, " ").trim() || null : null;
}

const personName = /[A-ZÀ-Ý][a-zà-ÿ'’-]+(?:[ \t]+(?:van|de|der|den|le|la|du|des|von|d'|[A-ZÀ-Ý][a-zà-ÿ'’-]+)){1,3}/;
/** Words in company names, so "Immo Zone BIV 511 931" isn't taken for a person. */
const notAPerson = /\b(immo\w*|immobili[eë]n|vastgoed|real|estate|makelaar|makelaars|kantoor|agence|groep|group|bvba|bv|nv|srl|sprl|vzw|team|contact|interesse|residenti[eë]|r[ée]sidence|project)\b/i;

const fold = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

/**
 * The email and phone shown right after a person's name. An email counts only when it carries their
 * first or last name, so the office's info@ address isn't taken for theirs.
 */
export function contactNear(textBlock: string, name: string): { agentEmail: string | null; agentPhone: string | null } {
  const at = textBlock.indexOf(name);
  if (at < 0) return { agentEmail: null, agentPhone: null };
  const window = textBlock.slice(at + name.length, at + name.length + 250);
  const parts = fold(name).split(/\s+/).filter((p) => p.length > 2);
  const email = [...window.matchAll(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi)].map((m) => m[0].toLowerCase()).find((e) => parts.some((p) => fold(e.split("@")[0]!).includes(p)));
  const phone = window.match(/(?<![\d.])(?:\+32|0)[ \t]?[1-9](?:[ \t./-]?\d){7,9}(?!\d)/)?.[0];
  return { agentEmail: email ?? null, agentPhone: phone ? phone.replace(/[^\d+]/g, "").replace(/^0/, "+32") : null };
}

/**
 * Listing facts read by rules: structured data first, then labelled values in
 * the page text, then the URL. Fields the page doesn't show stay null.
 */
export function extractListing(html: string, pageUrl: string, boilerplate?: Set<string>): { listing: ExtractedListing; structured: boolean } {
  const structured = structuredData(html, pageUrl);
  const textBlock = mainPart(
    boilerplate?.size
      ? pageText(html)
          .split("\n")
          .filter((line) => !boilerplate.has(line))
          .join("\n")
      : pageText(html),
  );
  const listing = emptyListing();
  const { found, ...fromStructured } = structured;
  Object.assign(listing, Object.fromEntries(Object.entries(fromStructured).filter(([, v]) => v != null && !(Array.isArray(v) && v.length === 0))));

  for (const rule of rules) {
    if (listing[rule.field] != null) continue;
    const value = labelled(textBlock, rule);
    if (value != null) (listing as Record<string, unknown>)[rule.field] = value;
  }
  if (listing.agentName && /^(contact|makelaar|agent|bel|mail)/i.test(listing.agentName)) listing.agentName = null;
  // A name right before a BIV/IPI licence number is the agent: "Wout Timmerman BIV: 519.807 0479 18 38 35".
  if (!listing.agentName) {
    for (const match of textBlock.matchAll(new RegExp(`(?:^|\\n)[ \\t]*(${personName.source})[ \\t]*[,|–-]?[ \\t]*(?:\\n[ \\t]*)?(?:BIV|IPI|B\\.I\\.V\\.)(?![a-z])`, "g"))) {
      if (!notAPerson.test(match[1]!)) {
        listing.agentName = match[1]!;
        break;
      }
    }
  }
  // A name on a line of its own next to the same first name or a phone number: "Liselotte helpt je graag verder!",
  // "Liselotte Deschacht", "059 30 50 50", "Mail Liselotte".
  if (!listing.agentName) {
    const lines = textBlock.split("\n").map((line) => line.trim());
    const phone = /^(?:\+32|0)[ \t]?[1-9](?:[ \t./-]?\d){7,9}$/;
    for (const [i, line] of lines.entries()) {
      if (!new RegExp(`^${personName.source}$`).test(line) || notAPerson.test(line)) continue;
      // A menu ("Te Koop", "Te Huur") isn't a person: a first name has three letters or more.
      const firstName = line.split(/\s+/)[0]!;
      if (firstName.length < 3) continue;
      const first = new RegExp(`\\b${firstName}\\b`);
      const near = [lines[i - 1], lines[i + 1], lines[i + 2]].filter((l): l is string => l != null);
      if (near.some((l) => first.test(l) || phone.test(l))) {
        listing.agentName = line;
        break;
      }
    }
  }
  // A name with a phone number on the same line, after "Tel." or with an email of theirs below it:
  // "Bezoeken na afspraak: Tel. Ilona Bewaert, 0496/22.02.66; ilona@immotalenco.com".
  if (!listing.agentName) {
    const withPhone = new RegExp(`(tel\\.?|bel|gsm|contact\\w*|afspraak)?[ \\t:]*(${personName.source})[ \\t]*[,;:–-]?[ \\t]*(?:\\+32|0)[ \\t]?[1-9](?:[ \\t./-]?\\d){7,9}`, "gi");
    for (const match of textBlock.matchAll(withPhone)) {
      const name = match[2]!;
      if (notAPerson.test(name)) continue;
      if (match[1] || contactNear(textBlock, name).agentEmail) {
        listing.agentName = name;
        break;
      }
    }
  }
  if (listing.agentName) Object.assign(listing, contactNear(textBlock, listing.agentName));

  // Address: a labelled line, else the first "postcode city" in the text.
  const addressLine = labelled(textBlock, { field: "street", labels: "adres|locatie|ligging|adresse|address|location", value: /^[\s:|]{0,4}([^\n]{4,90})/i, parse: (raw) => raw });
  const located = postcodeCity(typeof addressLine === "string" ? `\n${addressLine}\n` : "") ?? postcodeCity(textBlock);
  if (located) {
    listing.postcode ??= located.postcode;
    listing.city ??= located.city;
    if (!listing.street && located.before && /\d/.test(located.before) && /[a-zà-ÿ]{3}/i.test(located.before)) {
      const split = splitStreet(located.before.replace(/^(adres|locatie|adresse|address|location)\s*[:|]?\s*/i, ""));
      listing.street = split.street;
      listing.houseNumber = split.houseNumber;
    }
  }
  if (typeof addressLine === "string" && !listing.street && /\d/.test(addressLine) && !/\b[1-9]\d{3}\s+[A-ZÀ-Ý]/.test(addressLine)) {
    const split = splitStreet(addressLine);
    listing.street = split.street;
    listing.houseNumber = split.houseNumber;
  }
  // No labelled address: a "street number, city" line, which beats a "postcode city" found further down.
  const line = typeof addressLine === "string" ? null : streetCityLine(textBlock);
  if (line && !structured.street) {
    listing.street = line.street;
    listing.houseNumber = line.houseNumber;
    listing.city = line.city;
    listing.postcode = line.postcode ?? (located && located.city.toLowerCase() === line.city.toLowerCase() ? located.postcode : null);
  }
  const path = decodeURIComponent(new URL(pageUrl).pathname);
  // The city is often in the URL (/te-koop/kortrijk/…).
  listing.city ??= titleCase(path.match(/\/(?:te-koop|te-huur|a-vendre|a-louer|for-sale|for-rent)\/([a-zà-ÿ'-]{2,40})\//i)?.[1]?.replace(/-/g, " ").toUpperCase() ?? "") || null;
  let rentByPrice = false;
  let unlabelled = false;
  if (listing.price == null) {
    const found = unlabelledPrice(textBlock);
    if (found) {
      listing.price = found.price;
      rentByPrice = found.rent;
      unlabelled = true;
    }
  }

  const title = headline(html) ?? listing.title ?? titleTag(html);
  listing.title = title;
  const statusLine = labelled(textBlock, { field: "status", labels: "status|statut|state", value: /^[\s:|]{0,4}([^\n]{3,40})/i, parse: (raw) => raw });
  // The address says "verkocht" or "optie" when the site changed it with the status ("/aanbod/4050490/magazijn-verhuurd-in-3600-genk"),
  // also when the title still says "te huur".
  const fromPath = statusFrom(path.replace(/[-/_]/g, " "));
  listing.status = (fromPath && fromPath !== "active" ? fromPath : null) ?? statusFrom(typeof statusLine === "string" ? statusLine : null) ?? statusFrom(title) ?? fromPath;
  // A label of its own near the top ("Optie" under the price) says more than "te huur" in the title.
  if (!listing.status || listing.status === "active") listing.status = statusFrom(badgeLine(html, title)) ?? listing.status;
  listing.transaction = transactionFrom(typeof statusLine === "string" ? statusLine : null, title, path) ?? (listing.status === "rented" || rentByPrice ? "rent" : null);
  // A small amount found without a label is a rent only on a page for rent; elsewhere it is a charge or a cadastral income.
  if (unlabelled && !rentByPrice && listing.transaction !== "rent" && (listing.price ?? 0) < 2_000) listing.price = null;
  listing.propertyType = propertyTypeFrom(path, title);
  listing.reference ??= referenceFromUrl(pageUrl);
  if (!listing.description) {
    const paragraphs = textBlock.split("\n").filter((line) => line.length > 160);
    listing.description = paragraphs[0] ?? null;
  }
  if (!listing.photos.length) {
    const og = metaContent(html, "og:image");
    if (og) listing.photos = [normalizeUrl(og, pageUrl) ?? og];
  }
  return { listing, structured: found };
}

/** The CRM id in a listing URL (/detail/7917339/…, …-264763), used when the page shows no reference. */
export function referenceFromUrl(url: string): string | null {
  const parsed = new URL(url);
  const ids = [...parsed.pathname.matchAll(/(?:^|[^\d])(\d{5,9})(?=[^\d]|$)/g)].map((m) => m[1]!);
  return ids.at(-1) ?? queryId(parsed);
}

const removedNotice =
  /(niet (meer|langer) (online|beschikbaar)|is (reeds )?(verkocht|verhuurd) en niet meer|n'est plus (en ligne|disponible)|plus disponible en ligne|no longer (online|available))/i;

/** A listing page that still answers but says the listing was taken offline ("Helaas staat dit zoekertje niet meer online"). */
export function isRemovedListingPage(listing: ExtractedListing, html: string): boolean {
  return removedNotice.test(pageText(html)) && !isListingPage(listing, html);
}

/**
 * Whether a page is a single listing rather than an overview or an article:
 * a price, or rooms or areas, near a type of property, without dozens of prices.
 * A page the site's own overview shows as a card needs one fact (a garage or a
 * shop to rent has a price but no rooms).
 */
/** A status shown as a label of its own in the top of the listing ("Optie", "Verkocht"), not a word in a sentence. */
function badgeLine(html: string, title?: string | null): string | null {
  // The label alone on its line, maybe decorated ("* Vendu *", "- Optie -").
  const badge = /^[^\p{L}\d]{0,3}(onder optie|in optie|optie|sous option|sous compromis|compromis|under offer|bod aanvaard|verkocht|vendu|sold|verhuurd|lou[ée]|rented)[^\p{L}\d]{0,3}$/iu;
  // A status word next to another one is a legend or a filter ("Te koop / Optie koop / Verkocht" above a project's units).
  const statusWord = /^(te koop|te huur|beschikbaar|vrij|optie( koop| huur)?|onder optie|in optie|verkocht|verhuurd|à vendre|à louer|disponible|option|sous option|vendu|lou[ée]|for sale|for rent|available|under offer|sold|rented)\s*!?$/i;
  // A status right after a unit's area or followed by a link to open it, or repeated, belongs to cards of units or other
  // listings, not to this listing.
  const cardLink = /^(bekijk|bekijken|meer info|details?|voir|découvrir|view|more)\b/i;
  const area = /^\d+(?:[.,]\d+)?\s*m²$/i;
  const all = mainPart(pageText(html)).split("\n").map((line) => line.trim());
  const lines = all.slice(0, 40);
  const found = lines.filter(
    (line, i) =>
      badge.test(line) && !statusWord.test(lines[i - 1] ?? "") && !statusWord.test(lines[i + 1] ?? "") && !area.test(lines[i - 1] ?? "") && !cardLink.test(lines[i + 1] ?? ""),
  );
  const [first] = found;
  if (first) {
    if (found.some((line) => line.toLowerCase() !== first.toLowerCase())) return null;
    return all.filter((line) => line.toLowerCase() === first.toLowerCase()).length <= 3 ? first : null;
  }
  // Further down, only a label right next to the listing's own heading (its words are in the page title).
  const titleWords = new Set((title ?? "").toLowerCase().match(/\p{L}{4,}/gu) ?? []);
  const nearTitle = (line: string | undefined) => (line?.toLowerCase().match(/\p{L}{4,}/gu) ?? []).filter((w) => titleWords.has(w)).length >= 2;
  return all.find((line, i) => badge.test(line) && (nearTitle(all[i - 1]) || nearTitle(all[i + 1]))) ?? null;
}

export function isListingPage(listing: ExtractedListing, html: string, shownOnOverview = false): boolean {
  // Prices in the blocks of other listings below it ("Net gemist") don't make a listing page an overview.
  const text = mainPart(pageText(html));
  const prices = text.match(/€\s?\d{2,3}[.\s]\d{3}|\d{2,3}[.\s]\d{3}\s?€/g)?.length ?? 0;
  // A new-build project shown as a card lists the prices of its units, and is one listing when it has no unit pages.
  if (prices > 12 && !shownOnOverview) return false;
  const facts = [listing.price, listing.bedrooms, listing.livingArea, listing.plotArea, listing.epcScore ?? listing.epcLabel, listing.postcode].filter((v) => v != null).length;
  return facts >= (shownOnOverview ? 1 : 2) && (listing.propertyType != null || listing.transaction != null || listing.price != null);
}

/** Which of the agency's agents the page names (the earliest mention wins), as the widget does. */
export function matchAgent<T extends { name: string }>(agents: T[], ...texts: (string | null | undefined)[]): T | null {
  const fold = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").toLowerCase();
  const haystack = fold(texts.filter(Boolean).join("\n"));
  let best: { agent: T; at: number } | null = null;
  for (const agent of agents) {
    const at = haystack.indexOf(fold(agent.name));
    if (at >= 0 && (!best || at < best.at)) best = { agent, at };
  }
  return best?.agent ?? null;
}

/** Which fields matter most and are still missing, so Claude is only asked when it helps. */
export function missingKeyFacts(listing: ExtractedListing): (keyof ExtractedListing)[] {
  return (["price", "postcode", "city", "propertyType", "transaction", "bedrooms", "livingArea", "agentName"] as const).filter((field) => listing[field] == null);
}
