/**
 * Composites raw extension captures into branded 1280x800 Chrome Web Store
 * screenshots using scripts/assets/store-shot-frame.html and the locally
 * installed Chrome/Edge in headless mode (same pattern as
 * generate-competitor-graphic.mjs; no npm dependencies).
 *
 * Usage: node scripts/generate-extension-store-shots.mjs <rawDir> [slide ...]
 *   rawDir: folder containing the raw captures (see SLIDES for filenames),
 *           produced with scripts/capture-hold.mjs + scripts/capture-shot.mjs.
 *   slide:  optional slide keys to regenerate (default: all whose raw
 *           captures exist).
 *
 * Output: public/assets/extension/extension_shot_<n>_<key>_1280x800.png
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const templatePath = path.join(__dirname, "assets", "store-shot-frame.html");
const outDir = path.join(repoRoot, "public", "assets", "extension");
const logoUrl = toFileUrl(path.join(repoRoot, "public", "assets", "influencer-butler-logo.png"));

const rawDir = process.argv[2];
if (!rawDir || !fs.existsSync(rawDir)) {
  console.error("Usage: node scripts/generate-extension-store-shots.mjs <rawDir> [slide ...]");
  process.exit(1);
}

// Raw captures are 1600x1000 (1280x800 viewport at Windows 125% DPI).
const SLIDES = [
  {
    n: 1,
    key: "product_page",
    mode: "wide",
    raw: "raw_product_top.png",
    barUrl: "amazon.com",
    headline: "Know what's worth filming before you film it",
    caption:
      "Butler Approved seals, influencer vs brand video counts, and break-even math on every product page you open.",
    img1Style: "width:1010px;top:-168px;",
  },
  {
    n: 2,
    key: "campaign_radar",
    mode: "wide",
    raw: "raw_campaign_b.png",
    barUrl: "affiliate-program.amazon.com",
    headline: "Spot the Creator Connections campaigns that deserve you",
    caption:
      "Campaign Radar scores every campaign against your thresholds, highlights the winners, and shows how full each one is.",
    img1Style: "width:1010px;top:-10px;",
  },
  {
    n: 3,
    key: "storefront_checkup",
    mode: "wide",
    raw: "raw_storefront4.png",
    barUrl: "amazon.com/shop",
    headline: "Stop leaking commissions on your storefront",
    caption:
      "One click scans every post for untagged videos, over-tagged listings, and products that went unavailable.",
    img1Style: "width:1018px;top:-191px;",
  },
  {
    n: 4,
    key: "popup",
    mode: "duo",
    raw: "raw_popup.png",
    raw2: "raw_popup_scroll1.png",
    barUrl: "Influencer Butler",
    bar2Url: "Settings",
    headline: "A full research toolkit in your popup",
    caption:
      "Toggle every tool, set your commission rate and hourly value, and sync findings to the desktop app.",
    // Popup column is the left 531px of the 1600px capture; scaling the full
    // image to 1205px wide maps that column onto the 400px card.
    img1Style: "width:1205px;top:0;left:0;",
    img2Style: "width:1205px;top:-100px;left:0;",
  },
  {
    n: 5,
    key: "search_overlay",
    mode: "wide",
    raw: "raw_search_kg3.png",
    barUrl: "amazon.com",
    headline: "See the money before you even click",
    caption:
      "Butler score, real commission per sale, video competition, and a watch button on every search result.",
    // Crop the results columns (x 370-1420) out of the 1600px capture.
    img1Style: "width:1539px;left:-356px;top:-30px;",
  },
];

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
  console.error("No Chrome or Edge found. Set CHROME_PATH.");
  process.exit(1);
}

function toFileUrl(p) {
  return "file:///" + p.replace(/\\/g, "/");
}

const requested = process.argv.slice(3);
const template = fs.readFileSync(templatePath, "utf8");
fs.mkdirSync(outDir, { recursive: true });
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ib-store-shot-"));

for (const slide of SLIDES) {
  if (requested.length && !requested.includes(slide.key)) continue;
  const rawPath = path.join(rawDir, slide.raw);
  if (!fs.existsSync(rawPath)) {
    console.log(`skip ${slide.key}: missing ${slide.raw}`);
    continue;
  }
  let html = template
    .replaceAll("{{MODE}}", slide.mode)
    .replaceAll("{{LOGO}}", logoUrl)
    .replaceAll("{{HEADLINE}}", slide.headline)
    .replaceAll("{{CAPTION}}", slide.caption)
    .replaceAll("{{BAR_URL}}", slide.barUrl)
    .replaceAll("{{IMG1}}", toFileUrl(rawPath))
    .replaceAll("{{IMG1_STYLE}}", slide.img1Style || "");
  if (slide.raw2) {
    const raw2Path = path.join(rawDir, slide.raw2);
    html = html.replace(
      "<!--CARD2-->",
      `<div class="card"><div class="browser-bar"><span class="dot r"></span><span class="dot y"></span><span class="dot g"></span><span class="urlpill">${slide.bar2Url || slide.barUrl}</span></div><div class="shotwrap"><img src="${toFileUrl(raw2Path)}" style="${slide.img2Style || ""}"></div></div>`,
    );
  }
  const tmpHtml = path.join(tmpDir, `slide_${slide.key}.html`);
  fs.writeFileSync(tmpHtml, html);
  const outPath = path.join(outDir, `extension_shot_${slide.n}_${slide.key}_1280x800.png`);
  execFileSync(browser, [
    "--headless",
    "--disable-gpu",
    "--hide-scrollbars",
    "--force-device-scale-factor=1",
    "--window-size=1280,800",
    `--screenshot=${outPath}`,
    toFileUrl(tmpHtml),
  ]);
  const { size } = fs.statSync(outPath);
  console.log(`wrote ${outPath} (${Math.round(size / 1024)} KB)`);
}
