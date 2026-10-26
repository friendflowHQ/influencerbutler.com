/**
 * Summary: Renders the branded SVG hero (1536x1024) for the blog post
 *   "retag-butler-explained" using the locally installed Chrome/Edge
 *   in headless mode (same approach as generate-desktop-vs-cloud-hero.mjs).
 *   No API key needed.
 *
 * Scene: inside a branded picture-frame panel, a faded, grayed-out product
 *   box marked with a small "out of stock" X sits beside a fresh, in-stock
 *   product box. A small plus/tag glyph connects the two, and a second pair
 *   of overlapping price-tag icons underneath shows a new tag being added
 *   alongside the original rather than replacing it. A row of storefront
 *   thumbnails above (a mix of live and faded items) sets the "scanning a
 *   storefront" context.
 *
 * Usage:
 *   node scripts/generate-retag-butler-hero.mjs            (skips if PNG exists)
 *   node scripts/generate-retag-butler-hero.mjs --force
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const outDir = path.join(repoRoot, "public", "assets", "blog");
const SLUG = "retag-butler-explained";

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

function packageBox(x, y, s, fillBody, fillTape, strokeColor) {
  // A simple parcel/product box: rounded square body with a cross of "tape"
  // lines, abstract enough to read as "a product" without any text.
  return `
  <g transform="translate(${x},${y})" filter="url(#soft)">
    ${rr(0, 0, s, s, s * 0.14, fillBody, `stroke="${strokeColor}" stroke-width="3"`)}
    ${rr(0, s * 0.44, s, s * 0.1, s * 0.05, fillTape)}
    ${rr(s * 0.45, 0, s * 0.1, s, s * 0.05, fillTape)}
  </g>`;
}

function outOfStockMark(cx, cy, r) {
  // A small round badge with a crossed-out mark, reading as "dead / delisted."
  return `
  <g>
    ${circle(cx, cy, r, WHITE, `stroke="${NAVY}" stroke-width="3" filter="url(#soft)"`)}
    <line x1="${cx - r * 0.45}" y1="${cy - r * 0.45}" x2="${cx + r * 0.45}" y2="${cy + r * 0.45}" stroke="${NAVY}" stroke-width="4" stroke-linecap="round"/>
    <line x1="${cx + r * 0.45}" y1="${cy - r * 0.45}" x2="${cx - r * 0.45}" y2="${cy + r * 0.45}" stroke="${NAVY}" stroke-width="4" stroke-linecap="round"/>
  </g>`;
}

function plusBadge(cx, cy, r, fill) {
  // A small circular "added" badge with a plus glyph inside.
  const barW = r * 1.1;
  const barH = r * 0.34;
  return `
  <g>
    ${circle(cx, cy, r, fill, `filter="url(#soft)"`)}
    ${rr(cx - barW / 2, cy - barH / 2, barW, barH, barH / 2, WHITE)}
    ${rr(cx - barH / 2, cy - barW / 2, barH, barW, barH / 2, WHITE)}
  </g>`;
}

function priceTag(cx, cy, s, fill, holeFill) {
  // A rotated rounded rect with a punched hole near one corner, reading as
  // a tag/label, used to represent "a tag attached to this product."
  return `
  <g transform="translate(${cx},${cy}) rotate(45)">
    ${rr(-s * 0.5, -s * 0.32, s, s * 0.64, s * 0.14, fill)}
    ${circle(-s * 0.32, 0, s * 0.09, holeFill)}
  </g>`;
}

function scene() {
  const frameOuter = rr(430, 90, 676, 760, 28, WHITE, `stroke="${SLATE_L}" stroke-width="3" filter="url(#soft)"`);
  const frameInner = rr(460, 120, 616, 640, 18, "#FBE9CF");

  // A row of storefront thumbnails up top: a mix of live products and a
  // couple of faded, out-of-stock ones, setting the "scanning a storefront"
  // context before the main illustration tells the actual story.
  const storefrontRow = [
    productThumb(498, 150, 72, PINK),
    productThumb(590, 150, 72, "#DCE3EC"),
    productThumb(682, 150, 72, BLUE),
    productThumb(774, 150, 72, "#DCE3EC"),
    productThumb(866, 150, 72, "#FDE6C8"),
    productThumb(958, 150, 72, BLUE),
  ].join("");
  const storefrontDeadMarks = [
    outOfStockMark(590 + 72, 150, 16),
    outOfStockMark(774 + 72, 150, 16),
  ].join("");

  // The main story: a faded, delisted product box on the left, a fresh,
  // in-stock replacement box on the right, connected by a plus/tag glyph in
  // between, showing a second tag getting added, not a swap. Boxes are
  // sized and placed to stay inside the inner panel (x 460-1076).
  const deadBox = packageBox(523, 380, 190, MIST, WHITE, SLATE_L);
  const deadMark = outOfStockMark(713, 380, 30);
  const liveBox = packageBox(823, 380, 190, ORANGE, "#FBE3B8", ORANGE_DEEP);

  const connectorLine = `<line x1="716" y1="475" x2="820" y2="475" stroke="${SLATE_L}" stroke-width="4" stroke-dasharray="2 14" stroke-linecap="round"/>`;
  const connectorBadge = plusBadge(768, 475, 32, NAVY);

  // Underneath: the original tag stays attached (navy), and a new tag rides
  // alongside it (orange, with its own small plus badge) rather than
  // replacing anything.
  const originalTag = priceTag(740, 650, 100, NAVY_L, "#FBE9CF");
  const addedTag = priceTag(794, 650, 100, ORANGE, "#FBE9CF");
  const addedTagBadge = plusBadge(834, 606, 20, NAVY);

  const thumbs = `${storefrontRow}${storefrontDeadMarks}`;

  // Floating product chips orbiting outside the frame: a few faded ones with
  // their own tiny out-of-stock marks, implying the rest of the storefront
  // being scanned, plus ordinary live thumbnails for balance.
  const orbit = [
    productThumb(150, 200, 90, "#DCE3EC"),
    productThumb(170, 480, 70, BLUE),
    productThumb(110, 760, 80, "#DCE3EC"),
    productThumb(1300, 220, 80, BLUE),
    productThumb(1330, 520, 70, PINK),
    productThumb(1270, 790, 90, "#FDE6C8"),
  ].join("");
  const orbitDeadMarks = [
    outOfStockMark(150 + 90, 200, 18),
    outOfStockMark(110 + 80, 760, 18),
  ].join("");

  const sparkle = (x, y, s = 1) => `
  <g transform="translate(${x},${y}) scale(${s})" fill="${ORANGE}">
    <path d="M0 -22 L6 -6 L22 0 L6 6 L0 22 L-6 6 L-22 0 L-6 -6 Z"/>
  </g>`;

  return `${frameOuter}${frameInner}${thumbs}${deadBox}${liveBox}${connectorLine}${connectorBadge}${deadMark}${originalTag}${addedTag}${addedTagBadge}${orbit}${orbitDeadMarks}${sparkle(768, 110, 1)}${sparkle(1180, 860, 0.7)}${sparkle(340, 860, 0.6)}`;
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
