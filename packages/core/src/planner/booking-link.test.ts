import { describe, expect, it } from "vitest";
import { websiteBookingUrl } from "./booking-link";

const now = new Date("2026-11-15T12:00:00Z");
const seen = { lastAt: "2026-11-14T12:00:00Z", url: "https://www.lindeveld.be/te-koop" };

describe("websiteBookingUrl", () => {
  it("points to the listing on the agency's site when the widget runs there", () => {
    expect(websiteBookingUrl("https://lindeveld.be/pand/villa#foto", seen, { now })).toBe("https://lindeveld.be/pand/villa#viewing-booking");
  });
  it("falls back to our booking page otherwise", () => {
    expect(websiteBookingUrl(null, seen, { now })).toBeNull();
    expect(websiteBookingUrl("https://lindeveld.be/pand/villa", null, { now })).toBeNull();
    expect(websiteBookingUrl("https://other.be/pand/villa", seen, { now })).toBeNull();
    expect(websiteBookingUrl("https://lindeveld.be/pand/villa", { ...seen, lastAt: "2026-09-01T00:00:00Z" }, { now })).toBeNull();
    expect(websiteBookingUrl("https://lindeveld.be/pand/villa", seen, { now, bookingLauncher: false })).toBeNull();
  });
});
