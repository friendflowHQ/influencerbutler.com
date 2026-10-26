/**
 * Summary: Renders the branded SVG hero (1536x1024) for the blog post
 *   "reach-booster-explained" using the locally installed Chrome/Edge
 *   in headless mode (same approach as generate-desktop-vs-cloud-hero.mjs).
 *   No API key needed.
 *
 * Scene: a vertical video-frame icon being transformed (via a curved orange
 *   arrow) into a horizontal video frame, a magnifying-glass "diagnose" icon
 *   overlapping its corner, an upward boost arrow above it, a small countdown
 *   ring near its base, and a stack of flagged "item row" cards in the
 *   background, representing items being found, diagnosed, fixed, and
 *   verified again.
 *
 * Usage:
 *   node scripts/generate-reach-booster-hero.mjs            (skips if PNG exists)
 *   node scripts/generate-reach-booster-hero.mjs --force
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const outDir = path.join(repoRoot, "public", "assets", "blog");
const SLUG = "reach-booster-explained";

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

function playTriangle(cx, cy, s, fill) {
  return `<path d="M${cx - s * 0.4} ${cy - s * 0.62} L${cx + s * 0.72} ${cy} L${cx - s * 0.4} ${cy + s * 0.62} Z" fill="${fill}"/>`;
}

function videoFrame(x, y, w, h, bodyFill) {
  // A rounded card with an inner "screen" and a centered play triangle,
  // representing a piece of flagged video/photo content.
  return `
  <g transform="translate(${x},${y})" filter="url(#soft)">
    ${rr(0, 0, w, h, h * 0.14, WHITE, `stroke="${SLATE_L}" stroke-width="3"`)}
    ${rr(w * 0.09, h * 0.09, w * 0.82, h * 0.82, h * 0.09, bodyFill)}
    ${playTriangle(w / 2, h / 2, Math.min(w, h) * 0.34, WHITE)}
  </g>`;
}

function magnifier(cx, cy, r, color) {
  // A simple diagnose / search glass icon.
  return `
  <g transform="translate(${cx},${cy})" filter="url(#soft)">
    ${circle(0, 0, r, WHITE, `stroke="${color}" stroke-width="10"`)}
    <line x1="${r * 0.68}" y1="${r * 0.68}" x2="${r * 1.55}" y2="${r * 1.55}" stroke="${color}" stroke-width="14" stroke-linecap="round"/>
  </g>`;
}

function boostArrow(cx, cy, s, color) {
  // An upward "boost" arrow, implying improved reach / placement.
  const points = [
    [0, -s],
    [s * 0.85, -s * 0.15],
    [s * 0.32, -s * 0.15],
    [s * 0.32, s],
    [-s * 0.32, s],
    [-s * 0.32, -s * 0.15],
    [-s * 0.85, -s * 0.15],
  ]
    .map(([px, py]) => `${px},${py}`)
    .join(" ");
  return `<polygon transform="translate(${cx},${cy})" points="${points}" fill="${color}"/>`;
}

function curvedArrow(x1, y1, x2, y2, color) {
  // A gentle curved connector showing the vertical clip being turned horizontal.
  const midX = (x1 + x2) / 2;
  const midY = Math.min(y1, y2) - 60;
  return `
  <path d="M${x1} ${y1} Q ${midX} ${midY} ${x2} ${y2}" fill="none" stroke="${color}" stroke-width="7" stroke-linecap="round" stroke-dasharray="2 16"/>
  <path d="M${x2 - 22} ${y2 - 14} L${x2} ${y2} L${x2 - 22} ${y2 + 14}" fill="none" stroke="${color}" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>`;
}

function clockRing(cx, cy, r, color, pct = 0.65) {
  // A partial progress ring standing in for the 48-hour recheck countdown.
  const circumference = 2 * Math.PI * r;
  const dash = circumference * pct;
  return `
  <g transform="translate(${cx},${cy})" filter="url(#soft)">
    ${circle(0, 0, r, WHITE, `stroke="${SLATE_L}" stroke-width="10"`)}
    <circle cx="0" cy="0" r="${r}" fill="none" stroke="${color}" stroke-width="10" stroke-dasharray="${dash} ${circumference}" stroke-linecap="round" transform="rotate(-90)"/>
    <line x1="0" y1="0" x2="0" y2="${-r * 0.55}" stroke="${NAVY}" stroke-width="6" stroke-linecap="round"/>
    <line x1="0" y1="0" x2="${r * 0.35}" y2="0" stroke="${NAVY}" stroke-width="6" stroke-linecap="round"/>
  </g>`;
}

function itemRow(x, y, w, dotColor) {
  // A flagged-item row card, standing in for the Reach Booster table.
  return `
  <g transform="translate(${x},${y})" filter="url(#soft)">
    ${rr(0, 0, w, 64, 16, WHITE, `stroke="${SLATE_L}" stroke-width="2"`)}
    ${circle(32, 32, 10, dotColor)}
    ${bar(60, 20, w - 100, 12, SLATE_L)}
    ${bar(60, 42, w * 0.4, 10, MIST)}
  </g>`;
}

function scene() {
  // Background: a stack of flagged-item rows, implying the Reach Booster
  // table fed by both the extension and the active scan engine.
  const rows = [
    itemRow(120, 250, 330, ORANGE),
    itemRow(150, 334, 330, ORANGE),
    itemRow(110, 418, 330, NAVY_L),
    itemRow(160, 502, 330, "#9CC6A6"),
    itemRow(125, 586, 330, ORANGE),
  ].join("");

  // A small vertical clip (the problem) turning into a wide horizontal
  // clip (the fix), connected by a curved "blur-fill" arrow.
  const verticalClip = videoFrame(660, 330, 150, 250, SLATE_L);
  const arrow = curvedArrow(830, 420, 955, 420, ORANGE_DEEP);
  const horizontalClip = videoFrame(970, 300, 430, 300, ORANGE);

  const diagnoseGlass = magnifier(1360, 300, 58, NAVY);
  const boost = boostArrow(1185, 210, 46, ORANGE_DEEP);
  const countdown = clockRing(1000, 660, 60, ORANGE);

  const sparkle = (x, y, s = 1) => `
  <g transform="translate(${x},${y}) scale(${s})" fill="${ORANGE}">
    <path d="M0 -22 L6 -6 L22 0 L6 6 L0 22 L-6 6 L-22 0 L-6 -6 Z"/>
  </g>`;

  return `${rows}${verticalClip}${arrow}${horizontalClip}${diagnoseGlass}${boost}${countdown}${sparkle(1430, 560, 0.7)}${sparkle(560, 760, 0.6)}`;
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
