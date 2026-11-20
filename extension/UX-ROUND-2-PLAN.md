# Extension UX round 2: detailed plan (10 items)

Status: plan only, nothing built. Grounded in a read of `extension/src` on 2026-11-20. Items 1 to 10 match the numbering in the suggestion list.

## Cross-cutting rules (apply to every item)

- **Copy and locales:** every new string ships in en, es and fr. Use the local-strings pattern already in `popup/pause-strings.ts`, `popup/connection-status.ts` and `tools/search-overlay/legend.ts` (not the 5,400-line `i18n/catalog.ts`). No em dashes (`npm run lint:dashes`).
- **Storage:** new persisted state gets its own `chrome.storage.local` key with pure helper functions, like `ib-review-ask`, `ib-whatsnew` and the accept ledger. No `schema.ts` bump unless the value is a user setting (then add to `Settings` plus `DEFAULTS`, as `pausedHosts` did).
- **Accessibility:** new controls are real `<button>`/`<a>`, have visible focus (`:focus-visible`, same orange outline as `overlay.css`), text is at least 12px, and orange text uses `#c2410c` or darker. Respect `prefers-reduced-motion`.
- **Shadow DOM:** search-page UI lives in closed shadow roots built with `createInlineShadow` (`ui/host.ts`), so styles go in `ui/overlay.css` and events must be wired inside the root.
- **Verification for all:** `npx tsc --noEmit` (the existing `youtube-butler-settings.ts` errors are not ours), `npx vitest run`, `npm run lint:dashes`, `npm run build`, then load `extension/dist` unpacked and test on a real Amazon search page, plus popup states.
- **One commit per item** so any one can be reverted.

---

## 1. "Best for me" default sort with a one-line reason

**Current state.** `SortKey = "score" | "commission" | "revenue" | "price-asc" | "price-desc" | "relevance"` in `tools/search-overlay/toolbar.ts:15`. A per-tile score already exists (`recompute()` in `overlay.ts:854`, sorted at `overlay.ts:917`).

**Design.**
- Rename the `score` option to "Best for me" in the select and make it the default when the user has never chosen a sort (item 6 persists the choice afterwards).
- Show a small "Why is this first?" line under the toolbar for the top tile: the top two contributors, for example "Open campaign, 12% commission, sells about 800/mo". Source: the same inputs `recompute()` already uses. Expose a pure `explainScore(row): string[]` next to the scoring code so it is unit-testable.
- The top-ranked tile gets a subtle "Top pick" marker chip (counts toward the 7-chip cap, so it goes first).

**Files.** `search-overlay/toolbar.ts` (option label, reason line), `search-overlay/overlay.ts` (`explainScore`, default sort), `search-overlay/legend.ts` (strings).

**Edge cases.** Fewer than 3 scored tiles: hide the reason line. Estimates that are uncalibrated (`estimateCalibrated: false`) must say "estimated" in the reason.

**Tests.** `explainScore` unit tests for campaign-only, revenue-only, no-signal rows.

**Effort / risk.** Small. Risk: the reason text implies precision the estimate lacks, so keep "about" wording.

---

## 2. Shortlist tray

**Current state.** Per-tile actions live in a menu (`tile-menu.ts`): app actions (`APP_ACTIONS`: content, voiceover, collab, Link Butler), `GENERATE_AFFILIATE_LINK`, `ADD_TO_PRODUCT_LIST`, `OPEN_SOCIAL_COMPOSE`. The page already has a batch path: `deal.push.batch` (`overlay.ts` send-deals) and `GET_PRODUCT_LISTS` / `ADD_TO_PRODUCT_LIST`.

**Design.**
- New "Add to shortlist" checkbox button on each tile badge (a real `<button aria-pressed>`), kept in an in-memory `Set<asin>` per page, also mirrored to `sessionStorage` so SPA navigations keep it.
- A single bottom-fixed tray (own shadow host, mounted once, not per tile): "N selected" plus actions: **Add to list** (reuse the list picker from `tile-menu.ts`), **Send to Deals Butler** (reuse the `deal.push.batch` call), **Copy links** (loop `GENERATE_AFFILIATE_LINK`, capped at 10 like `ACCEPT_ALL_CAP`), **Clear**.
- Keyboard: Space toggles on a focused tile button, Esc clears the tray focus, tray is a `role="region"` with `aria-live="polite"` count.

**Files.** New `search-overlay/shortlist.ts` (state plus tray), `search-overlay/overlay.ts` (mount button in `renderBadge`), `search-overlay/tile-menu.ts` (extract the list picker into a function both use), `ui/overlay.css`.

**Edge cases.** Tiles removed by infinite scroll or re-render: keep the ASIN in the set, show it in the tray count only. Signed-out or unpaired: disable the app actions with the existing upsell text (`hud.signedIn`, `hud.connected`).

**Tests.** Pure set logic (add, remove, cap), and the batch-builder that turns rows into `ProductRef[]`.

**Effort / risk.** Medium. Risk: overlap with the 7-chip row; the toggle is a corner control, not a chip.

---

## 3. Bulk accept review sheet

**Current state.** `acceptAllOnPage` (`overlay.ts:684`) uses `window.confirm(t().acceptAllConfirm(n))` and loops `acceptRow` for up to `ACCEPT_ALL_CAP = 10`. Rows carry `ccRate` (`ratePct`, `brand`, `endsAt`, `campaignId`) from `CcRate` (`shared/messages.ts:1080`). Accepts are irreversible from our side; the existing background ledger (`ACCEPT_LEDGER_KEY` in `background/campaign-accept.ts`) records them.

**Design.**
- Replace `confirm()` with an in-page modal (reuse `ui/modal.ts`) listing each candidate: product title, brand, commission %, estimated monthly revenue if known, campaign end date. Each row has a checkbox (default checked). Footer: "Accept N campaigns" and "Cancel". Text states "This cannot be undone from here."
- Modal is focus-trapped, labelled, closes on Esc, returns focus to the toolbar button.
- Progress: after confirm, the same sheet turns into a live list (Waiting, Working, Accepted, Failed with reason and a per-row Retry), instead of only the toolbar status text. Failed rows reuse `describeAcceptResult`.
- Sort rows by score so the best campaigns are first.

**Files.** New `search-overlay/accept-sheet.ts`; `overlay.ts` (`acceptAllOnPage` builds the model and drives row state); `legend.ts` strings; `ui/overlay.css`.

**Edge cases.** All unchecked: disable the primary button. Page changes mid-run: keep processing the snapshot already confirmed. Robot-check cooldown from the worker queue: show "Paused, will resume" per existing behavior.

**Tests.** Pure model builder (candidates to sheet rows, ordering, cap), and state transitions per row.

**Effort / risk.** Medium. Highest-trust item, so ship with extra manual testing on a real account; never auto-check beyond the cap.

---

## 4. Simple view vs Pro view

**Current state.** `tile-menu`/`renderBadge` (`overlay.ts` ~1090-1200) emit up to a dozen chips; `legend.ts` already explains each chip; `capChips` folds to 7.

**Design.**
- New setting `settings.chipDetail: "simple" | "pro"` (default `"simple"` for installs younger than 14 days or with no prior choice, else `"pro"` so existing users see no change).
- In Simple, render exactly three signal chips computed from existing row data, each with a plain label and one of three states (good, caution, none):
  - **Pays well**: from commission % or CC rate versus thresholds (reuse the thresholds the score uses).
  - **Sells well**: from `estUnitsFor(row)` / `boughtPastMonth`.
  - **Campaign open**: from `row.flags.cc || row.flags.spcc` and `ccRate`.
  Each chip uses icon plus text plus color (not color alone) and opens the item 1/popover explanation.
- A toolbar toggle "Simple / Detailed" flips and persists; options page gets the same setting. Pro view is today's behavior unchanged.

**Files.** `storage/schema.ts` (setting plus default), new `search-overlay/simple-signals.ts` (pure `simpleSignals(row)`), `overlay.ts` (branch in `renderBadge`), `toolbar.ts` (toggle), `options/index.ts` plus `options/strings.ts`, `legend.ts`.

**Edge cases.** The existing tour and legend describe chips; add Simple-view lines. Walmart/Target rows lack some data: show "No data" state, not a missing chip.

**Tests.** `simpleSignals` with threshold boundaries and null data.

**Effort / risk.** Medium. Risk: thresholds are product decisions. **Decision needed from you:** what counts as "pays well" (suggest: top third of this page's commission values, not a fixed %).

---

## 5. Freshness and source on data

**Current state.** `MarketProduct.capturedAt` exists (`shared/messages.ts:1171`) and `estimateCalibrated`. `CcRate.endsAt` exists. Chips already have tips via `tipped()` and now popovers (`ui/chip-tips.ts`).

**Design.**
- Pure `formatAge(iso, now, locale)` helper ("2h ago", "3d ago", "over 7d ago").
- Extend existing chip tips for estimate chips (units, revenue, BSR) with a second line: "Source: shared catalogue, updated 2h ago" or "Source: estimated from this page's rank". Chip text gets a "~" when estimate-based (already done for video chips; extend).
- Toolbar shows one "Data updated 2h ago" label for the newest `capturedAt` among the page's rows, with a tooltip explaining sources. Stale (older than 7 days): amber text plus words, not just color.
- No new network calls.

**Files.** New `shared/format-age.ts` (+ test), `overlay.ts` (tip text composition at the est units/revenue/BSR chips), `toolbar.ts` (label), `legend.ts`.

**Edge cases.** Missing `capturedAt`: omit the age part. Locale-aware relative time via `Intl.RelativeTimeFormat` with a manual fallback.

**Tests.** `formatAge` boundaries (minutes, hours, days, future timestamps).

**Effort / risk.** Small. No real risk.

---

## 6. Remember filters and sort per page type

**Current state.** Toolbar state (`FilterState { campaignOnly, minPriceCents }`, sort, hide-badges) lives only in the page session (`badgesHidden` is a module variable, comment says "per page, not persisted").

**Design.**
- New storage key `ib-view-prefs`: `{ [pageType]: { sort, campaignOnly, minPriceCents, badgesHidden } }`, where `pageType` comes from `detectPageType` (search, deals, storefront). Pure `loadPrefs/savePrefs/resetPrefs` helpers.
- `renderToolbar` takes initial state from prefs; each control change saves (debounced 300ms).
- A "Reset view" link appears only when any pref differs from defaults.
- Do not persist the shortlist (item 2) or one-off statuses.

**Files.** New `shared/view-prefs.ts` (+ test), `toolbar.ts` (initial values, save hooks, reset), `overlay.ts` (pass prefs in).

**Edge cases.** Corrupt JSON: fall back to defaults silently. Per-marketplace differences (currency): store `minPriceCents` with the currency and ignore it if it differs.

**Tests.** Round trip, corrupt data, reset, currency mismatch.

**Effort / risk.** Small. Ship early because it improves item 1's default behavior.

---

## 7. Keyboard shortcuts

**Current state.** Manifest has no `commands`. Several tools attach their own `keydown` handlers (`chat-bubble`, `idea-list`, `cc-messages`), so conflicts are possible.

**Design.**
- Two layers:
  1. **Manifest `commands`** (browser-level, rebindable at `chrome://extensions/shortcuts`): "Toggle overlays on this page" and "Open Influencer Butler panel". Background listens via `chrome.commands.onCommand` and messages the active tab.
  2. **In-page keys** (only when focus is not in an input, textarea, select or contenteditable, and no modifier is held): `j`/`k` move between tiles, `s` toggles shortlist on the focused tile (item 2), `?` opens a cheat sheet. Registered once from `content/index.ts`, torn down with the existing teardown path.
- Cheat sheet is a small modal (reuse `ui/modal.ts`) and the keys are listed on the options page, with an "Enable single-key shortcuts" setting (default on; off for users who rely on page shortcuts).
- Tile focus outline reuses the orange `:focus-visible` style.

**Files.** `static/manifest.json` (`commands`), `background/index.ts` (listener), new `content/shortcuts.ts` (handler plus guard), `ui/modal.ts` use, `storage/schema.ts` (`singleKeyShortcuts`), `options/*`.

**Edge cases.** Do not intercept keys Amazon uses (Amazon has few; the input guard covers search boxes). Rebinding is done by Chrome, so no custom UI needed.

**Tests.** Pure `shouldHandleKey(event, activeElement)` guard tests.

**Effort / risk.** Medium. Risk: collisions on other sites, so scope to supported retailers only. Depends on item 2 for `s`.

---

## 8. "What happened while you were away" activity view

**Current state.** Data already exists in pieces: the accept ledger (`ACCEPT_LEDGER_KEY`, `background/campaign-accept.ts` `recordAccept`), the "Desktop app activity" log (`ib-desktop-activity`, `background/desktop-activity.ts`, shown only in Settings), `ib-breakage` for tool errors, and the findings sync queue (`queueDepth`).

**Design.**
- A read-only "Activity" group in the popup's Tools group (the folding added in round 1) with a 24-hour/7-day toggle.
- Pure aggregator `summarizeActivity({ acceptLedger, desktopActivity, breakage, now, windowMs })` returning counts (campaigns accepted manual vs auto, items sent to the app, failures) and a short timeline of the latest 10 events.
- Each event row: icon plus text, time, and for failures a "Retry"/"Report" link (Report reuses the `ib-open-report` event from round 1).
- Empty state explains what will appear here and links to the guided tour.
- Privacy: nothing leaves the browser, data is only read from existing local keys.

**Files.** New `shared/activity-summary.ts` (+ test), new `popup/activity.ts` (render), `popup/index.ts` (add card and register in `GROUPS`), `popup.html`, `popup.css`.

**Edge cases.** Very large ledgers: cap reads. Entries lacking timestamps are skipped. Auto vs manual distinction depends on the ledger `source` field; verify its values before building.

**Tests.** Aggregator across windows, missing fields, ordering.

**Effort / risk.** Medium. Mostly read-side work. **Open question:** confirm the ledger stores enough detail (brand, time, source); if not, add fields at record time (small, non-breaking).

---

## 9. Contextual upgrade moments

**Current state.** The extension knows `planLevel: "beginner" | "power" | "legacy"` (`AuthStatus`, `background/plan.ts`) and shows a static "Free" tag and a popup upgrade line for beginners only. Tools are gated by `settings.tools` flags, not by plan, so which features are paid is not encoded in the extension today.

**Design.**
- Central `shared/feature-access.ts`: a table `{ featureId: requiredPlan }` and `canUse(featureId, planLevel)`. Initially only features the pricing page already says are paid; start empty and add per decision.
- New `ui/upgrade-hint.ts`: a small inline hint (`role="note"`) rendered where a locked control would sit: one sentence, one link ("See Power User"), a dismiss button. Dismissal stored per feature in `ib-upgrade-hints` with a timestamp; never reshown for 30 days; never blocks the free workflow.
- Max one hint visible per page, and none during first 3 active days (reuse `activeDays` from the review-ask state).
- Links go through the existing trial/upgrade URL helpers (`APP_TRIAL_URL` is used in `tile-menu.ts`) with a `utm_source=extension&utm_content=<featureId>` tag.

**Files.** New `shared/feature-access.ts` (+ test), `ui/upgrade-hint.ts`, call sites in `tile-menu.ts` (already has an upsell path for unpaired/signed-out) and `overlay.ts`.

**Edge cases.** Offline or unknown plan: assume allowed (never lock on failure). Legacy plan counts as full access.

**Decision needed from you (blocking):** exactly which extension features are Pro-only today. I did not infer this from the code, so the table stays empty until you list them. Also confirm the hint wording passes your marketing rules (no competitor names).

**Tests.** `canUse` matrix, dismissal expiry, first-days suppression.

**Effort / risk.** Small to medium once the feature list is decided. Risk: annoying users, hence strict caps.

---

## 10. First-success moments and next-step nudges

**Current state.** Patterns to copy: `background/review-ask.ts` (pure state over `ib-review-ask`), `background/whats-new.ts`, the one-time `tools/tour` offer, and the popup cards.

**Design.**
- New storage key `ib-milestones`: `{ firstAccept, firstDealSent, firstListSave, firstShortlist, shownAt: {...} }`. Pure `recordMilestone(state, id, now)` returns `{ state, celebrate: boolean }` so only the first occurrence celebrates.
- Celebration surface: the existing `showToast` (`ui/toast.ts`), with a title, one specific sentence and one next-step button:
  - First accepted campaign: "First campaign accepted. Next: open Deals Butler to post it."
  - First deal sent to the app: "Sent. It will appear in Deals Butler."
  - First list saved: "Saved. Open your lists to share it."
- Trigger points: successful `acceptRow` (`overlay.ts:1027`), the deal batch success, `ADD_TO_PRODUCT_LIST` success. Each calls `recordMilestone` and toasts only when `celebrate` is true.
- Respect reduced motion; toast is dismissible and auto-hides after 8s (existing default); never more than one milestone toast per session.
- Also feeds a "Getting started" checklist in the popup (3 to 4 items, check marks) that hides after all are done or dismissed.

**Files.** New `shared/milestones.ts` (+ test), `ui/toast.ts` (add optional action button if missing), call sites above, `popup/index.ts` (checklist card), locale strings.

**Edge cases.** Existing users who already did these things: seed milestones as done on first run if the accept ledger or activity log already has entries, so they do not get "first" toasts.

**Tests.** `recordMilestone` idempotence and seeding.

**Effort / risk.** Small to medium. Risk: tone; keep it brief and factual.

---

## Suggested build order

1. **6** (view prefs), **5** (freshness), **1** (Best for me): small, low risk, improve daily use. 1 reads prefs from 6.
2. **3** (accept sheet) and **8** (activity view): trust in the riskiest actions.
3. **2** (shortlist), then **7** (shortcuts, depends on 2's `s` key).
4. **4** (Simple view) after the thresholds decision.
5. **10** (milestones), then **9** (upgrade hints) once the Pro feature list is decided.

## Decisions needed before building

| # | Item | Question |
|---|------|----------|
| 4 | Simple view | What counts as "pays well" (suggest top third of the page's commissions)? Default to Simple for new installs only? |
| 9 | Upgrade hints | Which extension features are Pro-only today? Wording approval. |
| 8 | Activity | OK to add fields to the accept ledger record if it lacks time, brand or source? |
| 7 | Shortcuts | OK to default single-key shortcuts on, with an off switch in options? |
| 2 | Shortlist | Cap on copy-links and send actions (suggest 10, matching accept-all)? |
