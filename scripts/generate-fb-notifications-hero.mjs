/**
 * Renders scripts/assets/fb-notifications-hero.html to
 * public/assets/blog/fix-facebook-notifications-popup.png using the locally
 * installed Chrome/Edge in headless mode (same approach as
 * generate-cloud-pc-hero.mjs). No npm dependencies, no API key.
 *
 * Usage: node scripts/generate-fb-notifications-hero.mjs
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const htmlPath = path.join(__dirname, "assets", "fb-notifications-hero.html");
const outPath = path.join(
  repoRoot,
  "public",
  "assets",
  "blog",
  "fix-facebook-notifications-popup.png",
);

const CANDIDATES = [
  process.env.CHROME_PATH,
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium-browser",
].filter(Boolean);

const browser = CANDIDATES.find((candidate) => fs.existsSync(candidate));
if (!browser) {
  console.error(
    "No Chrome or Edge found. Set CHROME_PATH to a Chromium-based browser executable.",
  );
  process.exit(1);
}

const fileUrl = "file:///" + htmlPath.replace(/\\/g, "/");
execFileSync(browser, [
  "--headless",
  "--disable-gpu",
  "--hide-scrollbars",
  "--force-device-scale-factor=1",
  "--window-size=1600,1000",
  `--screenshot=${outPath}`,
  fileUrl,
]);

const { size } = fs.statSync(outPath);
console.log(`wrote ${outPath} (${Math.round(size / 1024)} KB) using ${path.basename(browser)}`);
