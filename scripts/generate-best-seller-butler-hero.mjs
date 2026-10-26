/**
 * Summary: Renders the branded SVG hero (1536x1024) for the blog post
 *   "best-seller-butler-explained" using the locally installed Chrome/Edge
 *   in headless mode (same approach as generate-desktop-vs-cloud-hero.mjs).
 *   No API key needed.
 *
 * Scene: a trophy with a ribbon inside a branded picture frame, next to a
 *   ranked leaderboard of simple product thumbnails with decreasing score
 *   bars, representing engagement scoring that promotes winners into an
 *   always-post list.
 *
 * Usage:
 *   node scripts/generate-best-seller-butler-hero.mjs            (skips if PNG exists)
 *   node scripts/generate-best-seller-butler-hero.mjs --force
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const outDir = path.join(repoRoot, "public", "assets", "blog");
const SLUG = "best-seller-butler-explained";

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

function trophy(cx, cy) {
  // Simple geometric trophy with a ribbon hanging off the base, not a literal icon.
  return `
  <g transform="translate(${cx},${cy})">
    ${circle(0, -70, 70, ORANGE)}
    ${rr(-70, -70, 140, 60, 16, ORANGE)}
    ${circle(-82, -48, 24, "none", `stroke="${ORANGE_DEEP}" stroke-width="12"`)}
    ${circle(82, -48, 24, "none", `stroke="${ORANGE_DEEP}" stroke-width="12"`)}
    ${rr(-16, -12, 32, 54, 10, ORANGE_DEEP)}
    ${rr(-56, 40, 112, 22, 10, ORANGE_DEEP)}
    ${rr(-70, 60, 140, 18, 8, NAVY)}
    <path d="M-14 78 L14 78 L30 130 L0 110 L-30 130 Z" fill="${ORANGE_DEEP}"/>
  </g>`;
}

/** One leaderboard row: a product thumbnail next to a score bar whose length ranks it. */
function leaderboardRow(x, y, thumbSize, barWidth, thumbFill) {
  const barY = y + thumbSize / 2 - 6;
  const barX = x + thumbSize + 24;
  return `${productThumb(x, y, thumbSize, thumbFill)}${bar(barX, barY, barWidth, 12, SLATE_L)}`;
}

function scene() {
  const frameOuter = rr(430, 90, 676, 760, 28, WHITE, `stroke="${SLATE_L}" stroke-width="3" filter="url(#soft)"`);
  const frameInner = rr(460, 120, 616, 640, 18, "#FBE9CF");

  const trophyGlyph = trophy(768, 260);

  const rows = [
    leaderboardRow(510, 430, 84, 380, PINK),
    leaderboardRow(510, 562, 72, 300, BLUE),
    leaderboardRow(510, 682, 60, 220, "#FDE6C8"),
  ].join("");

  // Floating product chips orbiting outside the frame, implying "pulled from real posts."
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

  return `${frameOuter}${frameInner}${trophyGlyph}${rows}${orbit}${sparkle(1040, 160, 1)}${sparkle(1180, 860, 0.7)}${sparkle(340, 860, 0.6)}`;
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
