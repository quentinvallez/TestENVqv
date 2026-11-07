import {
  boilerplateLines,
  decodeEntities,
  extractListing,
  isListingPage,
  looksLikeListingUrl,
  looksLikeOverviewUrl,
  metaContent,
  normalizeUrl,
  pageLinks,
  sameSite,
  type ExtractedListing,
} from "./extract";
import type { FetchedPage } from "./fetch";
import { brandColor, siteBuilder, type SiteBuilder } from "./look";
import { listingLinks } from "./overview";
import { listingFromFlightData, listingFromPageData, pageDataUrl, withPageData } from "./page-data";
import { continueDiscovery, newDiscovery, type DiscoveryReader } from "./discover";
import { SiteReader } from "./reader";

/*
 * The widget preview for an agency that isn't a client yet: we read its home
 * page and a few of its listing pages, the way the import does (robots.txt,
 * crawl delay, only its own site), to show our widget on its own listings.
 * Nothing is saved as an agency or listing, and nothing is put on its site:
 * the preview is a page of ours. Pure helpers first, tested without the network.
 */

/** One of the agency's listings as the preview shows it. */
export type PreviewListing = {
  url: string;
  title: string | null;
  street: string | null;
  houseNumber: string | null;
  postcode: string | null;
  city: string | null;
  price: number | null;
  transaction: "sale" | "rent" | null;
  propertyType: string | null;
  bedrooms: number | null;
  livingArea: number | null;
  photo: string | null;
  agentName: string | null;
  status: "active" | "under_offer";
};

export type PreviewSite = {
  site: string;
  /** The agency's name as its site gives it. */
  name: string | null;
  brandColor: string | null;
  siteBuilder: SiteBuilder | null;
  language: "nl" | "fr" | "en";
  /** Whether the site lets another page show it in a frame; otherwise the preview shows a picture of it. */
  homeFramable: boolean;
  listingFramable: boolean;
  listings: PreviewListing[];
};

/** How many listings a preview offers to switch between. */
export const PREVIEW_LISTINGS = 3;
/** Listing pages read at most for one preview. */
const MAX_LISTING_READS = 6;

/**
 * Whether a page may be shown inside a frame on another site: no X-Frame-Options (DENY, SAMEORIGIN or the old
 * ALLOW-FROM all keep us out), and a Content-Security-Policy frame-ancestors, if any, open to every https site.
 */
export function allowsFraming(framing: FetchedPage["framing"]): boolean {
  if (!framing) return true;
  if (framing.xFrameOptions?.trim()) return false;
  const ancestors = framing.contentSecurityPolicy
    ?.split(/[;,]/)
    .map((d) => d.trim().toLowerCase())
    .find((d) => d.startsWith("frame-ancestors"));
  if (!ancestors) return true;
  const sources = ancestors.split(/\s+/).slice(1);
  return sources.some((s) => s === "*" || s === "https:");
}

/** Words a title starts with that aren't a name ("Home | Immodyck"). */
const GENERIC_TITLE = /^(home|homepage|home page|welkom|welcome|bienvenue|accueil|startpagina|start|index)$/i;

/** The agency's name: what the site calls itself for sharing, else the title of its home page without the slogan. */
export function siteName(html: string): string | null {
  const shared = metaContent(html, "og:site_name") ?? metaContent(html, "application-name");
  if (shared?.trim() && !GENERIC_TITLE.test(decodeEntities(shared).trim())) return decodeEntities(shared).trim().slice(0, 80);
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  if (!title) return null;
  const parts = decodeEntities(title)
    .replace(/\s+/g, " ")
    .split(/\s+[|·•–—-]\s+/)
    .map((part) => part.trim())
    .filter((part) => part && !GENERIC_TITLE.test(part));
  return parts[0] ? parts[0].slice(0, 80) : null;
}

/** The language the page is written in, for the widget's texts. */
export function pageLanguage(html: string): "nl" | "fr" | "en" {
  const lang = html.match(/<html\b[^>]*\blang\s*=\s*["']?([a-z]{2})/i)?.[1]?.toLowerCase();
  return lang === "fr" || lang === "en" ? lang : "nl";
}

/** Overviews that list what is for sale come first: those listings are the ones a visitor books. */
const OVERVIEW_ORDER = [/te-koop|kopen|a-vendre|acheter|for-sale|buy/i, /aanbod|biens|panden|properties|woningen/i, /te-huur|huren|a-louer|louer|for-rent|rent/i];

/** Where to look for listings on a home page: the listing links it shows itself, and its overview pages. */
export function previewCandidates(html: string, pageUrl: string, site: string): { listings: string[]; overviews: string[] } {
  const listings = listingLinks(html, pageUrl, site).filter((url) => url !== site);
  const overviews = pageLinks(html, pageUrl)
    .filter((url) => sameSite(url, site) && looksLikeOverviewUrl(url, site) && !listings.includes(url))
    // Sold and rented overviews have nothing to book.
    .filter((url) => !/verkocht|verhuurd|vendu|lou[eé]|sold|rented|referenties|references/i.test(url));
  const rank = (url: string) => {
    const at = OVERVIEW_ORDER.findIndex((pattern) => pattern.test(url));
    return at < 0 ? OVERVIEW_ORDER.length : at;
  };
  overviews.sort((a, b) => rank(a) - rank(b) || a.length - b.length);
  return { listings, overviews };
}

/** A listing read from its page as the preview shows it; null when it isn't one that can be booked. */
export function previewListing(url: string, listing: ExtractedListing): PreviewListing | null {
  const status = listing.status ?? "active";
  if (status !== "active" && status !== "under_offer") return null;
  if (!listing.street && !listing.city && !listing.title) return null;
  return {
    url,
    title: listing.title,
    street: listing.street,
    houseNumber: listing.houseNumber,
    postcode: listing.postcode,
    city: listing.city,
    price: listing.price,
    transaction: listing.transaction,
    propertyType: listing.propertyType,
    bedrooms: listing.bedrooms,
    livingArea: listing.livingArea,
    photo: listing.photos.find((p) => /^https:\/\//i.test(p)) ?? null,
    agentName: listing.agentName,
    status,
  };
}

/** Listings with an address and a photo first, then those on offer before those under option, then homes before garages, land and shops, then for sale before to rent. */
export function rankPreviewListings(listings: PreviewListing[]): PreviewListing[] {
  const home = (l: PreviewListing) => !["garage", "land", "commercial", "office"].includes(l.propertyType ?? "");
  const score = (l: PreviewListing) => (l.street ? 16 : 0) + (l.photo ? 8 : 0) + (l.status === "active" ? 4 : 0) + (home(l) ? 2 : 0) + (l.transaction !== "rent" ? 1 : 0);
  return [...listings].sort((a, b) => score(b) - score(a));
}

/** The address an agency or prospect types ("immo-zone.be") as a full URL. */
export function previewSiteFromInput(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const url = normalizeUrl(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
  return url ? new URL(url).origin + "/" : null;
}

/** At most this long for the import's search when the home page and its overviews show no listing links. */
const SEARCH_MS = 20_000;

/** Listing pages the import's search finds first, leaving out those an overview card marks as sold or rented. */
async function searchListings(reader: SiteReader, site: string, deadline: number): Promise<string[]> {
  const found: string[] = [];
  const seen = new Set<string>();
  const enough = () => found.length >= MAX_LISTING_READS;
  const search: DiscoveryReader = {
    site,
    robots: reader.robots,
    read: (url) => reader.read(url),
    fits: (until) => !enough() && reader.fits(until),
  };
  await continueDiscovery(
    search,
    newDiscovery(site),
    {
      found: async (urls, _root, badges) => {
        let fresh = 0;
        for (const url of urls) {
          if (seen.has(url)) continue;
          seen.add(url);
          fresh++;
          const badge = badges?.get(url);
          if (badge !== "sold" && badge !== "rented") found.push(url);
        }
        return { newToOverview: fresh, newToSite: fresh };
      },
    },
    deadline,
    null,
  ).catch((error) => console.error(`The search for listings on ${site} failed`, error));
  return found;
}

export class PreviewError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PreviewError";
  }
}

/**
 * Reads what the preview needs from the agency's site: its home page, then listing pages linked from it or from its
 * first overview pages, until a few bookable listings are found or the deadline passes.
 */
export async function readPreviewSite(site: string, deadline: number): Promise<PreviewSite> {
  const reader = await SiteReader.open(site);
  const home = await reader.read(site);
  if (!("html" in home)) throw new PreviewError("blocked" in home ? "The website's robots.txt doesn't let us read it." : `The website could not be read: ${home.error}`);
  if (home.status >= 400) throw new PreviewError(`The website answered with error ${home.status}.`);
  // The site may move us to its own address (www., a language folder): that is where it lives.
  const base = new URL(home.url).origin + "/";
  const boilerplate = boilerplateLines(home.html);

  const { listings: onHome, overviews } = previewCandidates(home.html, home.url, base);
  const candidates = [...onHome];
  for (const overview of overviews.slice(0, 2)) {
    if (candidates.length >= MAX_LISTING_READS || !reader.fits(deadline)) break;
    const page = await reader.read(overview);
    if (!("html" in page) || page.status >= 400) continue;
    for (const url of listingLinks(page.html, page.url, base)) if (!candidates.includes(url)) candidates.push(url);
  }
  // Sites whose links the quick look misses (data files, page numbers, forms, sitemaps): the import's own search,
  // stopped as soon as it has a few listing pages that aren't marked sold or rented on their cards.
  if (candidates.length < PREVIEW_LISTINGS && reader.fits(deadline)) {
    for (const url of await searchListings(reader, base, Math.min(deadline, Date.now() + SEARCH_MS))) if (!candidates.includes(url)) candidates.push(url);
  }
  // Addresses that plainly look like one listing first.
  candidates.sort((a, b) => Number(looksLikeListingUrl(b, base)) - Number(looksLikeListingUrl(a, base)));

  const found: PreviewListing[] = [];
  let listingFramable = allowsFraming(home.framing);
  let reads = 0;
  for (const url of candidates) {
    if (found.length >= PREVIEW_LISTINGS || reads >= MAX_LISTING_READS || !reader.fits(deadline)) break;
    reads++;
    const page = await reader.read(url);
    if (!("html" in page) || page.status >= 400) continue;
    const dataUrl = pageDataUrl(page.html, page.url);
    const dataRead = dataUrl && reader.fits(deadline) ? await reader.read(dataUrl) : null;
    const pageData = dataRead && "html" in dataRead && dataRead.status === 200 ? listingFromPageData(dataRead.html, page.url) : listingFromFlightData(page.html, page.url);
    const read = extractListing(page.html, url, boilerplate);
    const listing = pageData ? withPageData(read.listing, pageData) : read.listing;
    if (!isListingPage(listing, page.html, true)) continue;
    const shown = previewListing(normalizeUrl(page.url) ?? url, listing);
    if (!shown) continue;
    if (!found.length) listingFramable = allowsFraming(page.framing);
    found.push(shown);
  }

  return {
    site: base,
    name: siteName(home.html),
    brandColor: brandColor(home.html),
    siteBuilder: siteBuilder(home.html),
    language: pageLanguage(home.html),
    homeFramable: allowsFraming(home.framing),
    listingFramable,
    listings: rankPreviewListings(found),
  };
}
