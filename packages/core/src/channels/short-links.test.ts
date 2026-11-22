import { describe, expect, it } from "vitest";
import { isShortCode, linksIn, newShortCode, replaceLinks, shouldShorten } from "./short-links";

describe("short links", () => {
  it("finds links without the punctuation around them", () => {
    const text =
      "Kies een moment: https://www.immo-zone.be/nl/te-koop/huis/gent/12345#viewing-booking.\n" +
      "Verplaatsen (https://testenvqv.vercel.app/a/0f9c-1?change=1), of schrijf ons:\n" +
      "https://wa.me/32470123456?text=Hi%2C%20I'd%20rather%20continue%20on%20WhatsApp.%20(ref%20K7P2QXM4)";
    expect(linksIn(text).map((l) => l.url)).toEqual([
      "https://www.immo-zone.be/nl/te-koop/huis/gent/12345#viewing-booking",
      "https://testenvqv.vercel.app/a/0f9c-1?change=1",
      "https://wa.me/32470123456?text=Hi%2C%20I'd%20rather%20continue%20on%20WhatsApp.%20(ref%20K7P2QXM4)",
    ]);
    expect(linksIn("Mail info@agency.be or call 0470 12 34 56.")).toEqual([]);
  });

  it("only shortens links that get shorter and aren't ours already", () => {
    const origin = "https://unbird.io";
    expect(shouldShorten("https://unbird.io/l/AbCdEfGh12", origin)).toBe(false);
    expect(shouldShorten("https://a.be/x", origin)).toBe(false);
    expect(shouldShorten("https://testenvqv.vercel.app/book/lst_01jc9xabcdefghjkmnpqrstv", origin)).toBe(true);
  });

  it("replaces each link in place and keeps the rest of the text", () => {
    const text = "Boek hier: https://x.be/very/long/path. Of hier: https://x.be/very/long/path! Klaar.";
    expect(replaceLinks(text, (url) => (url === "https://x.be/very/long/path" ? "https://u.io/l/1" : undefined))).toBe(
      "Boek hier: https://u.io/l/1. Of hier: https://u.io/l/1! Klaar.",
    );
    expect(replaceLinks("Geen link.", () => "x")).toBe("Geen link.");
  });

  it("makes random codes of ten letters and digits", () => {
    const codes = new Set(Array.from({ length: 500 }, newShortCode));
    expect(codes.size).toBe(500);
    for (const code of codes) expect(isShortCode(code)).toBe(true);
  });
});
