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
  "creatorMode": "both",
  "paired": false
}
```

`dealWorkspaces` is the app's real workspace list (including the user's own
niche clones); the extension falls back to a static hint list if absent.
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
harvests (200 products per command), so the app should accept a batch and
return one result. Until the app supports this, the extension falls back to N
sequential `deal.push` calls.

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

### When the app is not running

Every probe/command fails fast (short timeout). The extension then shows an
upsell instead of the buttons: signed-in users get "open or install the app",
anonymous users get "start your free trial", both linking to
`/go/download`. That is the intended conversion path, so the failure mode is a
feature, not an error.

## Versioning

`v` in the envelope starts at 1. The desktop MUST ignore unknown `type`
values and unknown payload fields rather than erroring, so the extension can
ship additive changes without lockstep releases.
