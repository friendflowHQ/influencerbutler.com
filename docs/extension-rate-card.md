# Associates rate card in the extension

The extension shows a break-even estimate on every product page. When the user
is a signed-in creator, it reads the real onsite commission off the SiteStripe
bar. When SiteStripe is not present (most shoppers, and creators who are not
signed in), it now falls back to the **Amazon Associates fixed commission-rate
schedule** ("rate card"), matched on the product's category.

The rate card is the same for everyone in a marketplace, so it is harvested
once, centrally, and served to every extension, exactly like the CC / SPCC
catalogues. It is **not** harvested per user, and it is **not** publicly
scrapable: the Associates rate-plan / commission-income-statement pages redirect
to an Associates sign-in, so there is no server-side public URL to fetch.

## How it flows

1. **Harvest (desktop app).** `workspaces/settings/rate_card_checker.js` in the
   desktop repo already scrapes the per-marketplace commission tables behind the
   Associates login and writes them via `dailycommissionbutler/rate-card-store.js`
   into `rate-card.json` (shape: `{ byMarketplace: { "amazon.com": { marketplace,
   sourceUrl, lastCheckedAt, tables: [{ title, headers, rows }] } }, lastCheckedAt }`).

2. **Publish (central feed).** That snapshot is uploaded to R2 as
   `dcb/rate-cards/latest.json`, alongside `dcb/catalogues/{cc,spcc,deals}/`.
   Add a top-level `version` (any string that changes when the data changes; a
   date like `2026-07-06` is fine) and, optionally, `harvestedAt`:

   ```json
   {
     "version": "2026-07-06",
     "harvestedAt": "2026-07-06T00:00:00.000Z",
     "byMarketplace": {
       "amazon.com": {
         "marketplace": "amazon.com",
         "sourceUrl": "https://affiliate-program.amazon.com/...statement",
         "lastCheckedAt": 1720000000000,
         "tables": [
           {
             "title": "Fixed Standard Commission Income Rates",
             "headers": ["Category", "Fixed Commission Rate"],
             "rows": [
               ["Luxury Beauty, Amazon Explore", "10.00%"],
               ["Furniture, Home, Lawn & Garden", "3.00%"],
               ["All Other Categories", "4.00%"]
             ]
           }
         ]
       }
     }
   }
   ```

   Until this object exists the whole path no-ops cleanly (the serve route
   returns `{ notBuilt: true }` and the extension keeps using its saved guess).

3. **Serve (this repo).** `GET /api/extension/rate-card?marketplace=amazon.com`
   reads that object from R2 via the Cloudflare API (`src/lib/rate-card.ts`,
   reusing the `CLOUDFLARE_ACCOUNT_ID` + `R2_READ_TOKEN` env the catalogue cron
   already needs), pulls the "fixed standard commission" table, splits the
   catch-all "All Other Categories" row out as `defaultRatePct`, and returns a
   compact `{ marketplace, version, defaultRatePct, rows: [{ label, tokens,
   ratePct }] }`. Edge-cached for a day, keyed by version via ETag.

4. **Consume (extension).** The background worker downloads it once a day
   (`src/background/rate-card.ts` -> `chrome.storage.local` via
   `src/rate-card/cache.ts`) and the break-even panel looks the product's
   breadcrumb category up locally (`rateForCategory`), falling back to
   `defaultRatePct`. Zero per-pageview server cost.

## To turn it on

- Set `CLOUDFLARE_ACCOUNT_ID` + `R2_READ_TOKEN` in Vercel (same values the
  catalogue badges already need).
- Publish `dcb/rate-cards/latest.json` per step 2 (one upload from the desktop
  harvest output; re-upload whenever Amazon changes its rates, which is rare).

## Marketplaces

The extension currently requests the US card (`amazon.com`). The serve route
already accepts `?marketplace=` and the published snapshot can carry more
markets under `byMarketplace`; wiring the extension to request the page's
marketplace is a small follow-up when non-US cards are harvested.
