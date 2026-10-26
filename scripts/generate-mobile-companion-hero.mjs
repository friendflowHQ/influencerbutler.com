/**
 * Summary: Renders the branded SVG hero (1536x1024) for the blog post
 *   "mobile-companion-explained" using the locally installed Chrome/Edge
 *   in headless mode (same approach as generate-desktop-vs-cloud-hero.mjs).
 *   No API key needed.
 *
 * Scene: a geometric phone outline showing a QR code glyph on its screen,
 *   connected by a dashed line to a small desktop/laptop icon, with a
 *   curved share arrow nearby, representing QR pairing and sharing a link
 *   from the phone into the desktop app.
 *
 * Usage:
 *   node scripts/generate-mobile-companion-hero.mjs            (skips if PNG exists)
 *   node scripts/generate-mobile-companion-hero.mjs --force
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const outDir = path.join(repoRoot, "public", "assets", "blog");
const SLUG = "mobile-companion-explained";

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

function qrGlyph(x, y, s, fill = NAVY) {
  // Abstract QR-code glyph: three "finder" corner squares plus scattered
  // modules, not a scannable code, just a recognizable visual shorthand.
  const cell = s / 7;
  const finder = (fx, fy) => `
    ${rr(fx, fy, cell * 2.6, cell * 2.6, cell * 0.4, fill)}
    ${rr(fx + cell * 0.5, fy + cell * 0.5, cell * 1.6, cell * 1.6, cell * 0.3, WHITE)}
    ${rr(fx + cell * 1, fy + cell * 1, cell * 0.6, cell * 0.6, cell * 0.15, fill)}`;
  const modules = [
    [3.2, 0.2], [4.4, 0.6], [3.2, 1.4], [5.2, 2.4], [3.4, 3.2],
    [1.2, 3.6], [4.2, 4.4], [3.2, 5.4], [5.0, 5.4], [1.6, 5.0],
  ]
    .map(([mx, my]) => rr(x + mx * cell, y + my * cell, cell * 0.72, cell * 0.72, cell * 0.14, fill))
    .join("");
  return `
  <g>
    ${rr(x - cell * 0.4, y - cell * 0.4, s + cell * 0.8, s + cell * 0.8, cell * 0.5, WHITE)}
    ${finder(x + cell * 0.2, y + cell * 0.2)}
    ${finder(x + s - cell * 2.8, y + cell * 0.2)}
    ${finder(x + cell * 0.2, y + s - cell * 2.8)}
    ${modules}
  </g>`;
}

function phoneGlyph(x, y, w, h) {
  const pad = w * 0.09;
  return `
  <g filter="url(#soft)">
    ${rr(x, y, w, h, w * 0.22, NAVY)}
    ${rr(x + pad, y + pad * 1.2, w - pad * 2, h - pad * 2.4, w * 0.12, CREAM)}
    ${circle(x + w / 2, y + h - pad * 0.8, w * 0.035, NAVY_L)}
  </g>`;
}

function laptopGlyph(x, y, w, h) {
  const screenH = h * 0.74;
  return `
  <g filter="url(#soft)">
    ${rr(x, y, w, screenH, w * 0.07, NAVY)}
    ${rr(x + w * 0.07, y + w * 0.07, w * 0.86, screenH - w * 0.14, w * 0.04, NAVY_L)}
    ${rr(x + w * 0.16, y + w * 0.18, w * 0.68, screenH - w * 0.36, w * 0.03, ORANGE, "opacity=\"0.9\"")}
    ${rr(x - w * 0.1, y + screenH, w * 1.2, h - screenH, w * 0.06, SLATE_L)}
  </g>`;
}

function appIcon(x, y, s) {
  return `
  <g filter="url(#soft)">
    ${rr(x, y, s, s, s * 0.28, ORANGE)}
    ${circle(x + s * 0.5, y + s * 0.42, s * 0.16, WHITE)}
    ${rr(x + s * 0.3, y + s * 0.6, s * 0.4, s * 0.12, s * 0.06, WHITE)}
  </g>`;
}

function scene() {
  const frameOuter = rr(430, 90, 676, 760, 28, WHITE, `stroke="${SLATE_L}" stroke-width="3" filter="url(#soft)"`);
  const frameInner = rr(460, 120, 616, 700, 18, "#FBE9CF");

  const headerBar = `
  <g transform="translate(490,150)">
    ${rr(0, 0, 556, 56, 14, NAVY)}
    ${circle(30, 28, 13, ORANGE)}
    ${bar(56, 20, 220, 12, WHITE)}
    ${bar(56, 38, 130, 8, SLATE_L)}
  </g>`;

  const phoneX = 520, phoneY = 280, phoneW = 220, phoneH = 430;
  const phone = phoneGlyph(phoneX, phoneY, phoneW, phoneH);
  const qr = qrGlyph(phoneX + phoneW * 0.14, phoneY + phoneH * 0.14, phoneW * 0.72, NAVY);

  const laptopX = 790, laptopY = 470, laptopW = 270, laptopH = 210;
  const laptop = laptopGlyph(laptopX, laptopY, laptopW, laptopH);

  // Dashed connector between the paired phone and the desktop app, with a
  // couple of small dots along it suggesting data moving between them.
  const lineX1 = phoneX + phoneW, lineY1 = phoneY + phoneH * 0.42;
  const lineX2 = laptopX, lineY2 = laptopY + laptopH * 0.3;
  const connector = `
    <line x1="${lineX1}" y1="${lineY1}" x2="${lineX2}" y2="${lineY2}" stroke="${ORANGE_DEEP}" stroke-width="6" stroke-dasharray="2 18" stroke-linecap="round"/>
    ${circle(lineX1 + (lineX2 - lineX1) * 0.35, lineY1 + (lineY2 - lineY1) * 0.35, 7, ORANGE)}
    ${circle(lineX1 + (lineX2 - lineX1) * 0.7, lineY1 + (lineY2 - lineY1) * 0.7, 7, ORANGE)}`;

  // A small app icon above the phone with a curved share-arrow pointing
  // down into the phone's screen, representing a native share-sheet send.
  const icon = appIcon(486, 200, 64);
  const arrowDefs = `<defs><marker id="arrowhead" markerWidth="9" markerHeight="9" refX="5.5" refY="4.5" orient="auto"><path d="M0,0 L9,4.5 L0,9 Z" fill="${ORANGE_DEEP}"/></marker></defs>`;
  const shareArrow = `<path d="M520,248 Q585,296 620,312" fill="none" stroke="${ORANGE_DEEP}" stroke-width="6" stroke-linecap="round" marker-end="url(#arrowhead)"/>`;

  // Floating chips orbiting outside the frame, echoing the brand's small
  // product-card motif without implying a literal screenshot.
  const orbit = [
    productThumb(150, 200, 90, PINK),
    productThumb(170, 480, 70, BLUE),
    productThumb(110, 760, 80, "#FDE6C8"),
    productThumb(1300, 220, 80, BLUE),
    productThumb(1330, 520, 70, PINK),
    productThumb(1270, 790, 90, "#FDE6C8"),
  ].join("");

  const sparkle = (x, y, s = 1) => `
  <g transform="translate(${x},${y}) scale(${s})" fill="${ORANGE}">
    <path d="M0 -22 L6 -6 L22 0 L6 6 L0 22 L-6 6 L-22 0 L-6 -6 Z"/>
  </g>`;

  return `${arrowDefs}${frameOuter}${frameInner}${headerBar}${connector}${laptop}${phone}${qr}${icon}${shareArrow}${orbit}${sparkle(768, 110, 1)}${sparkle(1180, 860, 0.7)}${sparkle(340, 860, 0.6)}`;
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
