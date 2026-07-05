# Influencer Butler Chrome Extension

Free in-browser tools for Amazon Influencers. Lives alongside the desktop app:
scan product video carousels (influencer vs brand vs customer), find content
gaps in your own order history, spot Butler Approved opportunities, and check
your storefront for untagged or dead videos. Optionally sign in with your
Influencer Butler license key to sync findings to your dashboard at
influencerbutler.com and, later, straight into the desktop HUD (see
`docs/extension-local-bridge.md` at the repo root).

## Develop

```
cd extension
npm install
npm run icons     # regenerates static/icons (placeholder art)
npm run build     # bundles to dist/
npm run watch     # rebuild on change
```

Load `extension/dist` via chrome://extensions with Developer mode on and
"Load unpacked". Re-run after `npm run build`; with `watch`, click the reload
icon on the extension card to pick up changes.

## Test and package

```
npm run typecheck
npm run test          # vitest: pure modules (calculator math, seal criteria)
npm run lint:dashes   # em dash ban, also enforced on every build
npm run zip           # dist/ -> influencer-butler-extension-<version>.zip
```

## Architecture notes

- `src/amazon/` is the only place allowed to know Amazon's DOM. Selectors
  live in `selectors.ts` as ordered fallback lists; extractors accept a
  `Document` so the same code parses fetched pages during scans.
- Tools emit `Finding`s (see `src/transport/types.ts`). Content scripts never
  call the influencerbutler.com API directly: findings go to the background
  service worker, which queues, dedupes, and flushes them through the
  transport router (website API now, desktop local bridge later).
- All page UI mounts in closed shadow roots. Every tool entrypoint is wrapped
  by `guard()` so a selector break disables that tool instead of the page.
- The only network fetches to Amazon are the two explicit, button-triggered
  scans (order history, storefront), sequential with jitter and caps.
