/**
 * Summary: Renders the branded SVG hero (1536x1024) for the blog post
 *   "ai-clone-butler-explained" using the locally installed Chrome/Edge
 *   in headless mode (same approach as generate-desktop-vs-cloud-hero.mjs).
 *   No API key needed.
 *
 * Scene: a polaroid-style photo card held inside a camera/compositing frame,
 *   with a simple geometric person silhouette on one side and a real product
 *   icon on the other, joined by a plus connector, representing two real
 *   references (you, the product) composited into one new photo, no
 *   training step, no studio.
 *
 * Usage:
 *   node scripts/generate-ai-clone-butler-hero.mjs            (skips if PNG exists)
 *   node scripts/generate-ai-clone-butler-hero.mjs --force
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const outDir = path.join(repoRoot, "public", "assets", "blog");
const SLUG = "ai-clone-butler-explained";

const force = process.argv.slice(2).includes("--force");

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

const browser = CANDIDATES.find((c) => fs.existsSync(c));
if (!browser) {
  console.error("No Chrome or Edge found. Set CHROME_PATH to a Chromium-based browser executable.");
  process.exit(1);
}

const NAVY = "#1E2A4A";
const NAVY_L = "#2B3A62";
const ORANGE = "#F59E0B";
const ORANGE_DEEP = "#D97706";
const CREAM = "#FEF6EA";
const WHITE = "#FFFFFF";
const SLATE = "#94A3B8";
const SLATE_L = "#C7D2DE";
const MIST = "#EEF2F7";
const PINK = "#F6C6CE";
const BLUE = "#BFD7EA";

const rr = (x, y, w, h, r, fill, extra = "") =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${fill}" ${extra}/>`;
const bar = (x, y, w, h = 12, fill = SLATE_L) => rr(x, y, w, h, h / 2, fill);
const circle = (cx, cy, r, fill, extra = "") => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}" ${extra}/>`;

function productThumb(x, y, s, fill) {
  return `
  <g transform="translate(${x},${y})" filter="url(#soft)">
    ${rr(0, 0, s, s, s * 0.18, WHITE, `stroke="${SLATE_L}" stroke-width="2"`)}
    ${rr(s * 0.18, s * 0.18, s * 0.64, s * 0.64, s * 0.1, fill)}
  </g>`;
}

function personSilhouette(cx, cy, scale = 1) {
  // A plain geometric "you" silhouette (no outfit color-blocking), standing
  // in for the reference photos rather than a styled model.
  return `
  <g transform="translate(${cx},${cy}) scale(${scale})">
    ${circle(0, -150, 46, NAVY_L)}
    ${rr(-58, -104, 116, 160, 34, NAVY_L)}
    ${rr(-78, -92, 32, 120, 16, NAVY)}
    ${rr(46, -92, 32, 120, 16, NAVY)}
    ${rr(-40, 56, 36, 120, 16, NAVY)}
    ${rr(4, 56, 36, 120, 16, NAVY)}
  </g>`;
}

function cameraIcon(cx, cy, s = 1) {
  // Simple geometric camera badge representing the single compositing call.
  return `
  <g transform="translate(${cx},${cy}) scale(${s})" filter="url(#soft)">
    ${rr(-70, -16, 140, 92, 20, NAVY)}
    ${rr(-26, -42, 52, 30, 8, NAVY)}
    ${circle(0, 32, 38, ORANGE_DEEP)}
    ${circle(0, 32, 24, "#FEF6EA")}
    ${circle(0, 32, 12, ORANGE)}
    ${circle(48, -4, 7, ORANGE)}
  </g>`;
}

function plusConnector(cx, cy) {
  return `
  <g transform="translate(${cx},${cy})" fill="${ORANGE}">
    ${rr(-26, -8, 52, 16, 8, ORANGE)}
    ${rr(-8, -26, 16, 52, 8, ORANGE)}
  </g>`;
}

function scene() {
  // A polaroid-style photo card: the "new photo" the feature produces.
  const cardOuter = rr(452, 130, 632, 730, 22, WHITE, `stroke="${SLATE_L}" stroke-width="3" filter="url(#soft)"`);
  const cardInner = rr(484, 162, 568, 526, 16, "#FCEEDB");

  // Two real references, side by side inside the photo: a person (you) and
  // a real product, joined by a plus to show they are combined in one call.
  const person = personSilhouette(640, 560, 1.05);
  const product = productThumb(860, 350, 200, BLUE);
  const plus = plusConnector(780, 430);

  // Camera badge overlapping the top edge of the card, standing in for the
  // single generation call that takes both references in at once.
  const camera = cameraIcon(768, 150, 1.05);

  // A light scatter of sparkles implying "instant," no training wait.
  const sparkle = (x, y, s = 1) => `
  <g transform="translate(${x},${y}) scale(${s})" fill="${ORANGE}">
    <path d="M0 -22 L6 -6 L22 0 L6 6 L0 22 L-6 6 L-22 0 L-6 -6 Z"/>
  </g>`;

  const sparkles = [
    sparkle(1180, 220, 0.7),
    sparkle(300, 300, 0.55),
    sparkle(1220, 760, 0.6),
    sparkle(280, 780, 0.5),
  ].join("");

  // A soft blank strip at the bottom of the card, like a polaroid border.
  const bottomStrip = bar(534, 758, 468, 18, "#F6DFBC");

  return `${cardOuter}${cardInner}${person}${product}${plus}${bottomStrip}${camera}${sparkles}`;
}

function frame(inner) {
  return `<!doctype html>
<html><head><meta charset="utf-8" />
<style>html,body{margin:0;padding:0}#stage{width:1536px;height:1024px}svg{display:block}</style>
</head><body><div id="stage">
<svg width="1536" height="1024" viewBox="0 0 1536 1024" xmlns="http://www.w3.org/2000/svg" font-family="Segoe UI, Arial, sans-serif">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${CREAM}"/><stop offset="1" stop-color="#FBE9CF"/></linearGradient>
    <filter id="soft" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="10" stdDeviation="18" flood-color="${NAVY}" flood-opacity="0.10"/></filter>
  </defs>
  <rect width="1536" height="1024" fill="url(#bg)"/>
  ${circle(200, 180, 120, ORANGE, "opacity=\"0.06\"")}
  ${circle(1360, 880, 160, NAVY, "opacity=\"0.05\"")}
  <g transform="translate(108,92)">
    ${circle(22, 20, 22, NAVY)}
    <path d="M11 26 q11 -13 22 0" fill="none" stroke="${ORANGE}" stroke-width="4" stroke-linecap="round"/>
    ${circle(22, 14, 6, ORANGE)}
    <text x="58" y="28" font-size="30" font-weight="700" fill="${NAVY}">Influencer <tspan fill="${ORANGE}">Butler</tspan></text>
  </g>
  ${inner}
</svg></div></body></html>`;
}

fs.mkdirSync(outDir, { recursive: true });
const outPath = path.join(outDir, `${SLUG}.png`);
if (!force && fs.existsSync(outPath)) {
  console.log(`skip ${SLUG} (exists)`);
  process.exit(0);
}
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ib-hero-"));
const htmlPath = path.join(tmpDir, `${SLUG}.html`);
fs.writeFileSync(htmlPath, frame(scene()), "utf8");
const fileUrl = "file:///" + htmlPath.replace(/\\/g, "/");
execFileSync(browser, [
  "--headless",
  "--disable-gpu",
  "--hide-scrollbars",
  "--force-device-scale-factor=1",
  "--window-size=1536,1024",
  `--screenshot=${outPath}`,
  fileUrl,
], { stdio: "ignore" });
const { size } = fs.statSync(outPath);
console.log(`wrote ${path.relative(repoRoot, outPath)} (${Math.round(size / 1024)} KB) using ${path.basename(browser)}`);
