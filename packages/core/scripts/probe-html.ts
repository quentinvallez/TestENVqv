/*
 * Prints the raw markup of chosen parts of test sites (robots.txt and crawl delay obeyed), to see how their listing
 * cards, badges and prices are built before writing rules for them. Stores nothing.
 * Run: npx tsx packages/core/scripts/probe-html.ts [words of the site addresses]
 */
import { flightProperty } from "../src/website/page-data";
import { extractListing, looksLikeListingUrl, mainPart, pageLinks, pageText, sameSite } from "../src/website/extract";
import { cardParts, cardTree, formPage, nextPageLinks, pageNumber } from "../src/website/overview";
import { SiteReader } from "../src/website/reader";

type Look = {
  /** Page to start on. */
  url: string;
  /** Text to find; further pages of the overview are read until it shows. Without one, the main content is shown. */
  needle?: string;
  pages?: number;
  /** Read the first link on the page whose address holds this text, and show that page instead. */
  follow?: string;
  /** "markup": the markup around the needle; "text": page text lines and facts; "links": every link on the page. */
  show: ("markup" | "text" | "links" | "data" | "cards" | "tail")[];
};

// Only sites Quentin chose for testing (his 10 test agencies since 2026-10-28).
const looks: Look[] = [
  // Immo Sciara (Quentin's test site, 2026-11-01): pages whose price was read wrong or not at all.
  { url: "https://www.immosciara.be/bien/a-vendre/immeuble-mixte/4031-liege-angleur/7792428", needle: "199", show: ["markup", "text"] },
  { url: "https://www.immosciara.be/bien/a-vendre/appartement/4020-liege/7854244", needle: "175", show: ["markup"] },
  { url: "https://www.immosciara.be/bien/a-vendre/appartement/4030-liege/7894945", needle: "119", show: ["markup", "text"] },
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
      if (look.follow) {
        const next = pageLinks(read.html, read.url).find((l) => l.includes(look.follow!));
        if (!next) {
          console.log(`no link with "${look.follow}"`);
          break;
        }
        const followed = await reader.read(next);
        console.log(`-- followed ${next}`);
        if (!("html" in followed)) {
          console.log(`unreadable: ${followed.error}`);
          break;
        }
        Object.assign(read, followed);
        // The same address on a later visit: home page first (as each import run starts), then the address.
        const later = await SiteReader.open(origin);
        await later.read(`${origin}/`);
        const again = await later.read(next);
        console.log(`-- on a later visit: ${"html" in again ? `${again.status} ${again.url}` : again.error}`);
        const trimmed = next.replace(/(\/\d{5,9})\/[\d/]+$/, "$1/0/0/0/0/0/0/");
        const plain = await later.read(trimmed);
        console.log(`-- ${trimmed}: ${"html" in plain ? `${plain.status} ${plain.url}` : plain.error}`);
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
      if (look.show.includes("cards")) {
        const cards = pageLinks(read.html, read.url).filter((l) => /\/\d{3,}\/?$/.test(new URL(l).pathname));
        for (const [url, part] of cardParts(read.html, read.url, cards)) console.log(`card ${url.replace(origin, "")} (${part.length} chars) badge lines: ${JSON.stringify(part.badge.slice(0, 300))}`);
        if (cards.length < 3) for (const url of cards) console.log(`tree of ${url.replace(origin, "")}:\n  ${cardTree(read.html, read.url, url).join("\n  ")}`);
      }
      if (look.show.includes("tail")) {
        const body = clean(html);
        const hrefs = [...body.matchAll(/href=["']([^"']+)["']/gi)].filter((m) => /\d{5,}/.test(m[1]));
        const last = hrefs.at(-1)?.index ?? body.search(/<main\b/i);
        console.log(`listing-like hrefs: ${hrefs.length}; first ${hrefs[0]?.[1]}`);
        console.log(`after the last: ${body.slice(Math.max(0, last), last + 4000)}`);
        console.log(`scripts: ${[...html.matchAll(/<script[^>]*src=["']([^"']+)/gi)].map((m) => m[1]).join(" ")}`);
        for (const m of html.matchAll(/(ajax|\/api\/|fetch\(|load-?more|jsf|paged|data-page|infinite)/gi)) console.log(`hint ${m[0]}: ${clean(html.slice(Math.max(0, m.index! - 200), m.index! + 300))}`);
      }
      if (look.show.includes("markup")) {
        const body = clean(html);
        const i = look.needle ? body.indexOf(look.needle) : Math.max(0, body.search(/<main\b/i));
        if (look.needle && (i < 0 || look.pages)) {
          // Only inside a script (data for the page's scripts): show each place in the raw page.
          for (let at = html.indexOf(look.needle), n = 0; at >= 0 && n < (look.pages ?? 3); at = html.indexOf(look.needle, at + 1), n++) console.log(`in a script: ${html.slice(Math.max(0, at - 1200), at + 400)}`);
        } else console.log(`markup: ${body.slice(Math.max(0, i - 1500), i + 1500)}`);
      }
      if (look.show.includes("data")) {
        const p = flightProperty(html, read.url);
        const flat = p && Object.fromEntries(Object.entries(p).filter(([, v]) => v == null || typeof v !== "object").map(([k, v]) => [k, typeof v === "string" && v.length > 80 ? `${v.slice(0, 80)}…` : v]));
        console.log(`data: ${JSON.stringify(flat)}`);
        for (const [k, v] of Object.entries(p ?? {})) if (Array.isArray(v) && /picture/i.test(k)) console.log(`${k}: ${JSON.stringify(v.slice(0, 3))}`);
      }
      if (look.show.includes("text")) {
        const { listing } = extractListing(html, read.url);
        console.log(`facts: ${JSON.stringify({ ...listing, description: listing.description?.slice(0, 60), photos: listing.photos.length })}`);
        console.log(`canonical: ${html.match(/<link[^>]*rel=["']canonical["'][^>]*>/i)?.[0] ?? "-"}`);
        console.log(`main (first 40):\n${mainPart(pageText(html)).split("\n").slice(0, 40).join("\n")}`);
        console.log(`text:\n${pageText(html).split("\n").slice(0, 160).join("\n")}`);
      }
      break;
    }
  }
}

main();
