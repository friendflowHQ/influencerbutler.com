# Extension local bridge (desktop app spec)

Spec for the Influencer Butler desktop app (separate repo) to receive findings
from the Chrome extension in real time, so things the user spots while
browsing Amazon surface as HUD action items without a round trip through the
website. The extension side is already built and abstracted: implementing
this spec and flipping `local-transport.ts` from stub to live is the only
extension change needed (`extension/src/transport/local-transport.ts`).

The website API channel (`/api/extension/*`) stays as-is; the bridge is an
additional, independent channel. The extension prefers the bridge when it is
available and falls back to the API.

## Transport

- WebSocket server on `ws://127.0.0.1:48620/butler`, bound to loopback only.
- Started by the desktop app when it launches; stopped on quit. If the port
  is taken, try 48621 and 48622 (the extension probes all three).
- The desktop app MUST validate the `Origin` header of the WebSocket upgrade:
  accept only `chrome-extension://<our published extension id>` and reject
  everything else. This is the primary defense against random web pages or
  other local processes speaking to the bridge.

## Pairing handshake

The extension cannot read files on disk, so pairing uses a short code shown
in the HUD:

1. Extension connects and sends `{ "type": "hello", "clientId": "<random stable id>" }`.
2. Desktop shows a one-time 6-digit pairing code in the HUD ("Chrome
   extension wants to connect").
3. The user types the code into the extension popup; extension sends
   `{ "type": "pair", "code": "123456", "clientId": "<same id>" }`.
4. Desktop replies `{ "type": "paired", "token": "<32-byte hex>" }` and
   persists (clientId, token). Extension stores the token in
   `chrome.storage.local`.
5. On reconnect the extension sends `{ "type": "auth", "token": "<hex>" }`
   and the desktop replies `{ "type": "authed" }` or closes the socket.

Codes expire after 2 minutes; 5 wrong codes close the socket. Unpairing from
either side deletes the token.

## Message envelope

Every frame after auth:

```json
{ "type": "<kind>", "id": "<uuid>", "ts": "<ISO 8601>", "v": 1, "payload": { } }
```

The desktop acks each frame with `{ "type": "ack", "id": "<same uuid>" }`.
The extension retries unacked frames with backoff and dedupes by `id`, so
handling MUST be idempotent.

## Payload types

Field names mirror the `/api/extension/*` REST payloads exactly (the
extension serializes once; see `src/app/api/extension/` in the website repo
for validation rules).

### `scan.upsert`

```json
{
  "asin": "B0EXAMPLE1",
  "marketplace": "amazon.com",
  "title": "Example product",
  "price_cents": 3999,
  "currency": "USD",
  "brand_video_count": 2,
  "influencer_video_count": 1,
  "customer_video_count": 3,
  "approved": true,
  "approved_criteria": { "activelySelling": true, "openSlot": true, "inStock": true, "priceFloor": true },
  "scanned_at": "2026-07-04T16:00:00.000Z"
}
```

### `gap.found`

```json
{
  "asin": "B0EXAMPLE2",
  "marketplace": "amazon.com",
  "title": "Product the user already owns",
  "gap_type": "no_influencer_video",
  "influencer_video_count": 0,
  "order_date": null,
  "detected_at": "2026-07-04T16:00:00.000Z"
}
```

`gap_type` is `no_influencer_video` or `low_influencer_video`.

### `storefront.issue`

```json
{
  "storefront_url": "https://www.amazon.com/shop/handle",
  "issue_type": "untagged",
  "severity": "error",
  "subject": "Video title or id",
  "detail": "Video has no tagged products, so it cannot earn commissions.",
  "detected_at": "2026-07-04T16:00:00.000Z"
}
```

`issue_type` is `untagged`, `over_tagged`, or `unavailable_product`;
`severity` is `info`, `warn`, or `error`.

## Action Queue integration

This is the HUD payoff. Suggested mapping into the existing Action Queue:

- `gap.found` -> action item "Film a video for <title>" with CTA
  `record_video`, deep link to the product page, and the influencer video
  count as context. Dedupe on (asin, gap_type); clear automatically if a
  later `scan.upsert` for that ASIN shows the user's video present.
- `scan.upsert` with `"approved": true` -> action item "Butler Approved
  product spotted: <title>" with CTA `review`, showing the criteria
  breakdown. Dedupe on asin per day.
- `storefront.issue` -> action item per issue with CTA `fix_listing`.
  A new storefront snapshot replaces previous storefront items (the checkup
  is a snapshot, not a log), matching the REST replace-on-scan semantics.

## Commands (extension to app)

Findings above flow extension -> app as fire-and-forget sync. Commands are the
other direction of intent: the user clicks a button in the product panel to
make the running app DO something now. This is the extension-to-subscription
funnel, so it must feel instant and reliable.

The extension side is built (`extension/src/background/hud-bridge.ts`,
`extension/src/transport/hud-commands.ts`). It talks to the bridge from the
background service worker, because an https Amazon page cannot open
`ws://127.0.0.1` (mixed content) but the extension background can.

### Status probe (lightweight, no pairing required)

Before showing command buttons, the extension probes:

1. Extension connects and sends `{ "type": "hello", "client": "extension" }`.
2. The app replies with a status frame:

```json
{
  "type": "status",
  "appVersion": "1.0.41",
  "dealWorkspaces": [
    { "key": "default", "label": "Deals Influencer Butler (main)" },
    { "key": "garden-bargains", "label": "Garden Bargains" }
  ],
  "ideaLists": [
    { "listId": "amzn1.ideas.ZY4SIJ6VID6", "title": "Garden Picks" }
  ]
}
```

`dealWorkspaces` is the app's real workspace list (including the user's own
niche clones); the extension falls back to a static hint list if absent.
`ideaLists` is the set of Amazon Idea Lists the app's Idea List Butler knows
about (from its storefront discovery pass and its own publishes, capped at 50);
the extension's "Add to Idea List" menu offers them as targets and degrades to
"New list" only when the field is absent (older app builds). If
the app requires pairing (the handshake above), it MAY instead reply
`{ "type": "needs-pairing" }` and the extension will prompt the user for the
code. The `Origin` check (`chrome-extension://<id>`) is the security boundary
for loopback; pairing is optional hardening.

### Command frames

The extension sends `{ "type": "command", "command": <Command> }` and expects
`{ "type": "command.result", "ok": true|false, "message": "<short line>" }`.
The `message` is shown verbatim in the panel ("Added to Garden Bargains",
"No Creator Connections campaign for this ASIN", etc.). Commands:

**`deal.push`** - drop the product into a Daily Deals workspace with that
workspace's existing Build-Your-Post template and social destinations, exactly
as if the user added it there by hand.

```json
{
  "type": "deal.push",
  "workspace": "garden-bargains",
  "product": {
    "asin": "B0016HF5GK", "marketplace": "amazon.com",
    "title": "BISSELL Little Green ...", "priceCents": 9999, "currency": "USD",
    "imageUrl": "https://m.media-amazon.com/images/I/...jpg",
    "commissionRatePct": 3
  }
}
```

**`deal.push.batch`** - same as `deal.push`, but many products into one
workspace at once, from the Deal Sites Harvester. The extension chunks large
harvests (200 products per command); the app accepts a batch and returns one
result ("Added N of M deal(s) to Deals Influencer Butler."). Desktop apps
newer than 1.0.51 implement it; when an older app answers "Unknown command",
the extension falls back to N sequential `deal.push` calls for the rest of
the run.

```json
{
  "type": "deal.push.batch",
  "workspace": "garden-bargains",
  "products": [
    { "asin": "B0016HF5GK", "marketplace": "amazon.com", "title": "...", "priceCents": 9999, "currency": "USD" }
  ]
}
```

**`content.push`** - queue the product into Content Butler for a post.
Same `product` shape.

**`campaign.accept`** - accept the product's Creator Connections (`"kind":
"cc"`) or Sponsored Products (`"kind": "spcc"`) campaign. The APP looks the
ASIN up in its own local CC/SPCC catalogue (the extension does not need the
catalogue for this), accepts if found, and returns a result message. If none
exists, return `{ "ok": false, "message": "No CC campaign for this product." }`.

```json
{ "type": "campaign.accept", "kind": "cc", "product": { "asin": "...", "marketplace": "amazon.com" } }
```

**`collaboration.add`** - add the product to the app's Collab Butler so the
creator can track an outreach / brand collaboration for it. Same `product`
shape.

```json
{ "type": "collaboration.add", "product": { "asin": "...", "marketplace": "amazon.com" } }
```

**`idealist.push`** - queue the product in the desktop Idea List Butler for an
Amazon Idea List. `target` names either an existing list by its durable
`listId` (offered from the status frame's `ideaLists`) or a new list by
`newListTitle`; exactly one of the two should be set. Pure data write and
idempotent per (asin, marketplace, target): a repeat push refreshes the queued
row instead of duplicating it. The butler publishes the queue on its schedule
(or the user's "Publish queue now"); note Amazon requires at least 2 products
before a NEW list can be created, so a lone product queued for a new list is
held (visible in the app's panel) until a second one arrives.

```json
{
  "type": "idealist.push",
  "product": { "asin": "B0016HF5GK", "marketplace": "amazon.com", "title": "..." },
  "target": { "listId": "amzn1.ideas.ZY4SIJ6VID6" }
}
```

```json
{ "type": "idealist.push", "product": { "asin": "..." , "marketplace": "amazon.com" }, "target": { "newListTitle": "Garden Picks" } }
```

**`idealist.push.batch`** - batch form: many products, each with its own
`target`, in one frame. Returns one result with `added`, `total`, `skipped`
counts ("Queued N of M product(s) for Idea List Butler.").

```json
{
  "type": "idealist.push.batch",
  "items": [
    { "product": { "asin": "...", "marketplace": "amazon.com" }, "target": { "newListTitle": "Garden Picks" } }
  ]
}
```

### When the app is not running

Every probe/command fails fast (short timeout). The extension then shows an
upsell instead of the buttons: signed-in users get "open or install the app",
anonymous users get "start your free trial", both linking to
`/go/download`. That is the intended conversion path, so the failure mode is a
feature, not an error.

## Earnings lookup (app to extension, read-only)

The extension asks the running app what the creator actually earned on a batch
of ASINs, so product pages, search tiles, and the storefront/Curations grid can
show real earnings against each product. This is authed with the pairing token
(it returns private earnings) and is read-only. The extension side is built
(`lookupEarnings` in `extension/src/background/hud-bridge.ts`); the app
implements the responder against its Daily Commission Butler ledger.

The extension sends:

```json
{ "type": "earnings.lookup", "payload": { "asins": ["B0CSG3YWR6", "B0EXAMPLE1"] } }
```

The app replies with one `AsinEarnings` per ASIN it has data for (omit ASINs
with no earnings, or return them with `"hasEarnings": false`):

```json
{
  "type": "earnings.result",
  "ok": true,
  "results": [
    {
      "asin": "B0CSG3YWR6",
      "hasEarnings": true,
      "byCurrency": [{ "currency": "USD", "amount": 139.40, "count": 24 }],
      "totalCount": 24,
      "byStore": [
        { "trackingId": "onamzdavi039-20", "placement": "onsite",  "marketplace": "amazon.com", "currency": "USD", "amount": 127.35, "units": 96, "orders": 18 },
        { "trackingId": "davi039-20",      "placement": "offsite", "marketplace": "amazon.com", "currency": "USD", "amount": 12.05,  "units": 6,  "orders": 6 }
      ],
      "byYear": [
        { "year": 2026, "currency": "USD", "amount": 75.00, "units": 30, "orders": 18 },
        { "year": 2025, "currency": "USD", "amount": 23.20, "units": 26, "orders": 0 },
        { "year": 2024, "currency": "USD", "amount": 41.20, "units": 46, "orders": 0 }
      ],
      "byMonth": [
        { "month": "2026-07", "currency": "USD", "amount": 12.00 }
      ],
      "campaigns": [
        { "name": "Solar Independence", "ratePct": 10, "clicks": 98, "orders": 18, "currency": "USD", "amount": 43.80 }
      ]
    }
  ]
}
```

Contract notes:

- `byCurrency` and `totalCount` are REQUIRED and are the flat totals older
  builds already sent. Amounts are in whole currency units (not cents).
- `byStore`, `byYear`, `byMonth`, and `campaigns` are OPTIONAL. Fill them so the
  extension can render the store / year / month / Creator Connections breakdown
  and scope a storefront's badge to that marketplace. When absent, the extension
  degrades gracefully to the flat total (a single "$X from N orders" chip).
- `byStore.placement` is `onsite` (on-Amazon storefront/video sales) or
  `offsite` (links shared elsewhere). `marketplace` lets the extension scope
  earnings to the storefront the creator is viewing, so a German storefront does
  not show worldwide-by-ASIN totals.
- The gating work is on the app side: these buckets require the ledger to hold
  Associates report granularity (tracking-id, placement, marketplace, date,
  units, orders, and Creator Connections campaign rows). Until it does, return
  only `byCurrency`/`totalCount` and the extension shows flat totals.
- If the app was never paired the extension does not send this at all; a
  rejected token yields `{ "type": "auth.error" }` and the extension stays
  silent (no error surfaced to the user).

## Outreach keywords (app to extension, read-only)

The extension asks the running app which brands the creator messaged with the
"Message Brands" tool (Amazon Butler outreach) and the search keyword that
surfaced each one, so the Creator Connections Messages widget can badge every
conversation with its keyword. Authed with the pairing token (it returns the
creator's private outreach ledger) and read-only. The extension side is built
(`fetchOutreachKeywords` in `extension/src/background/hud-bridge.ts`); the app
implements the responder against its durable sent-records ledger
(`sent_records.jsonl`, via `scripts/runtime/exporter.js` `readRecords()`).

The extension sends (no payload fields; the app returns the whole ledger,
collapsed per brand):

```json
{ "type": "outreach.lookup", "payload": {} }
```

The app replies with one record per brand it has messaged, keeping the most
recent keyword and the full keyword history:

```json
{
  "type": "outreach.result",
  "ok": true,
  "records": [
    {
      "brand": "MARCHWAY",
      "brandKey": "marchway",
      "keyword": "phone case",
      "keywords": ["phone case", "camping gear"],
      "lastSentAt": 1756056300000
    }
  ]
}
```

Contract notes:

- Only `result === "sent"` rows with both a brand and a keyword are included.
- `brandKey` is the app's lowercased brand name; the extension re-normalizes the
  `brand` field itself before matching against the Amazon conversation name, so
  exact parity between `brandKey` and the extension's key is not required.
- `keyword` is the most recently used keyword (max `lastSentAt`); `keywords`
  lists every distinct keyword the brand was messaged under, newest-first, for
  the chip's hover tooltip.
- `lastSentAt` is epoch milliseconds.
- If the app was never paired the extension does not send this at all; a
  rejected token yields `{ "type": "auth.error" }` and the extension stays
  silent (no chips shown).

## Versioning

`v` in the envelope starts at 1. The desktop MUST ignore unknown `type`
values and unknown payload fields rather than erroring, so the extension can
ship additive changes without lockstep releases.
