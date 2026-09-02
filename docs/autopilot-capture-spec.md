# Autopilot screenshot capture: desktop-repo workflow spec

The blog autopilot embeds real screenshots from a curated index
(`src/lib/blog-autogen/screenshot-index.ts`). Anything committed to
`public/assets/app/` in THIS repo (plus a caption in
`public/assets/app/_captions.json`) joins that index automatically.

This spec defines the capture pipeline that produces those files. The capture
runs in the DESKTOP repo (`FriendFlow/InfluencerButler`) because both the
Electron app and the Chrome extension source live there; this website repo only
triggers it and receives the results.

## Trigger (already implemented, this repo)

`POST /api/admin/blog/autopilot/screenshots` (permission `blog.manage`) sends a
`repository_dispatch` to `GITHUB_DISPATCH_REPO` using `GITHUB_DISPATCH_TOKEN`
(the same envs the catalogue-harvest trigger uses):

```json
{
  "event_type": "capture-screenshots",
  "client_payload": {
    "requestId": "uuid",
    "requestedBy": "admin@email",
    "shots": [
      {
        "id": "app-deals",
        "target": "app.deals",
        "caption": "Deals Butler workspace with the deal feed",
        "outPath": "public/assets/app/app-deals.png"
      }
    ]
  }
}
```

`target` naming: `app.<workspace-slug>` for desktop screens,
`extension.popup` / `extension.options` for extension surfaces.

## Desktop repo: what to build

### 1. `--screenshot-target=<name>` deep link (small app change)

A CLI flag (or `IB_SCREENSHOT_TARGET` env) that, in `DEMO_MODE=1`, navigates
the HUD to the named workspace after first paint. Map `app.dashboard`,
`app.deals`, `app.orders-butler`, `app.pitch-butler`, `app.action-queue`
(extend as needed). DEMO_MODE seeds a fixture profile (realistic fake orders,
deals, pipelines) so screens are populated and no real accounts are touched.

### 2. `.github/workflows/capture-screenshots.yml`

```yaml
name: Capture screenshots
on:
  repository_dispatch:
    types: [capture-screenshots]
jobs:
  capture:
    runs-on: windows-latest   # matches the product's real look
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - run: npm ci
      - run: npx playwright install chromium
      - name: Capture requested shots
        run: node scripts/capture-for-blog.mjs
        env:
          SHOTS_JSON: ${{ toJson(github.event.client_payload.shots) }}
      - name: Commit to website repo
        run: node scripts/commit-shots-to-website.mjs
        env:
          WEBSITE_CONTENT_TOKEN: ${{ secrets.WEBSITE_CONTENT_TOKEN }}
          WEBSITE_REPO: FriendFlow/influencerbutler.com
          REQUEST_ID: ${{ github.event.client_payload.requestId }}
```

### 3. `scripts/capture-for-blog.mjs` (desktop repo)

- Desktop targets: `const { _electron } = require("playwright")`;
  `_electron.launch({ args: [".", "--screenshot-target=<name>"], env: { DEMO_MODE: "1" } })`;
  wait for the workspace-ready signal (add a `data-screenshot-ready` DOM marker
  in DEMO_MODE), size the window 1600x1000, `page.screenshot()`.
- Extension targets: launch Chromium with
  `--load-extension=<path to built extension>` in a persistent context;
  `extension.popup` = open `chrome-extension://<id>/popup.html` directly at
  400x600; `extension.options` likewise. Amazon-authenticated surfaces
  (product overlays, Campaign Radar over the real grid) CANNOT be captured in
  CI - do not add targets for them; those stay covered by the static index's
  store shots.
- Write PNGs to `out/<id>.png`; skip-and-log any target that fails so one flaky
  screen never fails the batch.

### 4. `scripts/commit-shots-to-website.mjs` (desktop repo)

One atomic commit to the WEBSITE repo via the Git Data API (blobs -> tree with
base_tree -> commit -> PATCH ref; mirror this site's `src/lib/github-content.ts`):

- Each captured `out/<id>.png` -> `public/assets/app/<id>.png` (base64 blob).
- Merge captions: GET the current `public/assets/app/_captions.json`
  (`{"<file>.png": "caption"}`), overlay the new captions, PUT the merged file
  in the same commit.
- Skip files whose bytes are unchanged; skip the commit entirely when nothing
  changed. Commit message: `blog(capture): screenshots <requestId>`.

Secret: `WEBSITE_CONTENT_TOKEN` = a fine-grained PAT with Contents read+write
on `FriendFlow/influencerbutler.com` (same scope as this repo's
`GITHUB_CONTENT_TOKEN`; can be the same token) stored as a desktop-repo
Actions secret.

## Honest fragility notes

Electron-in-CI is the flakiest part of the autopilot design: demo-data drift,
first-paint races, font/chrome differences between runner images, and app
build breakage will all surface here. That is why capture is fully decoupled:
a capture failure never affects post generation (the curated static screenshot
index always works), and each dispatch is fire-and-forget with the resulting
commit (or its absence) as the status signal.
