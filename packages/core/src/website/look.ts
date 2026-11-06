/*
 * What an agency's home page tells us at setup: the colour its site is built
 * around (for the floating buttons) and the system the site is built with (to
 * show the right install guide). Pure functions of the HTML, tested without
 * the network.
 */

/** Systems we give an install guide for. Real-estate suppliers build and host the site; the agency asks them. */
export type SiteBuilder = "wordpress" | "wix" | "webflow" | "squarespace" | "whise" | "skarabee" | "omnicasa" | "fortissimmo" | "sweepbright" | "zabun";

const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

/** "#abc" → "#aabbcc", lower case. */
function longHex(hex: string): string {
  const h = hex.toLowerCase();
  return h.length === 4 ? `#${h[1]}${h[1]}${h[2]}${h[2]}${h[3]}${h[3]}` : h;
}

function rgbHex(r: number, g: number, b: number): string | null {
  if (![r, g, b].every((n) => Number.isInteger(n) && n >= 0 && n <= 255)) return null;
  return `#${[r, g, b].map((n) => n.toString(16).padStart(2, "0")).join("")}`;
}

/** A colour value as "#rrggbb": hex or rgb()/rgba(); null for anything else (names, variables, gradients). */
function colourValue(raw: string): string | null {
  const value = raw.trim().replace(/\s*!important$/i, "");
  if (HEX.test(value)) return longHex(value);
  const rgb = value.match(/^rgba?\(\s*(\d{1,3})[\s,]+(\d{1,3})[\s,]+(\d{1,3})\s*(?:[,/]\s*[\d.]+%?\s*)?\)$/i);
  return rgb ? rgbHex(Number(rgb[1]), Number(rgb[2]), Number(rgb[3])) : null;
}

/** White, black and greys say nothing about a brand: every site uses them for text and backgrounds. */
function isNeutral(hex: string): boolean {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  return max - min < 24 && (max > 225 || max < 40 || max - min < 12);
}

/**
 * The site's brand colour: the colour it gives phones for their address bar (<meta name="theme-color">), the tile
 * colour Windows shows, or a CSS variable named for the brand ("--primary", "--brand-color", "--color-primary").
 * Neutral colours are skipped; null when the page names none.
 */
export function brandColor(html: string): string | null {
  const metas = [...html.matchAll(/<meta\b[^>]*>/gi)].map((m) => m[0]);
  for (const name of ["theme-color", "msapplication-TileColor"]) {
    for (const meta of metas) {
      if (!new RegExp(`\\bname\\s*=\\s*["']?${name}["']?`, "i").test(meta)) continue;
      // A theme colour for dark mode only isn't the brand.
      if (/\bmedia\s*=\s*["'][^"']*prefers-color-scheme:\s*dark/i.test(meta)) continue;
      const content = meta.match(/\bcontent\s*=\s*["']([^"']+)["']/i)?.[1];
      const colour = content ? colourValue(content) : null;
      if (colour && !isNeutral(colour)) return colour;
    }
  }
  const styles = [...html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => m[1]!).join("\n");
  const variables = [...styles.matchAll(/--([\w-]+)\s*:\s*([^;}]+)/g)];
  for (const pattern of [/^(?:[\w-]*-)?(?:brand|primary)(?:-colou?r)?$/i, /^(?:colou?r-)?(?:brand|primary)(?:-[\w-]+)?$/i, /^(?:[\w-]*-)?(?:main|accent)(?:-colou?r)?$/i]) {
    for (const [, name, value] of variables) {
      if (!pattern.test(name!)) continue;
      const colour = colourValue(value!);
      if (colour && !isNeutral(colour)) return colour;
    }
  }
  return null;
}

const BUILDERS: [SiteBuilder, RegExp][] = [
  // Real-estate suppliers first: their sites often run on WordPress too, and the supplier is who adds the line.
  ["whise", /\bwhise\b|webulous/i],
  ["skarabee", /skarabee/i],
  ["omnicasa", /omnicasa/i],
  ["fortissimmo", /fortissimmo/i],
  ["sweepbright", /sweepbright/i],
  ["zabun", /\bzabun\b/i],
  ["wix", /static\.wixstatic\.com|static\.parastorage\.com|<meta[^>]+content=["']Wix\.com/i],
  ["webflow", /\bdata-wf-(?:page|site)\b|assets\.website-files\.com|cdn\.prod\.website-files\.com/i],
  ["squarespace", /static1\.squarespace\.com|<!--\s*This is Squarespace/i],
  ["wordpress", /\/wp-content\/|\/wp-includes\/|<meta[^>]+content=["']WordPress/i],
];

/** The system the site is built with, from the traces it leaves in its HTML; null when none is recognised. */
export function siteBuilder(html: string): SiteBuilder | null {
  for (const [builder, trace] of BUILDERS) if (trace.test(html)) return builder;
  return null;
}
