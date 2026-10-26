/**
 * Summary: Renders the branded SVG hero (1536x1024) for the blog post
 *   "sheetsyncer-butler-explained" using the locally installed Chrome/Edge
 *   in headless mode (same approach as generate-ai-influencer-butler-hero.mjs).
 *   No API key needed.
 *
 * Scene: a spreadsheet grid panel with rows flowing in from two small source
 *   icons (a post card and a deal tag), representing Facebook Group Builder
 *   posts and Deals Butler auto-syncing into a live Google Sheet.
 *
 * Usage:
 *   node scripts/generate-sheetsyncer-butler-hero.mjs            (skips if PNG exists)
 *   node scripts/generate-sheetsyncer-butler-hero.mjs --force
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const outDir = path.join(repoRoot, "public", "assets", "blog");
const SLUG = "sheetsyncer-butler-explained";

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

function sparkle(x, y, s = 1, fill = ORANGE) {
  return `
  <g transform="translate(${x},${y}) scale(${s})" fill="${fill}">
    <path d="M0 -22 L6 -6 L22 0 L6 6 L0 22 L-6 6 L-22 0 L-6 -6 Z"/>
  </g>`;
}

// A rounded "post card" source icon: a little card with a line of "caption"
// text and a small square "image-idea" chip, representing Facebook Group
// Builder posts.
function postCardIcon(x, y, s) {
  return `
  <g transform="translate(${x},${y})" filter="url(#soft)">
    ${rr(0, 0, s, s * 0.78, s * 0.14, WHITE, `stroke="${SLATE_L}" stroke-width="2"`)}
    ${rr(s * 0.14, s * 0.16, s * 0.2, s * 0.2, s * 0.05, ORANGE)}
    ${bar(s * 0.42, s * 0.18, s * 0.44, s * 0.08, SLATE_L)}
    ${bar(s * 0.14, s * 0.46, s * 0.72, s * 0.08, MIST)}
    ${bar(s * 0.14, s * 0.6, s * 0.5, s * 0.08, MIST)}
  </g>`;
}

// A rounded "deal tag" source icon: a price-tag silhouette with a small
// punch hole, representing Deals Butler (Amazon / Walmart / TikTok Shop).
function dealTagIcon(x, y, s, fill = ORANGE) {
  return `
  <g transform="translate(${x},${y})" filter="url(#soft)">
    <path d="M0 ${s * 0.1} Q0 0 ${s * 0.1} 0 L${s * 0.65} 0 Q${s * 0.75} 0 ${s * 0.8} ${s * 0.08}
      L${s} ${s * 0.4} Q${s * 1.04} ${s * 0.46} ${s} ${s * 0.52}
      L${s * 0.8} ${s * 0.84} Q${s * 0.75} ${s * 0.92} ${s * 0.65} ${s * 0.92}
      L${s * 0.1} ${s * 0.92} Q0 ${s * 0.92} 0 ${s * 0.82} Z" fill="${fill}" />
    ${circle(s * 0.22, s * 0.2, s * 0.08, WHITE)}
  </g>`;
}

// One spreadsheet row: alternating cell-fill rhythm to suggest live rows
// arriving from two different sources, without using any literal text.
function sheetRow(x, y, w, h, fill) {
  const colW = w / 4;
  return `
  ${rr(x, y, w, h, 6, WHITE, `stroke="${SLATE_L}" stroke-width="1.5"`)}
  ${rr(x + colW * 0 + 10, y + h * 0.28, colW * 0.6, h * 0.44, h * 0.2, fill)}
  ${bar(x + colW * 1 + 10, y + h * 0.4, colW * 0.75, h * 0.2, SLATE_L)}
  ${bar(x + colW * 2 + 10, y + h * 0.4, colW * 0.75, h * 0.2, MIST)}
  ${bar(x + colW * 3 + 10, y + h * 0.4, colW * 0.6, h * 0.2, MIST)}
  `;
}

function scene() {
  // Main illustration panel, sized to not overlap the top-left wordmark.
  const panelX = 430;
  const panelY = 90;
  const panelW = 676;
  const panelH = 760;

  const frameOuter = rr(panelX, panelY, panelW, panelH, 28, WHITE, `stroke="${SLATE_L}" stroke-width="3" filter="url(#soft)"`);
  const frameInner = rr(panelX + 30, panelY + 30, panelW - 60, panelH - 60, 18, "#FBE9CF");

  // Header band across the top of the sheet, like a spreadsheet header row.
  const header = `
  <g transform="translate(${panelX + 50},${panelY + 56})">
    ${rr(0, 0, panelW - 100, 56, 12, NAVY)}
    ${circle(30, 28, 12, ORANGE)}
    ${bar(56, 20, 180, 10, WHITE)}
    ${bar(56, 36, 120, 8, SLATE_L)}
  </g>`;

  // Grid of rows flowing down the sheet, alternating accent color to
  // suggest two sources interleaving (posts + deals).
  const rowX = panelX + 50;
  const rowW = panelW - 100;
  const rowH = 58;
  const rowGap = 14;
  const rowsTop = panelY + 140;
  const fills = [ORANGE, BLUE, ORANGE, PINK, ORANGE, BLUE, ORANGE];
  const rows = fills
    .map((fill, i) => sheetRow(rowX, rowsTop + i * (rowH + rowGap), rowW, rowH, fill))
    .join("");

  // Two source icons sitting above the panel, with curved dotted
  // connectors flowing down into the top of the grid.
  const postIcon = postCardIcon(220, 140, 150);
  const dealIcon = dealTagIcon(1170, 150, 140, ORANGE_DEEP);

  const connectorPost = `
  <path d="M 300 240 Q 380 300 460 320" fill="none" stroke="${ORANGE_DEEP}" stroke-width="3"
    stroke-dasharray="2 14" stroke-linecap="round" />`;
  const connectorDeal = `
  <path d="M 1200 250 Q 1140 300 1080 320" fill="none" stroke="${NAVY_L}" stroke-width="3"
    stroke-dasharray="2 14" stroke-linecap="round" />`;

  // Small floating dots trailing from each source toward the grid, implying
  // rows actively arriving rather than a static illustration.
  const dots = [
    circle(400, 280, 7, ORANGE_DEEP, "opacity=\"0.6\""),
    circle(430, 300, 5, ORANGE_DEEP, "opacity=\"0.4\""),
    circle(1120, 285, 7, NAVY_L, "opacity=\"0.6\""),
    circle(1095, 305, 5, NAVY_L, "opacity=\"0.4\""),
  ].join("");

  return `${connectorPost}${connectorDeal}${dots}${frameOuter}${frameInner}${header}${rows}${postIcon}${dealIcon}${sparkle(768, 886, 0.7)}${sparkle(340, 200, 0.5)}${sparkle(1230, 820, 0.6)}`;
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
