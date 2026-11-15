/**
 * The agency website's own look, as widget.js read it from the page (?bg=&fg=&brand=&font=&hfont=),
 * turned into the design tokens of the embedded widget so it blends into the site.
 * Only plain hex colours and font names get through; anything else falls back to our defaults.
 */
type Query = { bg?: string; fg?: string; brand?: string; font?: string; hfont?: string; fontsrc?: string; hfontsrc?: string };

const HEX = /^#[0-9a-f]{6}$/i;

function channels(hex: string) {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
}

function luminance(hex: string) {
  const [r, g, b] = channels(hex).map((n) => {
    const v = n / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

function expand(value?: string) {
  if (!value) return null;
  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(value);
  const hex = short ? `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}` : value;
  return HEX.test(hex) ? hex.toLowerCase() : null;
}

/** Font stacks as the site declares them, without anything that could escape the CSS value. */
function fontStack(value?: string) {
  if (!value) return null;
  const clean = value.replace(/[^\w\s,'"-]/g, "").slice(0, 160).trim();
  return clean || null;
}

export function embedLook(query: Query, savedBrand?: string | null): React.CSSProperties {
  const bg = expand(query.bg);
  const fg = expand(query.fg);
  // A brand colour the agency set in the back office wins over the one read from the page.
  const brand = expand(savedBrand ?? undefined) ?? expand(query.brand);
  const style: Record<string, string> = {};
  if (brand) {
    style["--brand"] = brand;
    // White or near-black text on the brand colour, whichever reads better.
    const l = luminance(brand);
    style["--brand-fg"] = (1.05 / (l + 0.05)) >= ((l + 0.05) / 0.0555) ? "#ffffff" : "#111111";
  } else {
    style["--brand"] = "var(--primary)";
    style["--brand-fg"] = "var(--primary-fg)";
  }
  const font = fontStack(query.font);
  const body = font && fontUrl(query.fontsrc) ? `"site-body", ${font}` : font;
  if (body) style.fontFamily = `${body}, system-ui, sans-serif`;
  const heading = fontStack(query.hfont);
  const head = heading && fontUrl(query.hfontsrc) ? `"site-heading", ${heading}` : heading;
  if (head) style["--heading-font"] = `${head}, ${body ?? "system-ui"}, sans-serif`;
  return style as React.CSSProperties;
}

/** A web font file on the agency's own site: https, a woff/woff2 file, nothing that could leave the CSS url(). */
function fontUrl(value?: string) {
  if (!value || value.length > 500 || /["'()\\\s<>]/.test(value)) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && /\.woff2?$/i.test(url.pathname) ? url.href : null;
  } catch {
    return null;
  }
}

/** @font-face rules that load the site's own body and heading fonts from the site, when widget.js found their files. */
export function embedFontFaces(query: Query) {
  const rules: string[] = [];
  const add = (stack: string | null, src: string | null, as: string) => {
    if (!stack || !src) return;
    rules.push(`@font-face{font-family:"${as}";src:url("${src}");font-display:swap}`);
  };
  add(fontStack(query.font), fontUrl(query.fontsrc), "site-body");
  add(fontStack(query.hfont), fontUrl(query.hfontsrc), "site-heading");
  return rules.join("");
}

/**
 * The site's page colours as root tokens, when both are readable together; else our own
 * light/dark tokens stay. The selector outranks the prefers-color-scheme rule in globals.css,
 * so a light site stays light for a visitor whose computer is in dark mode (and the other way round).
 */
export function embedRootCss(query: Query) {
  const bg = expand(query.bg);
  const fg = expand(query.fg);
  if (!bg || !fg) return "";
  const a = luminance(bg);
  const b = luminance(fg);
  if ((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05) < 4) return "";
  const mix = (pct: number) => `color-mix(in srgb, ${fg} ${pct}%, ${bg})`;
  const tokens = {
    "--panel": bg,
    "--canvas": bg,
    "--fg": fg,
    "--muted": mix(68),
    "--faint": mix(45),
    "--line": mix(16),
    "--line-strong": mix(28),
    "--hover": mix(6),
    "color-scheme": a < 0.25 ? "dark" : "light",
  };
  return `:root:not(#_){${Object.entries(tokens).map(([k, v]) => `${k}:${v}`).join(";")}}`;
}
