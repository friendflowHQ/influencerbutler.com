# Publishing extension updates to the Chrome Web Store

The extension already auto-updates for users: once a new version is **published**
to the Chrome Web Store, Chrome pulls it to every installed browser within a few
hours on its own. There is no self-hosted update feed to maintain (unlike the
desktop app's `electron-updater` feed), because Chrome only auto-updates
extensions distributed through the store.

What used to be manual was the developer publish step. It is now one command:

```
cd extension
npm run bump patch      # or minor / major: bumps package.json + static/manifest.json
npm run release         # build -> zip -> upload to the Web Store -> submit for review
```

`npm run release` uploads the freshly built zip and submits it. Submission enters
Chrome's review queue (usually fast and automated for updates); it is
auto-submit, not instant-live. Once approved, user browsers update themselves.

To upload a new draft WITHOUT submitting (safe end-to-end check of the
credentials and packaging):

```
npm run build && npm run zip
node scripts/publish.mjs --dry-run
```

## Version is single-sourced

`extension/package.json` `version` is the source of truth. `npm run bump` writes
the same value into `static/manifest.json`, and `esbuild.mjs` also stamps it into
the shipped `dist/manifest.json` at build time, so the packaged manifest can
never disagree with the zip filename.

## One-time credential setup

The publish script uses the Chrome Web Store API v1.1 with an OAuth refresh
token belonging to the developer account that owns the listing.

1. In the [Google Cloud Console](https://console.cloud.google.com/), create or
   pick a project and **enable the "Chrome Web Store API"** (APIs & Services ->
   Library).
2. Configure the **OAuth consent screen**. Set it to **In production**, not
   Testing. This matters: refresh tokens issued while the consent screen is in
   Testing mode expire after 7 days, which would break a release roughly once a
   week.
3. Create an **OAuth client ID** of type **Desktop app**. Note the client id and
   client secret.
4. Mint a **refresh token** once, for the Google account that owns the Web Store
   listing, with scope `https://www.googleapis.com/auth/chromewebstore`. The
   standard way is the Google OAuth Playground (use your own client id/secret via
   the gear menu) or a short local script; store the resulting refresh token.
5. Provide the three secrets plus the app id to the script, either as real
   environment variables or in a gitignored `extension/.env`:

   ```
   CWS_CLIENT_ID=xxxxxxxx.apps.googleusercontent.com
   CWS_CLIENT_SECRET=xxxxxxxx
   CWS_REFRESH_TOKEN=1//xxxxxxxx
   # CWS_APP_ID defaults to the live listing id (cnkfballfjhdijogkjjhdfmnkijcjgbc)
   ```

   `.env` is gitignored; never commit these.

## CI (optional)

For push-button releases from GitHub, `.github/workflows/publish-extension.yml`
runs the same `build -> zip -> publish:store` on a manual dispatch or an
`ext-v*` tag, reading the three `CWS_*` values from GitHub repo secrets. The
local `npm run release` fully covers publishing on its own; the workflow just
moves it off your machine.

## Listing content vs. code updates

This doc covers shipping new **code**. The store **listing** copy, screenshots,
and privacy disclosures are in
[chrome-web-store-listing.md](chrome-web-store-listing.md); a code update does
not touch those unless the extension's behavior or permissions changed (in which
case update both, since reviewers compare the listing to the manifest).
