// Uploads the built extension zip to the Chrome Web Store and submits it for
// review, using the Chrome Web Store API v1.1. This is the "ship it" step that
// makes the extension update itself for every user (Chrome auto-updates Web
// Store extensions once a new version is published).
//
// Requires a prior `npm run build && npm run zip` (or just `npm run release`,
// which chains all three).
//
// Credentials come from the environment (or a gitignored extension/.env):
//   CWS_CLIENT_ID       OAuth client id (Desktop app type)
//   CWS_CLIENT_SECRET   OAuth client secret
//   CWS_REFRESH_TOKEN   refresh token minted once for the developer account
//   CWS_APP_ID          extension id (defaults to the live listing id)
// See docs/chrome-web-store-publishing.md for the one-time setup.
//
// Flags:
//   --dry-run                 upload the new draft but do NOT submit for review
//   --target=trustedTesters   publish to trusted testers instead of the public
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

const argv = process.argv.slice(2);
const dryRun = argv.includes("--dry-run");
const targetArg = argv.find((a) => a.startsWith("--target="));
const publishTarget = targetArg ? targetArg.slice("--target=".length) : "default";
if (!["default", "trustedTesters"].includes(publishTarget)) {
  fail(`--target must be "default" or "trustedTesters", got "${publishTarget}"`);
}

// Minimal .env loader (no dependency), mirroring the repo's other .env.* files.
// Only sets keys that are not already present in the real environment.
loadDotEnv(path.join(root, ".env"));

const CLIENT_ID = requireEnv("CWS_CLIENT_ID");
const CLIENT_SECRET = requireEnv("CWS_CLIENT_SECRET");
const REFRESH_TOKEN = requireEnv("CWS_REFRESH_TOKEN");
const APP_ID = process.env.CWS_APP_ID || "cnkfballfjhdijogkjjhdfmnkijcjgbc";

const { version } = JSON.parse(
  fs.readFileSync(path.join(root, "package.json"), "utf8"),
);
const zipPath = path.join(root, `influencer-butler-extension-${version}.zip`);
if (!fs.existsSync(zipPath)) {
  fail(
    `${path.basename(zipPath)} not found; run \`npm run build && npm run zip\` first`,
  );
}

console.log(`publishing ${path.basename(zipPath)} to item ${APP_ID}${dryRun ? " (dry run)" : ""}`);

const token = await getAccessToken();
await uploadZip(token);
if (dryRun) {
  console.log("dry run: uploaded a new draft, did not submit for review");
} else {
  await publish(token);
}

async function getAccessToken() {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      refresh_token: REFRESH_TOKEN,
      grant_type: "refresh_token",
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.access_token) {
    fail(
      `token exchange failed (${res.status}): ${body.error_description || body.error || JSON.stringify(body)}\n` +
        "If this says the token is invalid or expired, re-mint CWS_REFRESH_TOKEN and make sure the OAuth consent screen is 'In production' (Testing tokens expire after 7 days).",
    );
  }
  return body.access_token;
}

async function uploadZip(token) {
  const zip = fs.readFileSync(zipPath);
  const res = await fetch(
    `https://www.googleapis.com/upload/chromewebstore/v1.1/items/${APP_ID}`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        "x-goog-api-version": "2",
      },
      body: zip,
    },
  );
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body.uploadState === "FAILURE") {
    const detail = (body.itemError || [])
      .map((e) => e.error_detail || e.errorDetail || JSON.stringify(e))
      .join("; ");
    fail(`upload failed (${res.status}, state ${body.uploadState || "?"}): ${detail || JSON.stringify(body)}`);
  }
  console.log(`upload state: ${body.uploadState}`);
}

async function publish(token) {
  const res = await fetch(
    `https://www.googleapis.com/chromewebstore/v1.1/items/${APP_ID}/publish?publishTarget=${publishTarget}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "x-goog-api-version": "2",
        "Content-Length": "0",
      },
    },
  );
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    fail(`publish failed (${res.status}): ${JSON.stringify(body)}`);
  }
  const status = Array.isArray(body.status) ? body.status.join(", ") : body.status;
  const detail = Array.isArray(body.statusDetail) ? body.statusDetail.join("; ") : body.statusDetail;
  console.log(`publish status: ${status || "OK"}${detail ? ` (${detail})` : ""}`);
  console.log(
    "Submitted to the Chrome Web Store. It enters review (usually fast for updates); once approved, Chrome auto-updates every user.",
  );
}

function requireEnv(name) {
  const v = process.env[name];
  if (!v) fail(`missing required env var ${name} (set it in the environment or extension/.env)`);
  return v;
}

function loadDotEnv(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (key && process.env[key] === undefined) process.env[key] = value;
  }
}

function fail(msg) {
  console.error(`publish: ${msg}`);
  process.exit(1);
}
