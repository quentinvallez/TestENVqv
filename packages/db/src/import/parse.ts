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

/** Statbel building categories → our types. "All houses" is skipped to avoid double counting. */
export function statbelType(label: string): MarketPropertyType | null {
  const l = label.toLowerCase();
  // Order matters: "all houses (excluding apartments)" mentions apartments, "halfopen" contains "open".
  if (/^(alle|toutes|tous|all)\b/.test(l)) return null;
  if (/appartement|flat|studio/.test(l)) return "apartment";
  if (/\b2 (of|ou|or) 3\b|gesloten|halfopen|mitoyenn/.test(l)) return "house";
  if (/\b4\b.*(meer|plus|more)|\(open bebouwing|villa/.test(l)) return "villa";
  if (/maison|huis|house/.test(l)) return "house";
  return null;
}

/*
 * Statbel "real estate sales per municipality" open data. Column names vary a
 * little between releases, so each field accepts a few names. Verify against
 * the downloaded file before importing: run with --dry-run first.
 */
export function parseStatbel(text: string) {
  const rows = parseDelimited(text);
  const out = [];
  for (const row of rows) {
    const period = pick(row, ["CD_PERIOD", "PERIOD", "PERIODE"]);
    if (period && !/^(y|year|jaar|année|annee|0)$/i.test(period)) continue; // annual figures only
    const nisCode = pick(row, ["CD_REFNIS", "CD_MUNTY_REFNIS", "REFNIS", "NIS"]);
    const type = statbelType(pick(row, ["CD_TYPE_NL", "TX_TYPE_NL", "CD_TYPE_FR", "TX_TYPE_FR", "CD_TYPE", "TYPE"]) ?? "");
    const year = toInt(pick(row, ["CD_YEAR", "YEAR", "JAAR"]));
    const median = toInt(pick(row, ["MS_P_50", "MS_P50", "MS_P_50_MEDIAN", "MEDIAN", "MEDIAAN"]));
    const transactions = toInt(pick(row, ["MS_TRANSACTIONS", "MS_TRANS", "TRANSACTIONS"])) ?? 0;
    if (!nisCode || !type || !year || !median) continue;
    out.push({
      nisCode,
      municipality: pick(row, ["CD_REFNIS_NL", "TX_REFNIS_NL", "TX_MUNTY_DESCR_NL", "CD_REFNIS_FR", "TX_REFNIS_FR", "MUNICIPALITY"]) ?? nisCode,
      municipalityFr: pick(row, ["CD_REFNIS_FR", "TX_REFNIS_FR", "TX_MUNTY_DESCR_FR"]) ?? null,
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
  return [...new Set(names.filter(Boolean).map(nameKey))];
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
