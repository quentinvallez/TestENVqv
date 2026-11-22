/**
 * Brand colours as agencies type them: "#1e3a31", "1e3a31", "#1e3", "rgb(30, 58, 49)" or "30, 58, 49".
 * Pure and free of the database, so client components can import it (`@viewing/core/colour`).
 */

/** The colour as lowercase #rrggbb, or null when it isn't one we understand. */
export function parseColour(input: string): string | null {
  const value = input.trim().toLowerCase();
  const hex = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/.exec(value);
  if (hex) {
    const digits = hex[1]!;
    return `#${digits.length === 3 ? [...digits].map((d) => d + d).join("") : digits}`;
  }
  const rgb = /^(?:rgba?\s*\()?\s*(\d{1,3})\s*[,\s]\s*(\d{1,3})\s*[,\s]\s*(\d{1,3})\s*(?:[,/]\s*[\d.]+%?\s*)?\)?$/.exec(value);
  if (!rgb) return null;
  const channels = rgb.slice(1, 4).map(Number);
  if (channels.some((n) => n > 255)) return null;
  return `#${channels.map((n) => n.toString(16).padStart(2, "0")).join("")}`;
}

/** "30, 58, 49" for #1e3a31. */
export function rgbText(hex: string) {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(", ");
}

/** Relative luminance (WCAG) of a #rrggbb colour. */
export function luminance(hex: string) {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const v = parseInt(hex.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

/** Contrast ratio (WCAG) between two #rrggbb colours, from 1 to 21. */
export function contrast(a: string, b: string) {
  const [x, y] = [luminance(a), luminance(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

/** White or near-black text on the colour, whichever reads better (as widget.js does on its buttons). */
export function textOn(hex: string) {
  return contrast(hex, "#ffffff") >= contrast(hex, "#111111") ? "#ffffff" : "#111111";
}
