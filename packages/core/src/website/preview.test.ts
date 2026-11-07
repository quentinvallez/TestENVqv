import { describe, expect, it } from "vitest";
import { demoSlots } from "../planner/demo-slots";
import { emptyListing } from "./extract";
import { allowsFraming, pageLanguage, previewCandidates, previewListing, previewSiteFromInput, rankPreviewListings, siteName } from "./preview";

describe("widget preview", () => {
  it("knows which sites can be shown in a frame", () => {
    expect(allowsFraming(undefined)).toBe(true);
    expect(allowsFraming({ xFrameOptions: null, contentSecurityPolicy: null })).toBe(true);
    expect(allowsFraming({ xFrameOptions: "SAMEORIGIN", contentSecurityPolicy: null })).toBe(false);
    expect(allowsFraming({ xFrameOptions: "DENY", contentSecurityPolicy: null })).toBe(false);
    expect(allowsFraming({ xFrameOptions: null, contentSecurityPolicy: "frame-ancestors 'none'; base-uri 'self'" })).toBe(false);
    expect(allowsFraming({ xFrameOptions: null, contentSecurityPolicy: "default-src 'self'; frame-ancestors 'self' https://partner.be" })).toBe(false);
    expect(allowsFraming({ xFrameOptions: null, contentSecurityPolicy: "frame-ancestors *" })).toBe(true);
    // A policy without frame-ancestors says nothing about frames.
    expect(allowsFraming({ xFrameOptions: null, contentSecurityPolicy: "upgrade-insecure-requests" })).toBe(true);
  });

  it("reads the agency's name and language", () => {
    expect(siteName(`<meta property="og:site_name" content="Immo Zone &amp; Co">`)).toBe("Immo Zone & Co");
    expect(siteName(`<title>Lindeveld Vastgoed | Uw makelaar in Gent</title>`)).toBe("Lindeveld Vastgoed");
    expect(siteName(`<title>Trevi - Vastgoed</title>`)).toBe("Trevi");
    expect(siteName(`<p>no title</p>`)).toBeNull();
    // A title that starts with the page's name, not the agency's.
    expect(siteName(`<title>Home | Immodyck</title>`)).toBe("Immodyck");
    expect(siteName(`<meta property="og:site_name" content="Home"><title>Welkom - Immo Dyck</title>`)).toBe("Immo Dyck");
    expect(pageLanguage(`<html lang="fr-BE">`)).toBe("fr");
    expect(pageLanguage(`<html class="x" lang="nl">`)).toBe("nl");
    expect(pageLanguage(`<html>`)).toBe("nl");
  });

  it("finds listings and for-sale overviews on the home page", () => {
    const site = "https://www.immo-test.be/";
    const html = `
      <a href="/verkocht">Verkocht</a>
      <a href="/te-huur">Te huur</a>
      <a href="/te-koop">Te koop</a>
      <a href="/contact">Contact</a>
      <a href="/te-koop/gent/woning/4493114">Woning Gent</a>
      <a href="https://elders.be/te-koop/1/1234567">Elders</a>`;
    const { listings, overviews } = previewCandidates(html, site, site);
    expect(listings).toEqual(["https://www.immo-test.be/te-koop/gent/woning/4493114"]);
    expect(overviews).toEqual(["https://www.immo-test.be/te-koop", "https://www.immo-test.be/te-huur"]);
  });

  it("only shows listings that can be booked, best first", () => {
    const listing = (over: Partial<ReturnType<typeof emptyListing>>) => ({ ...emptyListing(), ...over });
    expect(previewListing("https://x.be/1", listing({ status: "sold", street: "Kerkstraat" }))).toBeNull();
    expect(previewListing("https://x.be/1", listing({}))).toBeNull();
    const plain = previewListing("https://x.be/1", listing({ city: "Gent" }))!;
    const full = previewListing("https://x.be/2", listing({ street: "Kerkstraat", photos: ["http://x.be/a.jpg", "https://x.be/b.jpg"] }))!;
    const option = previewListing("https://x.be/3", listing({ street: "Molenstraat", status: "under_offer", photos: ["https://x.be/c.jpg"] }))!;
    expect(full.photo).toBe("https://x.be/b.jpg");
    expect(rankPreviewListings([plain, option, full]).map((l) => l.url)).toEqual(["https://x.be/2", "https://x.be/3", "https://x.be/1"]);
    // A garage box is a poor example of a viewing: homes go first.
    const garage = previewListing("https://x.be/4", listing({ street: "Jan Welterslaan", propertyType: "garage", photos: ["https://x.be/d.jpg"] }))!;
    expect(rankPreviewListings([garage, full]).map((l) => l.url)).toEqual(["https://x.be/2", "https://x.be/4"]);
  });

  it("takes a typed address as the site's root", () => {
    expect(previewSiteFromInput("immo-zone.be")).toBe("https://immo-zone.be/");
    expect(previewSiteFromInput(" https://www.trevi.be/nl/aanbod ")).toBe("https://www.trevi.be/");
    expect(previewSiteFromInput("")).toBeNull();
  });

  it("gives sample times from the slot engine, the same for the same preview", () => {
    const now = new Date("2026-11-09T08:00:00Z");
    const slots = demoSlots("wpv_1", now);
    expect(slots.length).toBeGreaterThan(10);
    expect(slots[0]!.start.getTime()).toBeGreaterThanOrEqual(now.getTime() + 12 * 3600 * 1000);
    expect(demoSlots("wpv_1", now)).toEqual(slots);
  });
});
