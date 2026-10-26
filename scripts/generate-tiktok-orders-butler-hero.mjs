/**
 * Summary: Renders the branded SVG hero (1536x1024) for the blog post
 *   "tiktok-orders-butler-explained" using the locally installed Chrome/Edge
 *   in headless mode (same approach as generate-ai-influencer-butler-hero.mjs).
 *   No API key needed.
 *
 * Scene: an abstract dashboard card with an order-count tile (a small stack
 *   of bars) and two commission tiles beside it, one drawn with a dashed
 *   outline to suggest "pending" (Projected commission) and one drawn solid
 *   to suggest "settled" (Settled commission), representing a simple,
 *   read-only orders dashboard.
 *
 * Usage:
 *   node scripts/generate-tiktok-orders-butler-hero.mjs            (skips if PNG exists)
 *   node scripts/generate-tiktok-orders-butler-hero.mjs --force
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const outDir = path.join(repoRoot, "public", "assets", "blog");
const SLUG = "tiktok-orders-butler-explained";

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

function orderCountTile(x, y, w, h) {
  // A card with a small ascending stack of bars, implying "order count."
  const heights = [34, 52, 44, 68, 58];
  const barW = 26;
  const gap = 14;
  const baseY = y + h - 44;
  const bars = heights
    .map((bh, i) => bar(x + 40 + i * (barW + gap), baseY - bh, barW, bh, i % 2 === 0 ? ORANGE : ORANGE_DEEP))
    .join("");
  return `
  <g filter="url(#soft)">
    ${rr(x, y, w, h, 22, WHITE, `stroke="${SLATE_L}" stroke-width="3"`)}
    ${circle(x + 44, y + 44, 14, ORANGE)}
    ${bar(x + 72, y + 34, 150, 16, NAVY)}
    ${bar(x + 72, y + 58, 100, 10, SLATE_L)}
    ${bars}
  </g>`;
}

function pendingTile(x, y, w, h) {
  // Dashed outline: "Projected" commission, not finalized yet.
  return `
  <g filter="url(#soft)">
    ${rr(x, y, w, h, 20, WHITE, `stroke="${SLATE}" stroke-width="3" stroke-dasharray="10 9"`)}
    ${circle(x + 38, y + 38, 12, "#FBE9CF", `stroke="${ORANGE}" stroke-width="3" stroke-dasharray="4 4"`)}
    ${bar(x + 64, y + 30, 120, 14, NAVY_L)}
    ${bar(x + 36, y + 70, w - 72, 34, "#FBE9CF")}
    ${bar(x + 36, y + 70, (w - 72) * 0.55, 34, ORANGE, "opacity=\"0.55\"")}
  </g>`;
}

function settledTile(x, y, w, h) {
  // Solid fill: "Settled" commission, finalized and payable.
  return `
  <g filter="url(#soft)">
    ${rr(x, y, w, h, 20, NAVY)}
    ${circle(x + 38, y + 38, 12, ORANGE)}
    ${bar(x + 64, y + 30, 120, 14, WHITE)}
    ${rr(x + 36, y + 70, w - 72, 34, 10, ORANGE_DEEP)}
    ${rr(x + 36, y + 70, (w - 72) * 0.82, 34, 10, ORANGE)}
  </g>`;
}

function orderRows(x, y, w) {
  // A small table beneath the tiles, implying the individual-orders list.
  const rowH = 40;
  const rows = [0, 1, 2].map((i) => {
    const ry = y + i * (rowH + 10);
    const dotFill = i === 1 ? ORANGE : NAVY_L;
    return `
    <g>
      ${rr(x, ry, w, rowH, 12, i % 2 === 0 ? WHITE : "#FBF2E2", `stroke="${SLATE_L}" stroke-width="2"`)}
      ${circle(x + 26, ry + rowH / 2, 7, dotFill)}
      ${bar(x + 50, ry + 12, 180, 12, SLATE_L)}
      ${bar(x + w - 140, ry + 12, 100, 12, i === 1 ? ORANGE : NAVY_L)}
    </g>`;
  }).join("");
  return rows;
}

function refreshButton(x, y) {
  // A small pill button with a circular-arrow glyph, implying "Refresh orders."
  return `
  <g filter="url(#soft)">
    ${rr(x, y, 180, 56, 28, ORANGE)}
    <path d="M${x + 38} ${y + 28} a12 12 0 1 1 4 9" fill="none" stroke="${WHITE}" stroke-width="4" stroke-linecap="round"/>
    <path d="M${x + 40} ${y + 24} l3 12 l12 -4" fill="none" stroke="${WHITE}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
    ${bar(x + 66, y + 22, 90, 12, WHITE)}
  </g>`;
}

function scene() {
  const panelX = 430, panelY = 90, panelW = 676, panelH = 760;
  const frameOuter = rr(panelX, panelY, panelW, panelH, 28, "#FBE9CF", `stroke="${SLATE_L}" stroke-width="3" filter="url(#soft)"`);

  const titleBand = `
  <g transform="translate(${panelX + 30},${panelY + 30})">
    ${circle(20, 20, 18, NAVY)}
    ${bar(0, 56, 220, 14, NAVY)}
    ${bar(0, 78, 150, 10, SLATE)}
  </g>`;

  const tileY = panelY + 130;
  const tileH = 150;
  const bigTileW = 300;
  const smallTileW = 162;
  const tileGap = 24;
  const tilesX = panelX + 30;

  const tiles = `
  ${orderCountTile(tilesX, tileY, bigTileW, tileH)}
  ${pendingTile(tilesX + bigTileW + tileGap, tileY, smallTileW, tileH)}
  ${settledTile(tilesX + bigTileW + tileGap * 2 + smallTileW, tileY, smallTileW, tileH)}
  `;

  const rowsY = tileY + tileH + 40;
  const rowsW = panelW - 60;
  const rows = orderRows(tilesX, rowsY, rowsW);

  const refresh = refreshButton(tilesX, rowsY + 3 * 50 + 20);

  const sparkle = (x, y, s = 1) => `
  <g transform="translate(${x},${y}) scale(${s})" fill="${ORANGE}">
    <path d="M0 -22 L6 -6 L22 0 L6 6 L0 22 L-6 6 L-22 0 L-6 -6 Z"/>
  </g>`;

  // Floating small chips outside the panel, implying data arriving from TikTok Shop.
  const orbit = [
    circle(180, 220, 46, PINK, `opacity="0.9"`),
    circle(150, 480, 34, BLUE, `opacity="0.9"`),
    circle(210, 740, 40, "#FDE6C8", `opacity="0.9"`),
    circle(1320, 240, 42, BLUE, `opacity="0.9"`),
    circle(1340, 540, 32, PINK, `opacity="0.9"`),
    circle(1280, 790, 44, "#FDE6C8", `opacity="0.9"`),
  ].join("");

  return `${frameOuter}${titleBand}${tiles}${rows}${refresh}${orbit}${sparkle(panelX + panelW / 2, panelY - 10, 0.9)}${sparkle(1180, 860, 0.7)}${sparkle(300, 860, 0.6)}`;
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
