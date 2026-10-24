import { index, integer, pgTable, primaryKey, smallint, text, timestamp } from "drizzle-orm/pg-core";

/*
 * Public reference data shared by all agencies (no agency_id): filled by the
 * importers in packages/db/src/import from official open data.
 */

export type Region = "flanders" | "brussels" | "wallonia";
export type MarketPropertyType = "house" | "apartment" | "villa";

/** Postcode → municipality (NIS code), for all of Belgium. Source: bpost postcode list. */
export const postcodes = pgTable(
  "postcodes",
  {
    postcode: text().notNull(),
    // Sub-municipality or locality name as bpost lists it, e.g. "Berchem".
    locality: text().notNull(),
    nisCode: text(),
    municipality: text(),
    province: text(),
    region: text().$type<Region>(),
  },
  (t) => [primaryKey({ columns: [t.postcode, t.locality] }), index().on(t.nisCode)],
);

/** Sale prices per municipality, property type and year. Source: Statbel (registered deeds). */
export const marketPrices = pgTable(
  "market_prices",
  {
    nisCode: text().notNull(),
    municipality: text().notNull(),
    region: text().$type<Region>(),
    propertyType: text().$type<MarketPropertyType>().notNull(),
    year: smallint().notNull(),
    transactions: integer().notNull(),
    p25: integer(),
    median: integer().notNull(),
    p75: integer(),
    source: text().notNull().default("statbel"),
    importedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.nisCode, t.propertyType, t.year] })],
);
