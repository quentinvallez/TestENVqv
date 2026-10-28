/*
 * Prints the raw markup of chosen parts of test sites (robots.txt and crawl delay obeyed), to see how their listing
 * cards, badges and prices are built before writing rules for them. Stores nothing.
 * Run: npx tsx packages/core/scripts/probe-html.ts [words of the site addresses]
 */
import { extractListing, looksLikeListingUrl, pageLinks, pageText, sameSite } from "../src/website/extract";
import { formPage, nextPageLinks, pageNumber } from "../src/website/overview";
import { SiteReader } from "../src/website/reader";

type Look = {
  /** Page to start on. */
  url: string;
  /** Text to find; further pages of the overview are read until it shows. Without one, the main content is shown. */
  needle?: string;
  pages?: number;
  /** "markup": the markup around the needle; "text": page text lines and facts; "links": every link on the page. */
  show: ("markup" | "text" | "links")[];
};

// Only sites Quentin chose for testing (his 10 test agencies since 2026-10-28).
const looks: Look[] = [
  { url: "https://www.tadam.immo/biens", needle: "arlon-app-004-rue-du-camp", show: ["markup"] },
  { url: "https://www.tadam.immo/biens", needle: "bonnert-29-rue-du-vicinal", show: ["markup"] },
  { url: "https://www.tadam.immo/arlon-app-004-rue-du-camp", show: ["text"] },
  { url: "https://www.tadam.immo/bonnert-29-rue-du-vicinal", show: ["text"] },
  { url: "https://jurimex.be/nl", show: ["links"] },
  { url: "https://www.immobolle.be/fr/2/chercher-bien/a-vendre", show: ["links", "markup"], needle: "chercher-bien/a-vendre?" },
  { url: "https://www.ngimmo.be/fr/a-vendre", show: ["links", "markup"], needle: "InfiniteScroll" },
  { url: "https://www.leximmo.be/nl/te-huur-te-koop", show: ["links"] },
  { url: "https://www.vlaemynck.be/te-koop", needle: "/te-koop/", show: ["markup"] },
  { url: "https://www.caenen.be/nl/te-koop", needle: "/project-", pages: 4, show: ["markup"] },
];

const clean = (html: string) =>
  html
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<(script|style|svg|noscript)\b[\s\S]*?<\/\1>/gi, "<$1/>")
    .replace(/\s+/g, " ");

async function main() {
  const only = process.argv.slice(2);
  const readers = new Map<string, SiteReader>();
  for (const look of looks) {
    if (only.length && !only.some((o) => look.url.includes(o))) continue;
    const origin = new URL(look.url).origin;
    const reader = readers.get(origin) ?? (await SiteReader.open(origin));
    readers.set(origin, reader);
    console.log(`\n================ ${look.url}${look.needle ? ` (looking for "${look.needle}")` : ""}`);
    let url: string | null = look.url;
    for (let page = 1; url && page <= (look.pages ?? 1); page++) {
      const read = await reader.read(url);
      if (!("html" in read)) {
        console.log(`unreadable: ${read.error}`);
        break;
      }
      const html = read.html;
      const at = look.needle ? html.indexOf(look.needle) : -1;
      console.log(`-- page ${page}: ${read.status} ${read.url}, ${html.length} chars${look.needle ? `, needle ${at < 0 ? "absent" : `at ${at}`}` : ""}`);
      if (look.needle && at < 0 && page < (look.pages ?? 1)) {
        url = nextPageLinks(html, read.url)[0] ?? formPage(html, read.url, (pageNumber(read.url)?.number ?? 1) + 1);
        continue;
      }
      if (look.show.includes("links")) {
        const links = pageLinks(html, read.url).filter((l) => sameSite(l, origin));
        console.log(`links (${links.length}): ${links.map((l) => `${l.replace(origin, "")}${looksLikeListingUrl(l, origin) ? " [L]" : ""}`).join("  ")}`);
      }
      if (look.show.includes("markup")) {
        const body = clean(html);
        const i = look.needle ? body.indexOf(look.needle) : Math.max(0, body.search(/<main\b/i));
        console.log(`markup: ${body.slice(Math.max(0, i - 2500), i + 5500)}`);
      }
      if (look.show.includes("text")) {
        const { listing } = extractListing(html, read.url);
        console.log(`facts: ${JSON.stringify({ ...listing, description: listing.description?.slice(0, 60), photos: listing.photos.length })}`);
        console.log(`canonical: ${html.match(/<link[^>]*rel=["']canonical["'][^>]*>/i)?.[0] ?? "-"}`);
        console.log(`text:\n${pageText(html).split("\n").slice(0, 160).join("\n")}`);
      }
      break;
    }
  }
}

main();
