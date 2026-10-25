import { describe, expect, it } from "vitest";
import { candidateNames, isMunicipality, provinceRegion, nameKey, parseBpost, parseStatbel, parseStatbelSheet, regionOf, statbelType } from "./parse";

// Small hand-written samples in the shape of the public files; not real figures.
describe("parseStatbel", () => {
  it("reads annual rows, maps building types and skips 'all houses'", () => {
    const text = [
      "CD_YEAR|CD_TYPE_NL|CD_REFNIS|CD_REFNIS_NL|CD_PERIOD|MS_TRANSACTIONS|MS_P_25|MS_P_50|MS_P_75",
      "2025|Huizen met 2 of 3 gevels (gesloten + halfopen bebouwing)|44021|Gent|Y|100|1|2|3",
      "2025|Huizen met 4 of meer gevels (open bebouwing)|44021|Gent|Y|50|4|5|6",
      "2025|Appartementen, flats, studio's|21004|Brussel|Y|80|7|8|9",
      "2025|Alle huizen met 2, 3, 4 of meer gevels (exclusief appartementen)|44021|Gent|Y|150|1|1|1",
      "2025|Appartementen, flats, studio's|21004|Brussel|Q1|20|7|8|9",
    ].join("\n");
    const rows = parseStatbel(text);
    expect(rows.map((r) => [r.nisCode, r.propertyType, r.median, r.region])).toEqual([
      ["44021", "house", 2, "flanders"],
      ["44021", "villa", 5, "flanders"],
      ["21004", "apartment", 8, "brussels"],
    ]);
  });
});

describe("regions and names", () => {
  it("maps NIS codes to the three regions", () => {
    expect(regionOf("11002")).toBe("flanders");
    expect(regionOf("24062")).toBe("flanders");
    expect(regionOf("21015")).toBe("brussels");
    expect(regionOf("25072")).toBe("wallonia");
    expect(regionOf("62063")).toBe("wallonia");
    expect(regionOf("92094")).toBe("wallonia");
  });
  it("recognises French and Dutch labels", () => {
    expect(statbelType("Appartements, flats, studios")).toBe("apartment");
    expect(statbelType("Maisons de 2 ou 3 façades")).toBe("house");
    expect(statbelType("Maisons de 4 façades ou plus")).toBe("villa");
  });
  it("matches municipality names across languages' punctuation", () => {
    expect(nameKey("Sint-Martens-Latem")).toBe(nameKey("SINT MARTENS LATEM"));
    expect(nameKey("Liège")).toBe(nameKey("Liege"));
  });
  it("reads a bpost CSV export", () => {
    // Same columns as bpost's 2025 file, including "Deelgemeente".
    const rows = parseBpost("Postcode;Plaatsnaam;Deelgemeente;Hoofdgemeente;Provincie\n612;Sinterklaas;;Sinterklaas;\n2600;Berchem;Ja;ANTWERPEN;ANTWERPEN\n1000;Brussel;Neen;BRUSSEL;BRUSSEL");
    expect(rows).toEqual([
      { postcode: "2600", locality: "Berchem", municipality: "ANTWERPEN", province: "ANTWERPEN" },
      { postcode: "1000", locality: "Brussel", municipality: "BRUSSEL", province: "BRUSSEL" },
    ]);
  });
});

describe("candidateNames", () => {
  it("tries the locality, the main municipality and the parts of a merged one", () => {
    expect(candidateNames("Bottelare", "MERELBEKE-MELLE")).toEqual(["bottelare", "merelbekemelle", "merelbeke", "melle"]);
    expect(candidateNames("Liège", "LIÈGE")).toEqual(["liege"]);
  });
});

describe("Statbel's older file layout", () => {
  // Header and labels as in Statbel's national file (1973–2017); figures replaced.
  it("reads MS_TOTAL_TRANSACTIONS, keeps the total surface class and skips building land", () => {
    const text = [
      "CD_YEAR|CD_TYPE_NL|CD_TYPE_FR|CD_REFNIS|CD_REFNIS_NL|CD_REFNIS_FR|CD_PERIOD|CD_CLASS_SURFACE|MS_TOTAL_TRANSACTIONS|MS_TOTAL_PRICE|MS_TOTAL_SURFACE|MS_MEAN_PRICE|MS_P10|MS_P25|MS_P50|MS_P75|MS_P90",
      "2017|gewone woonhuizen|maisons d'habitation|44021|Gent|Gand|Y|totaal / total|10|0|0|0|0|1|2|3|0",
      "2017|gewone woonhuizen|maisons d'habitation|44021|Gent|Gand|Y|< 100 m²|4|0|0|0|0|1|2|3|0",
      "2017|villa's bungalows, landhuizen|villas, bungalows, maisons de campagne|44021|Gent|Gand|Y|totaal / total|5|0|0|0|0|4|5|6|0",
      "2017|bouwgronden|terrains à bâtir|44021|Gent|Gand|Y|totaal / total|5|0|0|0|0|4|5|6|0",
    ].join("\n");
    expect(parseStatbel(text).map((r) => [r.propertyType, r.transactions, r.median, r.municipalityFr])).toEqual([
      ["house", 10, 2, "Gand"],
      ["villa", 5, 5, "Gand"],
    ]);
  });
});

describe("isMunicipality", () => {
  it("keeps municipalities and skips country, region, province and district totals", () => {
    expect(["11002", "21004", "44021", "62063", "92094"].every(isMunicipality)).toBe(true);
    expect(["01000", "02000", "04000", "10000", "20001", "21000", "44000"].some(isMunicipality)).toBe(false);
  });
});

describe("parseStatbelSheet", () => {
  // Layout of Statbel's "per commune per quarter" Excel file, with merged type headers; figures replaced.
  const typeLabels = (label: string) => [label, label, label, label, null];
  const sheet = [
    ["Catégories immobilières", null, null, null, null],
    [null, null, null, null, null, ...typeLabels("Toutes les maisons avec 2, 3, 4 ou plus de façades (excl. appartements)"), ...typeLabels("Maisons avec 2 ou 3 façades (type fermé + type demi-fermé)"), ...typeLabels("Appartements")],
    ["refnis", "localité", "année", "période", null, ...Array(3).fill(["nombre transactions", "prix médian(€)", "prix premier quartile(€)", "prix troisième quartile(€)", null]).flat()],
    ["11002", "ANVERS", "2026", "Q2", null, 9, 9, 9, 9, null, 40, 300, 250, 350, null, 12, null, null, null],
    ["21000", "BRUXELLES (ARR.)", "2026", "Q2", null, 9, 9, 9, 9, null, 40, 300, 250, 350, null, 12, 1, 1, 1],
  ];
  it("reads each type block, keeps suppressed prices empty, and skips non-municipalities", () => {
    expect(parseStatbelSheet(sheet).map((r) => [r.nisCode, r.municipalityFr, r.quarter, r.propertyType, r.transactions, r.median, r.p25, r.p75])).toEqual([
      ["11002", "ANVERS", 2, "house", 40, 300, 250, 350],
      ["11002", "ANVERS", 2, "apartment", 12, null, null, null],
    ]);
  });

  it("reads the Dutch version of the file", () => {
    const nl = [
      [null, null, null, null, null, ...typeLabels("Huizen met 2 of 3 gevels (gesloten + halfopen bebouwing)")],
      ["refnis", "lokaliteit", "jaar", "periode", null, "aantal transacties", "mediaan prijs(€)", "eerste kwartiel prijs(€)", "derde kwartiel prijs(€)", null],
      ["11002", "ANTWERPEN", "2026", "Q2", null, 40, 300, 250, 350, null],
    ];
    expect(parseStatbelSheet(nl).map((r) => [r.municipalityNl, r.municipalityFr, r.propertyType, r.median])).toEqual([["ANTWERPEN", null, "house", 300]]);
  });
});

describe("provinceRegion", () => {
  it("maps bpost provinces in both languages", () => {
    expect(provinceRegion("ANVERS")).toBe("flanders");
    expect(provinceRegion("FLANDRE-ORIENTALE")).toBe("flanders");
    expect(provinceRegion("BRUXELLES")).toBe("brussels");
    expect(provinceRegion("LUIK")).toBe("wallonia");
    expect(provinceRegion("BRABANT WALLON")).toBe("wallonia");
    expect(provinceRegion("")).toBeNull();
  });
});
