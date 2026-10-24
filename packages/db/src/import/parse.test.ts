import { describe, expect, it } from "vitest";
import { nameKey, parseBpost, parseStatbel, regionOf, statbelType } from "./parse";

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
    const rows = parseBpost("Postcode;Plaatsnaam;Hoofdgemeente;Provincie\n2600;Berchem;Antwerpen;Antwerpen\n1000;Brussel;Brussel;Brussel");
    expect(rows).toEqual([
      { postcode: "2600", locality: "Berchem", municipality: "Antwerpen", province: "Antwerpen" },
      { postcode: "1000", locality: "Brussel", municipality: "Brussel", province: "Brussel" },
    ]);
  });
});
