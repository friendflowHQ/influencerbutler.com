# Extension local bridge (desktop app spec)

Spec for the Influencer Butler desktop app (separate repo) to receive findings
from the Chrome extension in real time, so things the user spots while
browsing Amazon surface as HUD action items without a round trip through the
website. Both sides are shipped and live: the extension transport is
`extension/src/transport/local-transport.ts` plus
`extension/src/background/hud-bridge.ts`, and the desktop server is
`app/extension-bridge/ws-server.js` in the desktop repo. This doc describes
the protocol as implemented.

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
in the HUD. It is two round trips driven from the extension popup, each on
its own short-lived socket:

1. The user clicks Connect in the popup; the extension sends
   `{ "type": "pair.request", "clientId": "<random stable id>" }`.
2. Desktop generates a one-time 6-digit code, keyed to that clientId, shows
   it in the HUD, and replies `{ "type": "pair.pending", "expiresInMs": 120000 }`.
3. The user types the code into the popup; the extension sends
   `{ "type": "pair", "clientId": "<same id>", "code": "123456" }`
   (an optional `label` names the pairing).
4. Desktop replies `{ "type": "paired", "token": "<32-byte hex>" }` and
   persists (clientId, token) in its pairing store. Extension stores the
   token in `chrome.storage.local`.
5. On a wrong code, missing pairing request, or too many attempts, desktop
   replies `{ "type": "pair.error", "message": "<short line>" }` instead
   (`attemptsLeft` is included on wrong-code errors). The socket stays open;
   the message is shown verbatim in the popup.
6. On reconnect the extension sends `{ "type": "auth", "token": "<hex>" }`
   and the desktop replies `{ "type": "authed" }` or
   `{ "type": "auth.error", "message": "Not paired." }`.

Codes expire after 2 minutes; after 5 wrong attempts the pending code is
burned and the user must click Connect to start over. Unpairing from either
side deletes the token.

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
  ],
  "creatorMode": "both",
  "paired": false
}
```

`dealWorkspaces` is the app's real workspace list (including the user's own
niche clones); the extension falls back to a static hint list if absent.
`ideaLists` is the set of Amazon Idea Lists the app's Idea List Butler knows
about (from its storefront discovery pass and its own publishes, capped at 50);
the extension's "Add to Idea List" menu offers them as targets and degrades to
"New list" only when the field is absent (older app builds).
`creatorMode` is the channel the user declared in the desktop app
(`"onsite"`, `"offsite"`, or `"both"`); `paired` reports whether the socket's
clientId (if any) already holds a token.

The probe is unauthenticated by design: it drives the install/upsell funnel
and leaks nothing. There is no separate `needs-pairing` frame; instead, a
command sent without auth gets its normal result frame with
`"ok": false, "needsPairing": true` (e.g.
`{ "type": "command.result", "ok": false, "needsPairing": true, "message": "Connect the extension to the app first." }`)
and the extension then prompts the user to pair. The `Origin` check
(`chrome-extension://<id>`) plus loopback binding is the transport security
boundary; pairing gates every command on top of it.

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

## Brand enrichment (app to extension, read-only)

The inbound counterpart to the outreach lookup. Outreach keywords only cover
brands the creator outbound-messaged; most Creator Connections inbox
conversations are *inbound* opportunities the creator never pitched. For those,
the extension asks the app to resolve a batch of brand names (read from the
Messages inbox) against the GLOBAL CC brand index, so the widget can still badge
the conversation with a commission-rate / cadence chip. Authed with the pairing
token and read-only. The extension side is built (`fetchBrandEnrichment` in
`extension/src/background/hud-bridge.ts`); the app implements the responder
(`createBrandEnrichmentHandler`) over `brandIndex.getBrandRecord` (rate, slots,
window) plus `brandCampaignHistory.deriveRenewalSignal` (cadence, verdict) when
any local history exists.

The extension sends the display names it read from the inbox:

```json
{ "type": "brand.enrichment", "payload": { "brands": ["LUCKFOX", "OCOOPA"] } }
```

The app replies with one record per brand the global index knows (unknown brands
are simply absent):

```json
{
  "type": "brand.enrichment.result",
  "ok": true,
  "records": [
    {
      "brand": "LUCKFOX",
      "bestRatePct": 12,
      "slotsOpen": 3,
      "cadence": "renews",
      "verdict": "strong",
      "distinctCampaigns": 4,
      "latestEndsInDays": 6
    }
  ]
}
```

Contract notes:

- `brand` echoes the queried display name, so the extension joins on the same
  normalized key without depending on the app's own casing.
- Every numeric field is nullable: the app returns what the index knows and null
  for the rest. A record with neither a positive `bestRatePct` nor a `cadence`
  carries no chip, so the app omits it.
- `cadence` is `"renews" | "occasional" | "one-shot"` (or null when unknown);
  `verdict` is `"strong" | "worth-considering" | "risky"` (or null). Both come
  from the local renewal signal and are null for a cold inbound brand, which then
  shows the rate alone.
- `latestEndsInDays` is a day count (may be negative if a window just closed).
- The batch is deduped and capped (100 brands) on the app side.
- If the app was never paired the extension does not send this at all; a rejected
  token yields `{ "type": "auth.error" }` and the extension stays silent.

## Message templates (app to extension, read-only)

Feeds the extension's Message Templates picker on the Creator Connections
composer, so the creator's desktop-authored templates appear next to their
extension-local ones and share one library. Authed with the pairing token (the
templates are the creator's private copy) and read-only. The extension side is
built (`fetchMessageTemplates` in `extension/src/background/hud-bridge.ts`); the
app implements the responder (`createTemplatesHandler`) over the `amazonbutler`
workspace's `messageTemplates` plus the shared `resolveTemplateText` for values.

The extension sends (no payload fields; the app returns the whole store):

```json
{ "type": "templates.lookup", "payload": {} }
```

The app replies with the templates trimmed to what the picker needs, plus a map
of resolved placeholder values from the same workspace:

```json
{
  "type": "templates.result",
  "ok": true,
  "templates": [
    { "id": "default", "label": "Default Message", "variations": ["Hi {brandName}!"] }
  ],
  "values": { "storefrontUrl": "amazon.com/shop/me", "address": "123 Main St" }
}
```

Contract notes:

- `variations` is the template's list of message texts; the extension inserts the
  first non-empty one. Templates with no label or no usable variation are omitted.
- `values` carries only the creator-profile tokens the app can resolve without a
  thread/campaign context (`storefrontUrl`, `mediakit`, `address`,
  `instagramHandle`, and the About Me apparel tokens `HEIGHT`/`TOPSIZE`/...), and
  only the non-empty ones. The extension fills `{brandName}` itself from the open
  thread, substitutes everything in `values`, then strips any token left over so
  no raw `{braces}` reach the message.
- If the app was never paired the extension does not send this at all; a rejected
  token yields `{ "type": "auth.error" }` and the extension stays silent (local
  templates only).

### Save a template to the app (extension to app, write)

The "Also save to desktop app" option in the extension's Save form pushes a
template the creator saved in the browser up to the app, so it appears in the
in-app template manager too. Rides the normal `command` frame (authed). The app
upserts it into the target workspace's `messageTemplates` by label (idempotent:
re-saving the same name updates rather than duplicates) via the same
`saveSettingsFromHUD` path the in-app manager uses.

```json
{
  "type": "command",
  "command": {
    "type": "template.save",
    "workspace": "amazonbutler",
    "template": { "label": "Intro", "body": "Hi {brandName}!" }
  }
}
```

The app replies with the standard `command.result` (`{ "ok": true, "message":
"Saved to the desktop app." }`). `workspace` defaults to `amazonbutler` (the
Amazon Creator Connections outreach templates) when omitted; a blank label or
empty body is rejected before any write.

## Ownership lookup (app to extension, read-only)

The extension asks the running app whether the creator already OWNS a batch of
ASINs they are browsing (from the Orders Butler's synced order history) and
whether they have already POSTED/promoted each (Storefront content, Daily Deals
posts, YouTube uploads, unioned via content-coverage). Product pages and
search/deals tiles use it to show a live "you already own this / you already
posted this" badge, so the creator does not buy a duplicate or re-promote the
same product. Authed with the pairing token (it returns the creator's private
order and content history) and read-only. The extension side is built
(`fetchOwnership` in `extension/src/background/hud-bridge.ts`); the app implements
the responder (`createOwnershipHandler` in
`app/extension-bridge/command-handlers.js`).

The extension sends:

```json
{ "type": "ownership.lookup", "payload": { "asins": ["B0CSG3YWR6", "B0EXAMPLE1"] } }
```

The app replies with one record per ASIN that carries a signal (owned, or has
posted content). ASINs with neither are omitted, so the extension treats an
absent ASIN as "nothing to show":

```json
{
  "type": "ownership.result",
  "ok": true,
  "results": [
    {
      "asin": "B0CSG3YWR6",
      "owned": true,
      "order": {
        "orderId": "111-2222222-3333333",
        "year": 2025,
        "quantity": 1,
        "title": "Example gadget",
        "paidPrice": 19.99,
        "currency": "USD",
        "marketplace": "amazon.com"
      },
      "posted": {
        "available": true,
        "count": 2,
        "platforms": ["youtube", "facebook"],
        "lastAt": "2025-02-01T00:00:00.000Z",
        "items": [
          { "type": "video", "platform": "youtube", "url": "https://youtu.be/x", "title": "My review", "at": "2025-02-01T00:00:00.000Z" }
        ]
      },
      "reviewed": null
    }
  ]
}
```

Contract notes:

- `owned` is true when the ASIN is in the creator's synced order history.
  `order` is OPTIONAL: an older snapshot row, or a re-purchase whose price fetch
  failed, may carry only some fields (or none). `paidPrice` is in whole currency
  units (not cents).
- `posted.available` is true when the creator has already made content for the
  ASIN. `platforms` is deduped and sorted; `items` is capped (newest first) and
  MAY be empty even when `available` is true. The app folds a row's `parentAsin`
  into this lookup, so a variation of an owned product resolves the parent's
  content.
- `reviewed` is reserved for a later phase (written Amazon reviews are not
  harvested yet) and is `null` for now.
- If the app was never paired the extension does not send this at all; a rejected
  token yields `{ "type": "auth.error" }` and the extension falls back to the
  server-backed owned list (owned-only, no order detail or posted content) or
  stays silent. Amazon only: the desktop ledger does not track Walmart orders.

## Cloud relay (cross-device)

Everything above is loopback only: it works when the extension and the desktop
app run on the SAME computer. The cloud relay is the counterpart for the case
where they run on DIFFERENT computers (extension on a laptop, desktop app on a
studio PC), so a deal found while browsing on one machine can queue to post from
the other. It carries the same `Command` envelope as the local bridge; the
desktop feeds each delivered command into the same command dispatcher, so every
command type is supported with no new per-command work.

Delivery is a polling inbox, not a live socket. The extension POSTs a command
to the relay; the desktop drains it on a short timer and acks it. Queuing a deal
is not latency-sensitive (deals post on a schedule), a stateless poll is more
reliable than holding a socket open, and it needs no Durable Object.

### Where it lives

The relay is a set of `/relay/*` routes on the licensing Worker
(`workers/licensing/src/routes/relay.js` in the desktop repo), backed by the
same `DEVICES_KV` namespace the device registry uses. The desktop receiver is
`app/extension-bridge/relay-client.js`; the extension sender is
`extension/src/background/relay.ts`. The public host is
`https://licensing.influencerbutler.com`.

### Trust model (two gates on the same-account namespace)

1. Same license account. Every relay key is namespaced by the license key, so a
   command can only ever reach a device on the same account. The extension
   authenticates with `Authorization: Bearer <license key>` (the key the user
   connected via `/api/extension/auth/check`); the desktop sends the key in the
   request body, like the other `/license/*` device endpoints.
2. Explicit device link plus a receive toggle. A send is accepted only when the
   target desktop has turned receiving ON and has approved the sender via a
   6-digit link code (the cloud mirror of the local pairing handshake). The link
   code is minted by the desktop and namespaced by the license key, so only a
   device holding the same key can claim it.

Enabling receiving and sending both require a paid or trialing license (the Pro
gate). Polling and acking do not: the desktop is already a licensed app reading
only its own account and device inbox.

### Endpoints

Link handshake:

- `POST /relay/link/start` `{ keyValue, instanceId, label }` (desktop) mints a
  one-time 6-digit code (TTL 2 minutes) and returns `{ code, expiresInMs }`.
- `POST /relay/link/claim` `{ senderId, senderLabel, code }` with the license
  Bearer (extension) records the sender as an approved link and returns
  `{ receiverInstanceId, receiverLabel }`. The code is burned on use.
- `GET /relay/targets?senderId=` (extension) lists the linked desktops.
- `GET /relay/links?keyValue=&instanceId=` and `POST /relay/unlink`
  `{ keyValue, instanceId, senderId }` (desktop) manage approved senders.

Receive toggle:

- `POST /relay/recv` `{ keyValue, instanceId, enabled }` and
  `GET /relay/recv?keyValue=&instanceId=` (desktop).

Inbox:

- `POST /relay/send` `{ senderId, targetInstanceId, command }` with the license
  Bearer (extension). Rejected unless the target has receiving on AND an approved
  link for this sender. On success returns `{ id }` (the inbox message id). The
  `command` is a `Command` object exactly as documented above.
- `POST /relay/poll` `{ keyValue, instanceId }` (desktop) returns
  `{ messages: [{ id, ts, senderId, senderLabel, command }] }`.
- `POST /relay/ack` `{ keyValue, instanceId, ids }` (desktop) removes delivered
  messages from the inbox.
- `POST /relay/result` `{ keyValue, senderId, receiverInstanceId, id, ok, message }`
  (desktop) and `GET /relay/results?senderId=&since=` (extension) carry the
  best-effort receipt so the sender can show the real outcome ("Added N of M
  deals on <device>").

### Reliability

Message ids are used to dedupe: the desktop handlers are idempotent, so a
re-delivered command (an ack that did not land, or a process restart before ack)
is safe. The inbox is capped (200, drop-oldest) and each write re-stamps a 7-day
TTL, so a receiver that never comes back never accumulates unboundedly. Read-only
lookups (`earnings.lookup`, `outreach.lookup`, `brand.enrichment`,
`history.backfill`, `ownership.lookup`) are NOT relayed: they are synchronous
enrichers for the page the creator is browsing on this machine, so they stay
local-bridge only.

## Versioning

`v` in the envelope starts at 1. The desktop MUST ignore unknown `type`
values and unknown payload fields rather than erroring, so the extension can
ship additive changes without lockstep releases.
