import { describe, expect, it } from "vitest";
import { brandColor, siteBuilder } from "./look";

describe("brand colour", () => {
  it("takes the colour the site gives phones", () => {
    expect(brandColor(`<head><meta name="theme-color" content="#1e3a31"></head>`)).toBe("#1e3a31");
    expect(brandColor(`<meta content="#C03" name=theme-color>`)).toBe("#cc0033");
    expect(brandColor(`<meta name="msapplication-TileColor" content="rgb(0, 82, 155)">`)).toBe("#00529b");
  });

  it("skips white, black, greys and a dark-mode theme colour", () => {
    expect(brandColor(`<meta name="theme-color" content="#ffffff"><meta name="msapplication-TileColor" content="#da532c">`)).toBe("#da532c");
    expect(brandColor(`<meta name="theme-color" media="(prefers-color-scheme: dark)" content="#7a1f3d">`)).toBeNull();
    expect(brandColor(`<meta name="theme-color" content="#333333">`)).toBeNull();
  });

  it("falls back to a CSS variable named for the brand", () => {
    const html = `<style>:root{--text:#222;--background:#fff;--color-primary:#0a6e4f;--accent:#f4b400}</style>`;
    expect(brandColor(html)).toBe("#0a6e4f");
    expect(brandColor(`<style>:root{--brand-color: rgba(176, 30, 45, 1)}</style>`)).toBe("#b01e2d");
    expect(brandColor(`<style>:root{--primary: var(--blue)}</style>`)).toBeNull();
  });

  it("is null when the page names no colour", () => {
    expect(brandColor(`<html><body><h1>Immo</h1></body></html>`)).toBeNull();
  });
});

describe("site builder", () => {
  it("recognises common systems by their traces", () => {
    expect(siteBuilder(`<link rel="stylesheet" href="/wp-content/themes/immo/style.css">`)).toBe("wordpress");
    expect(siteBuilder(`<img src="https://static.wixstatic.com/media/a.jpg">`)).toBe("wix");
    expect(siteBuilder(`<html data-wf-page="123" data-wf-site="456">`)).toBe("webflow");
    expect(siteBuilder(`<footer>Website by <a href="https://www.skarabee.com">Skarabee</a></footer>`)).toBe("skarabee");
  });

  it("names the real-estate supplier before the system it runs on", () => {
    expect(siteBuilder(`<script src="/wp-content/plugins/x.js"></script><footer>Powered by Omnicasa</footer>`)).toBe("omnicasa");
  });

  it("is null for a site built by hand", () => {
    expect(siteBuilder(`<html><head><script src="/_next/static/chunks/main.js"></script></head></html>`)).toBeNull();
  });
});
