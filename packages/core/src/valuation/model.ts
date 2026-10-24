import type { ValuationAnswers, ValuationResult } from "@viewing/db/schema";

/*
 * Home valuation, deliberately simple and explainable:
 *
 *   1. Market level: the Statbel median sale price for the municipality and
 *      property type (latest year with enough sales).
 *   2. Adjust that median for this home: size, condition, EPC, kitchen,
 *      bathrooms and extras. The factors are starting assumptions, meant to be
 *      calibrated against the agency's own sales over time.
 *   3. Blend with the agency's own recent sales nearby (comparables), priced
 *      per m² and adjusted the same way.
 *   4. A range whose width reflects how much data there is.
 *
 * No AI is involved in the numbers.
 */

export type MarketMedian = NonNullable<ValuationResult["marketMedian"]> & { p25?: number | null; p75?: number | null };

export type Comparable = {
  street: string;
  city: string;
  propertyType: string;
  livingArea: number | null;
  price: number;
  soldAt: Date;
  condition?: ValuationAnswers["condition"];
  epcLabel?: string | null;
};

/** Typical living area behind a municipality median, used to scale for size. Assumption, see above. */
export const REFERENCE_AREA: Record<ValuationAnswers["propertyType"], number> = { house: 150, apartment: 90, villa: 230 };

const SIZE_ELASTICITY = 0.7; // twice the area is worth ~1.6x, not 2x

export const CONDITION: Record<ValuationAnswers["condition"], number> = { to_renovate: 0.82, good: 1, renovated: 1.08, new: 1.15 };

// Flanders and Wallonia require renovation of poor-EPC homes after purchase, so low labels weigh more.
export const EPC: Record<NonNullable<ValuationAnswers["epcLabel"]>, number> = { "A+": 1.07, A: 1.06, B: 1.03, C: 1, D: 0.96, E: 0.92, F: 0.88 };

const KITCHEN = { basic: 0.98, standard: 1, high_end: 1.03 } as const;
const EXTRAS: Record<ValuationAnswers["extras"][number], number> = { garage: 1.03, garden: 1.03, terrace: 1.02, pool: 1.04, solar: 1.01 };

/** Multiplicative adjustments for one home relative to a typical one. */
export function adjustments(answers: ValuationAnswers): { key: string; factor: number }[] {
  const list: { key: string; factor: number }[] = [];
  const reference = REFERENCE_AREA[answers.propertyType];
  list.push({ key: "size", factor: Math.pow(Math.max(answers.livingArea, 15) / reference, SIZE_ELASTICITY) });
  list.push({ key: "condition", factor: CONDITION[answers.condition] });
  if (answers.epcLabel) list.push({ key: "epc", factor: EPC[answers.epcLabel] });
  if (answers.kitchen) list.push({ key: "kitchen", factor: KITCHEN[answers.kitchen] });
  if (answers.bathrooms >= 2) list.push({ key: "bathrooms", factor: 1.02 });
  for (const extra of new Set(answers.extras)) {
    // A garden is expected with a house; it adds value mainly for apartments.
    if (extra === "garden" && answers.propertyType !== "apartment") continue;
    list.push({ key: extra, factor: EXTRAS[extra] });
  }
  if (answers.propertyType !== "apartment" && answers.plotArea && answers.plotArea > 800) {
    list.push({ key: "large_plot", factor: Math.min(1.08, 1 + (answers.plotArea - 800) / 20000) });
  }
  return list;
}

const product = (list: { factor: number }[]) => list.reduce((p, a) => p * a.factor, 1);
const round = (value: number, step = 5000) => Math.round(value / step) * step;
const MONTH = 30 * 24 * 3600 * 1000;

export function estimate(options: {
  answers: ValuationAnswers;
  market: MarketMedian | null;
  comparables: Comparable[];
  now?: Date;
}): ValuationResult | null {
  const { answers, market } = options;
  const now = options.now ?? new Date();
  const adj = adjustments(answers);
  const factor = product(adj);

  // Comparables: same type, priced per m² and brought to this home's condition and EPC.
  const comps = options.comparables
    .filter((c) => c.propertyType === answers.propertyType && c.livingArea && c.livingArea > 0)
    .filter((c) => now.getTime() - c.soldAt.getTime() < 36 * MONTH)
    .slice(0, 8);
  const compValues = comps.map((c) => {
    const perM2 = c.price / c.livingArea!;
    const sizeAdjusted = perM2 * Math.pow(answers.livingArea / c.livingArea!, SIZE_ELASTICITY - 1) * answers.livingArea;
    const condition = CONDITION[answers.condition] / CONDITION[c.condition ?? "good"];
    const epc = answers.epcLabel && c.epcLabel && c.epcLabel in EPC ? EPC[answers.epcLabel] / EPC[c.epcLabel as keyof typeof EPC] : 1;
    return sizeAdjusted * condition * epc;
  });
  const compEstimate = compValues.length ? compValues.reduce((a, b) => a + b, 0) / compValues.length : null;
  const marketEstimate = market ? market.median * factor : null;

  let point: number;
  let method: ValuationResult["method"];
  if (marketEstimate && compEstimate) {
    const weight = Math.min(0.6, compValues.length / 10); // more local sales, more weight
    point = weight * compEstimate + (1 - weight) * marketEstimate;
    method = "market_and_comparables";
  } else if (marketEstimate) {
    point = marketEstimate;
    method = "market";
  } else if (compEstimate && compValues.length >= 2) {
    point = compEstimate;
    method = "comparables";
  } else {
    return null; // not enough data to say anything responsible
  }

  // Width: market spread (p25–p75) tells how varied the municipality is; few sales widen it.
  const spread = market?.p25 && market?.p75 ? (market.p75 - market.p25) / market.median / 4 : 0.1;
  let halfWidth = Math.min(0.12, Math.max(0.06, spread));
  if (compValues.length < 3) halfWidth += 0.02;
  if (!market || market.transactions < 30) halfWidth += 0.03;
  if (!answers.epcLabel) halfWidth += 0.01;
  halfWidth = Math.min(0.2, halfWidth);

  const confidence: ValuationResult["confidence"] = halfWidth <= 0.09 ? "high" : halfWidth <= 0.145 ? "medium" : "low";
  return {
    low: round(point * (1 - halfWidth)),
    high: round(point * (1 + halfWidth)),
    point: round(point),
    confidence,
    method,
    marketMedian: market
      ? { municipality: market.municipality, propertyType: market.propertyType, year: market.year, period: market.period, median: market.median, transactions: market.transactions }
      : undefined,
    adjustments: adj.map((a) => ({ key: a.key, factor: Math.round(a.factor * 1000) / 1000 })),
    comparables: comps.map((c) => ({ street: c.street, city: c.city, propertyType: c.propertyType, livingArea: c.livingArea, price: c.price, soldAt: c.soldAt.toISOString() })),
  };
}
