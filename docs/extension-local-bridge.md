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

## Versioning

`v` in the envelope starts at 1. The desktop MUST ignore unknown `type`
values and unknown payload fields rather than erroring, so the extension can
ship additive changes without lockstep releases.
