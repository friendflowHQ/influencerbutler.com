/**
 * Summary: Renders the branded SVG hero (1536x1024) for the blog post
 *   "ads-goldmine-butler-explained" using the locally installed Chrome/Edge
 *   in headless mode (same approach as generate-ai-influencer-butler-hero.mjs).
 *   No API key needed.
 *
 * Scene: a funnel sorting incoming product icons (some carrying a small
 *   "ad" badge, some not) down into a ranked leaderboard of bars, the
 *   top bar circled by a magnifying glass, representing Ads Goldmine
 *   Butler scoring an existing product ledger by ad/promo activity
 *   rather than harvesting anything new.
 *
 * Usage:
 *   node scripts/generate-ads-goldmine-butler-hero.mjs            (skips if PNG exists)
 *   node scripts/generate-ads-goldmine-butler-hero.mjs --force
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const outDir = path.join(repoRoot, "public", "assets", "blog");
const SLUG = "ads-goldmine-butler-explained";

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
const circle = (cx, cy, r, fill, extra = "") => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}" ${extra}/>`;

function productThumb(x, y, s, fill) {
  return `
  <g transform="translate(${x},${y})" filter="url(#soft)">
    ${rr(0, 0, s, s, s * 0.18, WHITE, `stroke="${SLATE_L}" stroke-width="2"`)}
    ${rr(s * 0.18, s * 0.18, s * 0.64, s * 0.64, s * 0.1, fill)}
  </g>`;
}

// Small 4-point sparkle badge, used both as a loose "ad signal" accent and
// clipped onto a falling product icon to mark it as ad-tagged.
function sparkle(x, y, s = 1, fill = ORANGE) {
  return `
  <g transform="translate(${x},${y}) scale(${s})" fill="${fill}">
    <path d="M0 -22 L6 -6 L22 0 L6 6 L0 22 L-6 6 L-22 0 L-6 -6 Z"/>
  </g>`;
}

// A falling product icon, optionally carrying a small ad badge at its
// top-right corner (not every item that falls into the funnel is ad-tagged).
function fallingProduct(x, y, s, fill, tagged) {
  const badge = tagged
    ? `${circle(x + s * 0.92, y + s * 0.08, s * 0.22, ORANGE, `stroke="${WHITE}" stroke-width="2"`)}`
    : "";
  return `${productThumb(x, y, s, fill)}${badge}`;
}

// One leaderboard row: a product thumb, a length-of-bar proportional to
// score, and (for the top row) a small star badge at the bar's end.
function scoreRow(x, y, barMaxW, barW, thumbFill, barFill, starred) {
  const thumbS = 64;
  const star = starred ? sparkle(x + 96 + barW + 22, y + thumbS / 2, 0.55, ORANGE) : "";
  return `
  <g>
    ${productThumb(x, y, thumbS, thumbFill)}
    ${rr(x + 96, y + thumbS / 2 - 15, barW, 30, 15, barFill)}
    ${star}
  </g>`;
}

function magnifier(cx, cy, r) {
  return `
  <g filter="url(#soft)">
    ${circle(cx, cy, r, "none", `stroke="${NAVY}" stroke-width="10" fill-opacity="0"`)}
    <rect x="${cx + r * 0.68}" y="${cy + r * 0.68}" width="22" height="78" rx="11"
      fill="${NAVY}" transform="rotate(45 ${cx + r * 0.68} ${cy + r * 0.68})"/>
  </g>`;
}

function scene() {
  const panelX = 430;
  const panelY = 90;
  const panelW = 676;
  const panelH = 760;
  const innerX = panelX + 30;
  const innerY = panelY + 30;
  const innerW = panelW - 60;
  const cx = innerX + innerW / 2; // 768

  const frameOuter = rr(panelX, panelY, panelW, panelH, 28, WHITE, `stroke="${SLATE_L}" stroke-width="3" filter="url(#soft)"`);
  const frameInner = rr(innerX, innerY, innerW, panelH - 60, 18, "#FBE9CF");

  // Incoming products above the funnel: a mix of ad-tagged and plain items,
  // representing the existing ledger (cc-check + harvested ASINs) rather
  // than anything newly discovered.
  const incoming = [
    fallingProduct(cx - 220, innerY + 20, 62, PINK, true),
    fallingProduct(cx - 70, innerY - 10, 56, BLUE, false),
    fallingProduct(cx + 70, innerY + 10, 60, "#FDE6C8", true),
    fallingProduct(cx + 210, innerY + 30, 54, BLUE, false),
  ].join("");

  // The funnel body narrowing into a spout.
  const funnelTopY = innerY + 110;
  const funnelBotY = funnelTopY + 170;
  const funnel = `
  <path d="M ${cx - 248} ${funnelTopY} L ${cx + 248} ${funnelTopY} L ${cx + 58} ${funnelBotY} L ${cx - 58} ${funnelBotY} Z"
    fill="${NAVY}" opacity="0.92" filter="url(#soft)"/>
  <path d="M ${cx - 248} ${funnelTopY} L ${cx + 248} ${funnelTopY} L ${cx + 220} ${funnelTopY + 26} L ${cx - 220} ${funnelTopY + 26} Z"
    fill="${NAVY_L}"/>
  ${rr(cx - 30, funnelBotY, 60, 70, 14, NAVY)}`;

  // A sorted leaderboard of scored rows beneath the spout: longest/brightest
  // bar on top (highest ad-activity score), shortest and gray on the
  // bottom (catalog-only, no other signal yet).
  const rowsX = innerX + 28;
  const rowsTop = funnelBotY + 110;
  const rows = [
    scoreRow(rowsX, rowsTop, 360, 300, "#FDE6C8", ORANGE, true),
    scoreRow(rowsX, rowsTop + 96, 360, 190, PINK, ORANGE_DEEP, false),
    scoreRow(rowsX, rowsTop + 192, 360, 90, BLUE, SLATE_L, false),
  ].join("");

  const mag = magnifier(rowsX + 96 + 300 - 40, rowsTop + 32, 54);

  return `${frameOuter}${frameInner}${incoming}${funnel}${rows}${mag}${sparkle(panelX + 40, panelY + panelH - 40, 0.6)}${sparkle(panelX + panelW - 30, panelY + 36, 0.55)}`;
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
