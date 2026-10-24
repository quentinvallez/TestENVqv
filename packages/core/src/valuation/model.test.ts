import { describe, expect, it } from "vitest";
import { adjustments, estimate, type Comparable, type MarketMedian } from "./model";

const now = new Date("2026-10-01T00:00:00Z");
const market: MarketMedian = { municipality: "Gent", propertyType: "house", year: 2025, median: 400000, transactions: 900, p25: 320000, p75: 500000 };
const house = { propertyType: "house" as const, livingArea: 150, bedrooms: 3, bathrooms: 1, condition: "good" as const, epcLabel: "C" as const, extras: [] };
const sold = (price: number, area: number, monthsAgo = 6): Comparable => ({
  street: "Coupure Links",
  city: "Gent",
  propertyType: "house",
  livingArea: area,
  price,
  soldAt: new Date(now.getTime() - monthsAgo * 30 * 24 * 3600 * 1000),
});

describe("estimate", () => {
  it("returns the municipality median for a typical home", () => {
    const r = estimate({ answers: house, market, comparables: [], now })!;
    expect(r.point).toBe(400000);
    expect(r.method).toBe("market");
    expect(r.low).toBeLessThan(400000);
    expect(r.high).toBeGreaterThan(400000);
  });

  it("values a bigger, renovated, efficient home higher, but less than proportionally to size", () => {
    const typical = estimate({ answers: house, market, comparables: [], now })!.point;
    const bigger = estimate({ answers: { ...house, livingArea: 300 }, market, comparables: [], now })!.point;
    expect(bigger / typical).toBeGreaterThan(1.5);
    expect(bigger / typical).toBeLessThan(2);
    const better = estimate({ answers: { ...house, condition: "renovated", epcLabel: "A" }, market, comparables: [], now })!.point;
    expect(better).toBeGreaterThan(typical);
  });

  it("discounts homes to renovate with a poor EPC", () => {
    const r = estimate({ answers: { ...house, condition: "to_renovate", epcLabel: "F" }, market, comparables: [], now })!;
    expect(r.point).toBeLessThan(310000);
  });

  it("blends in local sales and narrows the range when there are several", () => {
    const comps = [sold(450000, 150), sold(470000, 160), sold(440000, 145), sold(460000, 150)];
    const without = estimate({ answers: house, market, comparables: [], now })!;
    const withComps = estimate({ answers: house, market, comparables: comps, now })!;
    expect(withComps.method).toBe("market_and_comparables");
    expect(withComps.point).toBeGreaterThan(without.point);
    expect(withComps.high - withComps.low).toBeLessThan(without.high - without.low + 1);
    expect(withComps.comparables).toHaveLength(4);
  });

  it("ignores old sales and other property types", () => {
    const comps = [sold(900000, 150, 48), { ...sold(200000, 80), propertyType: "apartment" }];
    expect(estimate({ answers: house, market, comparables: comps, now })!.method).toBe("market");
  });

  it("works from local sales alone when there is no market data, and refuses with too little", () => {
    expect(estimate({ answers: house, market: null, comparables: [sold(450000, 150), sold(430000, 140)], now })!.method).toBe("comparables");
    expect(estimate({ answers: house, market: null, comparables: [sold(450000, 150)], now })).toBeNull();
  });

  it("only counts a garden as extra for apartments", () => {
    expect(adjustments({ ...house, extras: ["garden"] }).some((a) => a.key === "garden")).toBe(false);
    expect(adjustments({ ...house, propertyType: "apartment", livingArea: 90, extras: ["garden"] }).some((a) => a.key === "garden")).toBe(true);
  });
});
