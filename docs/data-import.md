# Market data for valuations (Flanders, Brussels, Wallonia)

The valuation uses two free, official sources for all of Belgium. Both are imported once and refreshed when new figures are published (Statbel: yearly).

| Table | Source | What it is |
|---|---|---|
| `market_prices` | Statbel open data, "real estate sales per municipality" | Number of sales, 25th percentile, median and 75th percentile price per municipality, building type and year, from deeds registered at the FPS Finance land registry |
| `postcodes` | bpost postcode list | Postcode → locality → municipality, so an address can be linked to its Statbel figures |

Statbel's building types map to ours: houses with 2 or 3 façades → `house`, 4 or more façades → `villa`, apartments/flats/studios → `apartment`. "All houses" is skipped to avoid counting twice.

## Steps

1. Download the Statbel file (open data → real estate sales per municipality) and the bpost postcode list (save it as CSV).
2. Check the columns are read correctly; nothing is written:
   ```bash
   pnpm --filter @viewing/db import:market path/to/statbel-file.txt --dry-run
   ```
   The summary shows the number of municipalities, the years, and the split over Flanders, Brussels and Wallonia.
3. Import:
   ```bash
   DATABASE_URL=... pnpm --filter @viewing/db import:market path/to/statbel-file.txt
   DATABASE_URL=... pnpm --filter @viewing/db import:postcodes path/to/bpost.csv
   ```
   Postcodes are linked to municipalities by name; the summary lists any names that didn't match.

Run it against the Neon database (Production and each preview branch that should have data).

## Until the data is imported

Valuations still work where the agency has its own recent sales nearby (method `comparables`, wider range). Without either source the owner gets no online figure and is offered a visit instead. The report always says which data it used.

## Without official data

Individual sale prices are not public in Belgium. The "recently sold nearby" figures in the report are the agency's own sales (listings with status Sold, a sale price and a sale date), shown by street without house number.
