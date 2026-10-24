type ListingLike = {
  id: string;
  transaction: string;
  propertyType: string;
  price: number | null;
  bedrooms: number | null;
  livingArea: number | null;
  postcode: string | null;
};

export type Match = { score: number; reasons: ("type" | "price" | "size" | "bedrooms" | "area")[] };

/**
 * How alike two listings are for someone looking at the first one. Plain rules
 * rather than a model, so agents can see why something was suggested.
 */
export function similarity(seen: ListingLike, candidate: ListingLike): Match | null {
  if (seen.id === candidate.id || seen.transaction !== candidate.transaction) return null;
  const reasons: Match["reasons"] = [];
  let score = 0;
  if (seen.propertyType === candidate.propertyType) {
    score += 4;
    reasons.push("type");
  }
  if (seen.price && candidate.price) {
    const diff = Math.abs(candidate.price - seen.price) / seen.price;
    if (diff <= 0.15) {
      score += 3;
      reasons.push("price");
    } else if (diff <= 0.3) score += 1;
    else score -= 2;
  }
  if (seen.livingArea && candidate.livingArea && Math.abs(candidate.livingArea - seen.livingArea) / seen.livingArea <= 0.25) {
    score += 2;
    reasons.push("size");
  }
  if (seen.bedrooms != null && candidate.bedrooms != null && Math.abs(candidate.bedrooms - seen.bedrooms) <= 1) {
    score += 2;
    reasons.push("bedrooms");
  }
  if (seen.postcode && candidate.postcode) {
    if (seen.postcode === candidate.postcode) {
      score += 2;
      reasons.push("area");
    } else if (seen.postcode.slice(0, 2) === candidate.postcode.slice(0, 2)) {
      score += 1;
      reasons.push("area");
    }
  }
  return { score, reasons };
}

/** Good enough to suggest: at least the same kind of property in a comparable price range. */
export const MIN_SCORE = 6;
