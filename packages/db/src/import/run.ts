/*
 * Imports public reference data. Download the files first, then:
 *
 *   pnpm --filter @viewing/db import:market <statbel-file> [--dry-run]
 *   pnpm --filter @viewing/db import:postcodes <bpost-file.csv> [--dry-run]
 *
 * Postcodes are linked to municipalities (NIS codes) by name, so import market
 * prices first.
 */
import { readFileSync } from "node:fs";
import { sql } from "drizzle-orm";
import { db } from "../index";
import { marketPrices, postcodes } from "../schema/reference";
import { nameKey, parseBpost, parseStatbel, regionOf } from "./parse";

const [kind, file, flag] = process.argv.slice(2);
const dryRun = flag === "--dry-run";
if (!kind || !file) {
  console.error("Usage: run.ts <market|postcodes> <file> [--dry-run]");
  process.exit(1);
}
const text = readFileSync(file, "utf8");

if (kind === "market") {
  const rows = parseStatbel(text);
  const years = [...new Set(rows.map((r) => r.year))].sort();
  console.log(`${rows.length} rows · ${new Set(rows.map((r) => r.nisCode)).size} municipalities · years ${years.join(", ")}`);
  console.log("by region:", Object.fromEntries(["flanders", "brussels", "wallonia"].map((r) => [r, rows.filter((x) => x.region === r).length])));
  console.log("sample:", rows.slice(0, 3));
  if (!dryRun) {
    for (let i = 0; i < rows.length; i += 500) {
      await db
        .insert(marketPrices)
        .values(rows.slice(i, i + 500))
        .onConflictDoUpdate({
          target: [marketPrices.nisCode, marketPrices.propertyType, marketPrices.year],
          set: { transactions: sql`excluded.transactions`, p25: sql`excluded.p25`, median: sql`excluded.median`, p75: sql`excluded.p75`, importedAt: sql`now()` },
        });
    }
    console.log("imported");
  }
} else if (kind === "postcodes") {
  const rows = parseBpost(text);
  const municipalities = await db.selectDistinct({ nisCode: marketPrices.nisCode, municipality: marketPrices.municipality }).from(marketPrices);
  const byName = new Map(municipalities.map((m) => [nameKey(m.municipality), m]));
  const linked = rows.map((r) => {
    const match = byName.get(nameKey(r.municipality ?? r.locality));
    return { ...r, nisCode: match?.nisCode ?? null, municipality: match?.municipality ?? r.municipality, region: match ? regionOf(match.nisCode) : null };
  });
  const unmatched = linked.filter((r) => !r.nisCode);
  console.log(`${linked.length} postcodes · ${linked.length - unmatched.length} linked to a municipality · ${unmatched.length} not linked`);
  if (unmatched.length) console.log("not linked (check names):", [...new Set(unmatched.map((r) => r.municipality))].slice(0, 20));
  if (!dryRun) {
    for (let i = 0; i < linked.length; i += 500) {
      await db
        .insert(postcodes)
        .values(linked.slice(i, i + 500))
        .onConflictDoUpdate({
          target: [postcodes.postcode, postcodes.locality],
          set: { nisCode: sql`excluded.nis_code`, municipality: sql`excluded.municipality`, province: sql`excluded.province`, region: sql`excluded.region` },
        });
    }
    console.log("imported");
  }
}
process.exit(0);
