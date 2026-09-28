# Entitlements spec (desktop app)

This is the contract the Influencer Butler desktop app implements to enforce the
Free / 14-day trial / Pro tiers. The website owns the source of truth; the app
reads it and gates butlers accordingly. Nothing in the website repo enforces the
desktop butlers - that is this document's job.

## Source of truth

`src/lib/entitlements.ts` on the website defines the free set and the tier logic.
The app never hardcodes the free list: it reads it from the API on every launch
(and caches it) so the set can change without shipping a new app build.

## Endpoint

`GET https://www.influencerbutler.com/api/entitlements`

Auth (either):
- `Authorization: Bearer <license-key>` (desktop app - this is what the app uses)
- Supabase session cookie (browser dashboard)

Response `200`:

```json
{
  "tier": "free | trial | pro",
  "status": "on_trial | active | past_due | paused | cancelled | null",
  "allButlersUnlocked": true,
  "freeButlerSlugs": [
    "like-butler",
    "benable-like-butler",
    "instagram-like-butler",
    "cc-check",
    "orders-butler",
    "storefront-butler"
  ]
}
```

Notes:
- A lapsed or cancelled customer still resolves identity from their old license
  key, so the endpoint returns `tier:"free"` (with `allButlersUnlocked:false`)
  rather than a 401. The free butlers keep working for them.
- `tier` mapping: `on_trial` -> `trial`; `active` / `past_due` / `paused` -> `pro`;
  everything else -> `free`.
- Only a genuinely invalid / unknown license returns a non-200 (401).

## App behavior

1. On launch (and on a periodic refresh), call `GET /api/entitlements` with the
   stored license key.
2. If the butler being opened is in `freeButlerSlugs`, always allow it, on any
   `tier` and even if the call failed or the key is expired. These are the free
   forever tools.
3. Otherwise allow it only when `allButlersUnlocked` is `true` (trial or Pro).
4. When a locked butler is opened by a free-tier user, show the in-app
   "Upgrade to Pro" prompt linking to `https://www.influencerbutler.com/pricing`
   instead of running it.
5. Fail open for the free set, fail closed for the paid set: if the endpoint is
   unreachable, keep the `freeButlerSlugs` running (cache the last-known list)
   and lock the rest until the next successful refresh.

## The free set (as of this writing)

See & Organize butlers that create habit and data lock-in without giving away
the money engines:

- Like Butler, Benable Like Butler, Instagram Like Butler: auto-like at a safe pace
- CC Check: grab every ASIN from any page
- Orders Butler: pull full Amazon order history
- Storefront Butler: audit photo / video coverage

Everything else (Amazon Butler, Instagram Butler, Pitch Butler, Daily Commission
Butler, Messenger, Levanta, Retag, Video Reload, Voiceover, YouTube, deals
butlers, Goldmine, Earnings Intelligence, etc.) is trial + Pro only. Always read
the live `freeButlerSlugs` rather than trusting this list, which can drift.

## Trial send cap

Trial users retain the existing 100 message-sends / 14-day cap (abuse
protection). That cap is enforced where sends are counted today; this spec does
not change it. The trial still unlocks every butler, it just limits volume.
