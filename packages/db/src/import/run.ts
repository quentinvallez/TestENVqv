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
import ExcelJS from "exceljs";
import { db } from "../index";
import { marketPrices, postcodes } from "../schema/reference";
import { candidateNames, nameKey, parseBpost, parseStatbel, parseStatbelSheet, provinceRegion, regionOf, type MarketRow } from "./parse";

const [kind, file, flag] = process.argv.slice(2);
const dryRun = flag === "--dry-run";
if (!kind || !file) {
  console.error("Usage: run.ts <market|postcodes> <file> [--dry-run]");
  process.exit(1);
}
// Statbel's text files are Latin-1 (ISO-8859-1); bpost CSV exports are UTF-8.
const raw = readFileSync(file);
const text = file.endsWith(".xlsx") ? "" : new TextDecoder(raw.includes(0xc3) ? "utf-8" : "latin1").decode(raw);

async function sheetRows(): Promise<unknown[][]> {
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(raw as unknown as ArrayBuffer);
  const sheet = book.worksheets[0]!;
  const rows: unknown[][] = [];
  sheet.eachRow({ includeEmpty: true }, (row) => {
    const values = row.values as unknown[];
    rows.push(values.slice(1).map((v) => (v && typeof v === "object" && "result" in v ? (v as { result: unknown }).result : v)));
  });
  return rows;
}

if (kind === "market") {
  const rows: MarketRow[] = file.endsWith(".xlsx") ? parseStatbelSheet(await sheetRows()) : parseStatbel(text);
  const years = [...new Set(rows.map((r) => r.year))].sort();
  const quarters = rows.filter((r) => r.quarter > 0);
  const latest = quarters.reduce((m, r) => Math.max(m, r.year * 10 + r.quarter), 0);
  console.log(`${rows.length} rows · ${new Set(rows.map((r) => r.nisCode)).size} municipalities · years ${years[0]}–${years.at(-1)}${latest ? ` · latest quarter ${Math.floor(latest / 10)} Q${latest % 10}` : ""}`);
  console.log("prices suppressed (<10 sales):", rows.filter((r) => r.median == null).length);
  console.log("by region:", Object.fromEntries(["flanders", "brussels", "wallonia"].map((r) => [r, rows.filter((x) => x.region === r).length])));
  console.log("sample:", rows.slice(0, 3));
  if (!dryRun) {
    for (let i = 0; i < rows.length; i += 500) {
      await db
        .insert(marketPrices)
        .values(rows.slice(i, i + 500))
        .onConflictDoUpdate({
          target: [marketPrices.nisCode, marketPrices.propertyType, marketPrices.year, marketPrices.quarter],
          set: {
            // Importing the Dutch and the French file fills both names; the Dutch one is shown.
            municipalityNl: sql`coalesce(excluded.municipality_nl, ${marketPrices.municipalityNl})`,
            municipalityFr: sql`coalesce(excluded.municipality_fr, ${marketPrices.municipalityFr})`,
            municipality: sql`coalesce(excluded.municipality_nl, ${marketPrices.municipalityNl}, excluded.municipality)`,
            region: sql`excluded.region`,
            transactions: sql`excluded.transactions`,
            p25: sql`excluded.p25`,
            median: sql`excluded.median`,
            p75: sql`excluded.p75`,
            importedAt: sql`now()`,
          },
        });
    }
    console.log("imported");
  }
} else if (kind === "postcodes") {
  const rows = parseBpost(text);
  const municipalities = await db
    .selectDistinct({ nisCode: marketPrices.nisCode, municipality: marketPrices.municipality, municipalityNl: marketPrices.municipalityNl, municipalityFr: marketPrices.municipalityFr })
    .from(marketPrices);
  const byName = new Map<string, (typeof municipalities)[number]>();
  for (const m of municipalities) {
    for (const name of [m.municipality, m.municipalityNl, m.municipalityFr]) if (name) byName.set(nameKey(name), m);
  }
  const keys = [...byName.keys()];
  const find = (r: (typeof rows)[number]) => {
    const region = provinceRegion(r.province);
    // Never link across regions ("Berchem" in Antwerp is not Sint-Agatha-Berchem in Brussels).
    const ok = (m: (typeof municipalities)[number] | undefined) => m && (!region || regionOf(m.nisCode) === region) ? m : undefined;
    for (const c of candidateNames(r.locality, r.municipality)) {
      const m = ok(byName.get(c));
      if (m) return m;
    }
    // bpost "Ham-sur-Heure" for Statbel "Ham-sur-Heure-Nalinnes": only for the main municipality, and only if unique.
    const main = nameKey(r.municipality ?? "");
    if (main.length >= 5) {
      const longer = [...new Set(keys.filter((k) => k.startsWith(main)).map((k) => byName.get(k)!))].filter((m) => ok(m));
      if (new Set(longer.map((m) => m.nisCode)).size === 1) return longer[0];
    }
    return undefined;
  };
  const linked = rows.map((r) => {
    const match = find(r);
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
