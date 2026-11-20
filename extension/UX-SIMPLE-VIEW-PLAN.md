# Simple view for search-result chips: detailed plan (item #4)

Status: plan only, nothing built. Grounded in a read of `extension/src/tools/search-overlay/overlay.ts` (renderBadge, recompute, estUnitsFor), `legend.ts`, `toolbar.ts`, `tools/tour/index.ts`, `storage/schema.ts` and `background/review-ask.ts` on 2026-11-20.

## Goal

A new creator should read a result tile in about one second. Today a tile shows up to 13 chips (score, Top pick, Approved, Earned, Owned, Posted, Messaged, commission $, est units, est revenue, BSR, campaign %, Accept, deal %, coupon, video counts), capped at 7 with "+N". Simple view replaces the analysis chips with three plain-language signals and leaves the action chips alone. Pro view stays exactly as it is today.

## What the user sees

Simple view tile row, left to right:
1. **Butler score chip** (unchanged, it is already a one-number summary).
2. **Top pick** chip (unchanged, only on the first tile after a Best-for-me sort).
3. **Three signals**, always the same three in the same order, each with an icon plus words (never color alone):
   - **Pays**: `Pays well` (good), `Pays average` (neutral), `Pays less` (low), `Pay unknown` (unknown).
   - **Sells**: `Sells well`, `Sells average`, `Sells slowly`, `Sales unknown`.
   - **Campaign**: `Campaign open` (good, tooltip shows the rate and end date), `No campaign` (neutral), `Checking...` while lookups run, `Campaign unknown` if a lookup failed.
4. **Action and warning chips that stay in Simple view**, because they change what the creator does next: Owned, Posted, Messaged/brand conversation, Accept campaign, deal discount pill, the Shortlist star, the "..." menu.
5. **"Details" button** at the end of the row: expands that one tile into the full Pro chips (commission $, est units, est revenue, BSR, video counts, coupon, Approved/Likely fit, Earned). Click again to collapse. Expansion state is per tile and survives re-renders.

Hidden in Simple (until "Details"): commission $, est units, est revenue, BSR, video counts, coupon, Approved/Likely fit, Earned.

Each signal chip opens the existing accessible popover (`ui/chip-tips.ts`) with the reason and the number, for example: "Pays well: about $2.40 per sale, in the top third of this page." Estimates are labeled "(estimated)" the same way Top pick reasons are.

## How each signal is decided (needs your approval, see Decisions)

All thresholds live in one pure module so they are easy to change and test.

**Pays** uses `row.commissionCents` (already includes the campaign rate when known):
- When at least 6 tiles on the page have a commission value: rank within the page. Top third is good, middle third neutral, bottom third low. Ties go to the higher band.
- Fewer than 6 values: absolute fallback. At least $2.00 per sale is good, $0.75 to $2.00 neutral, below $0.75 low.
- No commission value: unknown.

**Sells** uses `estUnitsFor(row)` (shared-catalogue figure when calibrated, else BSR estimate, else bought-past-month):
- Same relative rule over the page when at least 6 tiles have units. Fallback: 300 or more per month good, 50 to 300 neutral, below 50 low.
- Estimates (no calibrated catalogue figure) never show as "good" by absolute fallback alone; they cap at neutral and the tooltip says "(estimated)". This avoids overclaiming, the same rule `explainScore` follows.

**Campaign**:
- Good when `row.flags.cc || row.flags.spcc`. Tooltip includes `ccRate.ratePct`, brand and `endsAt` when known.
- Neutral "No campaign" only after the campaign lookups have settled; while `LOOKUP_CC_RATES` is in flight it shows "Checking..."; if it failed it shows "Campaign unknown" (reuses the lookup-failure state from the toolbar notice).
- Retailers without Creator Connections (`!caps.ccRates`, Walmart and Target) do not get the Campaign signal at all, so the row has two signals there.

## Setting and defaults

- New setting `settings.chipDetail: "simple" | "pro"` in `storage/schema.ts` (type, `DEFAULTS.settings`). **DEFAULTS is `"pro"`**, so every existing user keeps today's view through the existing settings shallow-merge in `migrate()`.
- Fresh installs get Simple: in `background/index.ts` `onInstalled` with `details.reason === "install"`, call `patchSettings({ chipDetail: "simple" })`. No install timestamp exists in the code today, so this is the clean way to separate new from existing without guessing.
- Where users change it: a "Simple / Detailed" toggle in the search toolbar (`aria-pressed`, persists via `patchSettings`), a checkbox in the popup Settings card (same pattern as `singleKeyShortcuts`), and a row in the options page (`options/index.ts` plus `options/strings.ts`).
- Changing it re-renders all badges in place (call `renderBadge` for every row), no page reload.

## Files

New:
- `tools/search-overlay/simple-signals.ts`: pure `simpleSignals(row, ctx)` returning `{ pays, sells, campaign }`, each `{ state, label, tip }`, plus `pageBands(rows)` to compute the page thresholds once per render pass.
- `tools/search-overlay/simple-signals.test.ts`: banding with 6 or more and fewer than 6 values, ties, unknown data, estimate cap, campaign lookup states, Walmart without campaign signal.

Changed:
- `tools/search-overlay/overlay.ts`: branch at the top of `renderBadge` on `settings.chipDetail`; compute page bands after each lookup or enrichment lands (same places that call `recompute` and `refreshTopPick`); per-tile `row.expanded`; `Details` button; re-render all rows on setting change.
- `tools/search-overlay/toolbar.ts`: Simple/Detailed toggle, `setChipDetail(value)` API.
- `tools/search-overlay/legend.ts`: Simple-view legend rows (what the three signals mean and how "well" is decided: "compared with the other products on this page").
- `tools/tour/index.ts`: the `search` tour step "Money signals on every result" gets a Simple-view variant in en, es and fr.
- `storage/schema.ts`, `background/index.ts`, `popup/index.ts` plus `static/popup.html`, `options/index.ts`, `options/strings.ts`.
- `ui/overlay.css`: `.tile-signal` with `data-state` styling (icon plus text, contrast at least 4.5:1, 12px text), `.tile-details-btn`.

Strings: en, es, fr for every label and tip, in the local-strings style used by `explain.ts` and `shortlist.ts` (not the big catalog). No em dashes.

## Accessibility

- State is conveyed by icon plus words, not color: good check mark, neutral dash, low down arrow, unknown question mark.
- Signal chips are focusable and open the popover (reusing `enableChipTips`, which already upgrades `.tile-chip[title]`).
- "Details" is a real `<button>` with `aria-expanded`.
- Text at least 12px; orange text uses `#c2410c` or darker, consistent with the site's WCAG AA commitment.

## Edge cases and risks

- **Few tiles on the page** (under 6 with data): handled by the absolute fallback; the popover says so ("not enough products on this page to compare, so this uses a fixed level").
- **Lookups landing late** change the bands and flip labels. Re-banding runs once per lookup completion, and a chip that flips should not shift layout (fixed-width chips, same height).
- **Infinite-scroll or re-init** tiles: bands are computed from the rows array at render time, so new rows are included on the next pass.
- **Messaging risk**: "Pays well" is relative to the page, not a guarantee. The tooltip says so, and Pro view still shows the dollar figure.
- **Existing users** see no change unless they flip the toggle. Release note for "What's new" mentions the toggle.
- **The earlier freeze** seen only under automation on image-heavy Amazon pages is unrelated, but the re-render-all path must not run per chip; it runs once per setting change.

## Tests and verification

- Unit tests as above, plus a test that `DEFAULTS.settings.chipDetail === "pro"` and a migrate test that an old settings object without the field resolves to `"pro"`.
- `npx tsc --noEmit`, `npx vitest run`, `npm run lint:dashes`, `npm run build`.
- Live (extension reloaded): on an Amazon search page, toggle Simple and Detailed, confirm each tile shows three signals plus the action chips, "Details" expands one tile, hover or focus a signal for its reason, reload and confirm the choice persists; check Walmart for two signals; check a page with few results for the fallback tooltip.
- Run the adversarial code-review workflow on the new files before committing, as for round 2 (the review found ten real bugs last time).

## Effort

About a day of work: the pure module and tests are small; the bulk is the `renderBadge` branch, the three settings surfaces, copy in three languages, and the live pass.

## Decisions needed from you

| Question | My recommendation |
|---|---|
| How is "pays well" decided? | Top third of the page's commission values, with a $2.00 per sale fallback when fewer than 6 tiles have data. |
| How is "sells well" decided? | Same relative rule on estimated units, with a 300 per month fallback; estimates never reach "good" on the fallback alone. |
| Who gets Simple by default? | New installs only; existing users stay on Pro until they flip the toggle. |
| Keep action chips (Owned, Posted, Messaged, Accept, deal %) in Simple? | Yes, they change what the creator does next. |
| Include the per-tile "Details" expander in the first version? | Yes; without it Simple hides information with no way back on that tile. |
| Wording of the labels ("Pays well", "Sells well", "Campaign open") | Fine as proposed, or tell me your house phrasing. |
