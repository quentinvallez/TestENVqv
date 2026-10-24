import { describe, expect, it } from "vitest";
import { MIN_SCORE, similarity } from "./similarity";

const base = { id: "a", transaction: "sale", propertyType: "house", price: 450000, bedrooms: 3, livingArea: 160, postcode: "9000" };

describe("similarity", () => {
  it("scores a close match highly with reasons", () => {
    const m = similarity(base, { ...base, id: "b", price: 480000, livingArea: 170, postcode: "9050" })!;
    expect(m.score).toBeGreaterThanOrEqual(MIN_SCORE);
    expect(m.reasons).toEqual(["type", "price", "size", "bedrooms", "area"]);
  });
  it("never mixes sale and rent, nor suggests the same listing", () => {
    expect(similarity(base, { ...base, id: "c", transaction: "rent" })).toBeNull();
    expect(similarity(base, base)).toBeNull();
  });
  it("keeps far more expensive properties below the threshold", () => {
    expect(similarity(base, { ...base, id: "d", price: 900000, livingArea: 320, bedrooms: 6 })!.score).toBeLessThan(MIN_SCORE);
  });
});
