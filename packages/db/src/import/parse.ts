import type { MarketPropertyType, Region } from "../schema/reference";

/** Splits a delimited text export (Statbel uses "|", Excel exports ";" or ","), handling quotes. */
export function parseDelimited(text: string): Record<string, string>[] {
  const lines = text.replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) return [];
  const delimiter = ["|", ";", "\t", ","].find((d) => lines[0]!.includes(d)) ?? ",";
  const split = (line: string) => {
    const cells: string[] = [];
    let cell = "";
    let quoted = false;
    for (const ch of line) {
      if (ch === '"') quoted = !quoted;
      else if (ch === delimiter && !quoted) {
        cells.push(cell.trim());
        cell = "";
      } else cell += ch;
    }
    cells.push(cell.trim());
    return cells;
  };
  const header = split(lines[0]!);
  return lines.slice(1).map((line) => Object.fromEntries(split(line).map((v, i) => [header[i] ?? `col${i}`, v])));
}

const pick = (row: Record<string, string>, names: string[]) => {
  const key = Object.keys(row).find((k) => names.includes(k.trim().toUpperCase()));
  return key ? row[key]!.trim() : undefined;
};
const toInt = (value: string | undefined) => {
  if (!value) return null;
  const n = Number(value.replace(/[^\d.,-]/g, "").replace(/\.(?=\d{3}\b)/g, "").replace(",", "."));
  return Number.isFinite(n) ? Math.round(n) : null;
};

/** Region from a NIS municipality code: 21xxx Brussels; 1, 3, 4, 7, 23, 24 Flanders; 25, 5, 6, 8, 9 Wallonia. */
export function regionOf(nisCode: string): Region | null {
  if (nisCode.startsWith("21")) return "brussels";
  if (/^(1|3|4|7|23|24)/.test(nisCode)) return "flanders";
  if (/^(25|5|6|8|9)/.test(nisCode)) return "wallonia";
  return null;
}

/**
 * Municipality NIS codes only. Totals for Belgium and the regions (0xxxx),
 * provinces (x0000, 20001, 20002) and districts (xx000) are skipped.
 */
export function isMunicipality(nisCode: string) {
  return /^\d{5}$/.test(nisCode) && !nisCode.startsWith("0") && !nisCode.endsWith("000") && nisCode !== "20001" && nisCode !== "20002";
}

/** Statbel building categories → our types. "All houses" is skipped to avoid double counting. */
export function statbelType(label: string): MarketPropertyType | null {
  const l = label.toLowerCase();
  // Order matters: "all houses (excluding apartments)" mentions apartments, "halfopen" contains "open".
  if (/^(alle|toutes|tous|all)\b/.test(l)) return null;
  if (/bouwgrond|terrain|building land/.test(l)) return null;
  if (/appartement|flat|studio/.test(l)) return "apartment";
  if (/\b2 (of|ou|or) 3\b|gesloten|halfopen|mitoyenn/.test(l)) return "house";
  if (/\b4\b.*(meer|plus|more)|\(open bebouwing|villa|landhuis|landhuizen|bungalow/.test(l)) return "villa";
  if (/maison|huis|house|woonhuizen/.test(l)) return "house";
  return null;
}

/*
 * Statbel "real estate sales per municipality" open data. Column names vary a
 * little between releases, so each field accepts a few names. Verify against
 * the downloaded file before importing: run with --dry-run first.
 */
export function parseStatbel(text: string): MarketRow[] {
  const rows = parseDelimited(text);
  const out: MarketRow[] = [];
  for (const row of rows) {
    const period = pick(row, ["CD_PERIOD", "PERIOD", "PERIODE"]);
    if (period && !/^(y|year|jaar|année|annee|0)$/i.test(period)) continue; // annual figures only
    // Some files split each figure by living-area class; keep the total.
    const surfaceClass = pick(row, ["CD_CLASS_SURFACE"]);
    if (surfaceClass && !/tota/i.test(surfaceClass)) continue;
    const nisCode = pick(row, ["CD_REFNIS", "CD_MUNTY_REFNIS", "REFNIS", "NIS"]);
    const type = statbelType(pick(row, ["CD_TYPE_NL", "TX_TYPE_NL", "CD_TYPE_FR", "TX_TYPE_FR", "CD_TYPE", "TYPE"]) ?? "");
    const year = toInt(pick(row, ["CD_YEAR", "YEAR", "JAAR"]));
    const median = toInt(pick(row, ["MS_P_50", "MS_P50", "MS_P_50_MEDIAN", "MEDIAN", "MEDIAAN"]));
    const transactions = toInt(pick(row, ["MS_TRANSACTIONS", "MS_TOTAL_TRANSACTIONS", "MS_TRANS", "TRANSACTIONS"])) ?? 0;
    if (!nisCode || !isMunicipality(nisCode) || !type || !year) continue;
    const municipalityNl = pick(row, ["CD_REFNIS_NL", "TX_REFNIS_NL", "TX_MUNTY_DESCR_NL"]) ?? null;
    const municipalityFr = pick(row, ["CD_REFNIS_FR", "TX_REFNIS_FR", "TX_MUNTY_DESCR_FR"]) ?? null;
    out.push({
      nisCode,
      municipality: municipalityNl ?? municipalityFr ?? nisCode,
      municipalityNl,
      municipalityFr,
      quarter: 0,
      region: regionOf(nisCode),
      propertyType: type,
      year,
      transactions,
      p25: toInt(pick(row, ["MS_P_25", "MS_P25"])),
      median,
      p75: toInt(pick(row, ["MS_P_75", "MS_P75"])),
    });
  }
  return out;
}

/**
 * Names to try, in order, when linking a bpost row to a Statbel municipality:
 * the locality, the main municipality, and each part of a merged name
 * ("Merelbeke-Melle" since 2025), since Statbel's figures use the municipalities
 * as they were when the sales happened.
 */
export function candidateNames(locality: string, municipality: string | null) {
  const names = [locality, municipality ?? ""];
  if (municipality?.includes("-")) names.push(...municipality.split("-"));
  const keys = names.filter(Boolean).map(nameKey);
  for (const k of [...keys]) if (GERMAN_NAMES[k]) keys.push(nameKey(GERMAN_NAMES[k]!));
  return [...new Set(keys)];
}

/** bpost postcode list (exported to CSV): postcode, locality, main municipality, province. */
export function parseBpost(text: string) {
  return parseDelimited(text)
    .map((row) => ({
      postcode: pick(row, ["POSTCODE", "CODE POSTAL", "CODE", "POSTCODE / CODE POSTAL"]) ?? "",
      locality: pick(row, ["PLAATSNAAM", "LOCALITÉ", "LOCALITE", "LOCALITY", "NAAM"]) ?? "",
      municipality: pick(row, ["HOOFDGEMEENTE", "COMMUNE PRINCIPALE", "MAIN MUNICIPALITY", "GEMEENTE"]) ?? null,
      province: pick(row, ["PROVINCIE", "PROVINCE"]) ?? null,
    }))
    .filter((r) => /^\d{4}$/.test(r.postcode) && r.locality);
}

/** Name key for matching bpost municipality names to Statbel's (accents, case and punctuation ignored). */
export const nameKey = (name: string) =>
  name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\(.*?\)/g, "")
    .replace(/[^a-z]/g, "");

const MEASURES: [RegExp, "transactions" | "median" | "p25" | "p75"][] = [
  [/nombre|aantal|number/i, "transactions"],
  [/m[ée]dia/i, "median"],
  [/premier|eerste|first/i, "p25"],
  [/troisi[èe]me|derde|third/i, "p75"],
];

export type MarketRow = {
  nisCode: string;
  municipality: string;
  municipalityNl: string | null;
  municipalityFr: string | null;
  quarter: number;
  region: Region | null;
  propertyType: MarketPropertyType;
  year: number;
  transactions: number;
  p25: number | null;
  /** Empty when Statbel suppresses it (fewer than 10 sales). */
  median: number | null;
  p75: number | null;
};

/**
 * Statbel's Excel "sales per municipality per quarter" (Dutch or French): one
 * row per municipality and quarter, the property types side by side, each with
 * transactions, median, first and third quartile. Header rows are found by name.
 */
export function parseStatbelSheet(rows: unknown[][]): MarketRow[] {
  const cell = (v: unknown) => (v == null ? "" : String(v).trim());
  const headerIndex = rows.findIndex((r) => r.some((c) => /^refnis$/i.test(cell(c))));
  if (headerIndex < 1) return [];
  const header = rows[headerIndex]!.map(cell);
  const typeRow = rows[headerIndex - 1]!.map(cell);
  const lang = header.some((h) => /nombre|localit|ann[ée]e/i.test(h)) ? "fr" : "nl";
  const col = (re: RegExp) => header.findIndex((h) => re.test(h));
  const refnisCol = col(/^refnis$/i);
  const nameCol = col(/localit|gemeente|plaats|commune|naam/i);
  const yearCol = col(/ann[ée]e|^jaar$|^year$/i);
  const periodCol = col(/p[ée]riode|period/i);

  // Each property type label starts a block of measure columns.
  const blocks: { type: MarketPropertyType; columns: Partial<Record<(typeof MEASURES)[number][1], number>> }[] = [];
  let current: (typeof blocks)[number] | null = null;
  header.forEach((h, c) => {
    // Merged header cells repeat the label over every column they span: a block starts where the label changes.
    if (typeRow[c] && typeRow[c] !== typeRow[c - 1]) {
      const type = statbelType(typeRow[c]!);
      current = type ? { type, columns: {} } : null;
      if (current) blocks.push(current);
    }
    const measure = MEASURES.find(([re]) => re.test(h))?.[1];
    if (current && measure && current.columns[measure] === undefined) current.columns[measure] = c;
  });

  const out: MarketRow[] = [];
  for (const r of rows.slice(headerIndex + 1)) {
    const nisCode = cell(r[refnisCol]);
    const year = toInt(cell(r[yearCol]));
    const period = cell(r[periodCol]);
    const quarter = /^q?[1-4]$/i.test(period) ? Number(period.slice(-1)) : /^(y|year|jaar|ann[ée]e)?$/i.test(period) ? 0 : null;
    if (!isMunicipality(nisCode) || !year || quarter === null) continue;
    const name = cell(r[nameCol]) || nisCode;
    for (const b of blocks) {
      const value = (k: keyof typeof b.columns) => (b.columns[k] === undefined ? null : toInt(cell(r[b.columns[k]!])));
      const transactions = value("transactions");
      if (transactions == null) continue;
      out.push({
        nisCode,
        municipality: name,
        municipalityNl: lang === "nl" ? name : null,
        municipalityFr: lang === "fr" ? name : null,
        quarter,
        region: regionOf(nisCode),
        propertyType: b.type,
        year,
        transactions,
        p25: value("p25"),
        median: value("median"),
        p75: value("p75"),
      });
    }
  }
  return out;
}

/** Official French names of the German-speaking municipalities, which bpost lists in German. */
export const GERMAN_NAMES: Record<string, string> = {
  amel: "Amblève",
  bullingen: "Bullange",
  butgenbach: "Butgenbach",
  burgreuland: "Burg-Reuland",
  eupen: "Eupen",
  kelmis: "La Calamine",
  lontzen: "Lontzen",
  raeren: "Raeren",
  sanktvith: "Saint-Vith",
};

/** Region of a bpost province name (Dutch or French), to reject links to a municipality in another region. */
export function provinceRegion(province: string | null): Region | null {
  const k = nameKey(province ?? "");
  if (!k) return null;
  if (/brussel|bruxelles/.test(k)) return "brussels";
  if (/^(antwerpen|anvers|limburg|limbourg|oostvlaanderen|flandreorientale|westvlaanderen|flandreoccidentale|vlaamsbrabant|brabantflamand)$/.test(k)) return "flanders";
  if (/^(henegouwen|hainaut|luik|liege|luxemburg|luxembourg|namen|namur|waalsbrabant|brabantwallon)$/.test(k)) return "wallonia";
  return null;
}
