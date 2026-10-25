# Market data for valuations (Flanders, Brussels, Wallonia)

The valuation uses two free, official sources for all of Belgium. Both are imported once and refreshed when new figures are published (Statbel: yearly).

| Table | Source | What it is |
|---|---|---|
| `market_prices` | Statbel, "real estate sales per municipality" (quarterly Excel, or the yearly open-data text file) | Number of sales, 25th percentile, median and 75th percentile price per municipality, building type and quarter (or year), from deeds registered at the FPS Finance land registry |
| `postcodes` | bpost postcode list | Postcode → locality → municipality, so an address can be linked to its Statbel figures |

A valuation uses the last four published quarters (eight if fewer than two have a price), weighted by the number of sales; the report names the period. Statbel leaves out prices for fewer than 10 sales, so small municipalities often fall back to longer periods or to a visit.

Statbel's building types map to ours: houses with 2 or 3 façades → `house`, 4 or more façades → `villa`, apartments/flats/studios → `apartment`. "All houses" is skipped to avoid counting twice.

## Steps

1. Download the files by hand (Statbel blocks automated downloads):
   - **Statbel**, both languages so every name matches: statbel.fgov.be → Figures → Housing → Real estate → "per municipality, per quarter" (`.xlsx`). The files are called `NL_immo_statbel_kwartaal_per_gemeente.xlsx` and `FR_immo_statbel_trimestre_par_commune.xlsx`.
   - **bpost**: bpost.be → Codes postaux / Postcodes → the list "by postcode", e.g. `https://www.bpost.be/sites/default/files/zipcodes/zipcodes_num_fr_2025.xls`. It is an old `.xls` file: open it in Excel and use Save as → CSV. The French list is the one tested; the Dutch one works too.
2. Check the columns are read correctly; nothing is written:
   ```bash
   pnpm --filter @viewing/db import:market path/to/statbel-file.xlsx --dry-run
   ```
   The summary shows the number of municipalities, the years, and the split over Flanders, Brussels and Wallonia.
3. Import:
   ```bash
   DATABASE_URL=... pnpm --filter @viewing/db import:market path/to/statbel-nl.xlsx
   DATABASE_URL=... pnpm --filter @viewing/db import:market path/to/statbel-fr.xlsx
   DATABASE_URL=... pnpm --filter @viewing/db import:postcodes path/to/bpost_fr.csv
   ```
   Import Statbel first. Postcodes are linked to municipalities by name (Dutch, French and German names, never across regions); the summary lists any names that didn't match. Re-run the postcode import after adding the other language of the Statbel file.

Run it against the Neon database (Production and each preview branch that should have data).

## Until the data is imported

Valuations still work where the agency has its own recent sales nearby (method `comparables`, wider range). Without either source the owner gets no online figure and is offered a visit instead. The report always says which data it used.

## Without official data

Individual sale prices are not public in Belgium. The "recently sold nearby" figures in the report are the agency's own sales (listings with status Sold, a sale price and a sale date), shown by street without house number.
