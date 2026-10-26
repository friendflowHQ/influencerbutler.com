/**
 * Summary: Renders the branded SVG hero (1536x1024) for the blog post
 *   "earnings-intelligence-explained" using the locally installed Chrome/Edge
 *   in headless mode (same approach as generate-desktop-vs-cloud-hero.mjs).
 *   No API key needed.
 *
 * Scene: an abstract dashboard panel with a header bar, three summary tiles,
 *   and a bar chart, one bar highlighted green for a strong earner and one
 *   bar flagged with a small warning dot for a dead/zero-commission link,
 *   plus a mini line chart with a magnifying glass over it, representing
 *   the "what actually earned, not just clicked" read of Earnings Intelligence.
 *
 * Usage:
 *   node scripts/generate-earnings-intelligence-hero.mjs            (skips if PNG exists)
 *   node scripts/generate-earnings-intelligence-hero.mjs --force
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const outDir = path.join(repoRoot, "public", "assets", "blog");
const SLUG = "earnings-intelligence-explained";

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
const GREEN = "#10B981";

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

function scene() {
  const sparkle = (x, y, s = 1) => `
  <g transform="translate(${x},${y}) scale(${s})" fill="${ORANGE}">
    <path d="M0 -22 L6 -6 L22 0 L6 6 L0 22 L-6 6 L-22 0 L-6 -6 Z"/>
  </g>`;

  // The dashboard card itself, sized to clear the wordmark top-left.
  const panel = rr(430, 90, 676, 780, 28, WHITE, `stroke="${SLATE_L}" stroke-width="3" filter="url(#soft)"`);

  // Header bar: window dots on the left, filter "pills" on the right.
  const header = `
  <g transform="translate(460,120)">
    ${rr(0, 0, 616, 64, 14, NAVY)}
    ${circle(28, 32, 9, ORANGE)}
    ${circle(56, 32, 9, "#F2D3B8")}
    ${circle(84, 32, 9, SLATE_L)}
    ${bar(430, 18, 150, 12, SLATE_L)}
    ${bar(430, 36, 100, 10, "#5A6B91")}
  </g>`;

  // Three summary tiles (total commission / units / ASIN count).
  const tiles = [0, 1, 2]
    .map((i) => {
      const x = 460 + i * 213;
      return `
      <g transform="translate(${x},200)">
        ${rr(0, 0, 189, 86, 16, "#FBE9CF")}
        ${circle(30, 43, 17, i === 0 ? GREEN : ORANGE)}
        ${bar(58, 26, 110, 12, NAVY_L)}
        ${bar(58, 48, 78, 9, SLATE_L)}
      </g>`;
    })
    .join("");

  // Mini line chart card, tucked above the right side of the bar chart,
  // with a magnifying glass resting over its trend line.
  const lineCard = `
  <g transform="translate(790,316)">
    ${rr(0, 0, 286, 150, 18, "#FBE9CF")}
    <polyline points="20,116 64,82 108,98 152,48 196,68 248,26" fill="none" stroke="${NAVY}" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>
    ${circle(248, 26, 8, GREEN)}
  </g>
  <g transform="translate(900,366)">
    <circle cx="0" cy="0" r="44" fill="none" stroke="${NAVY}" stroke-width="11"/>
    <circle cx="0" cy="0" r="44" fill="none" stroke="${ORANGE}" stroke-width="4" stroke-dasharray="5 10"/>
    <line x1="31" y1="31" x2="74" y2="74" stroke="${NAVY}" stroke-width="13" stroke-linecap="round"/>
  </g>`;

  // Bar chart: six ASIN bars, one highlighted green (high EPC), one flagged
  // with a small warning dot (a post that went dead and stopped earning).
  const baseline = 780;
  const chartX = 483;
  const barW = 70;
  const gap = 30;
  const heights = [90, 170, 55, 230, 75, 130];
  const colors = [SLATE_L, NAVY_L, SLATE_L, GREEN, SLATE_L, NAVY_L];
  const flaggedIndex = 2;
  const bars = heights
    .map((h, i) => {
      const x = chartX + i * (barW + gap);
      const y = baseline - h;
      let flag = "";
      if (i === flaggedIndex) {
        flag = `
        ${circle(x + barW / 2, y - 24, 13, ORANGE)}
        ${rr(x + barW / 2 - 2.2, y - 30, 4.4, 11, 2.2, WHITE)}
        ${circle(x + barW / 2, y - 13, 2.2, WHITE)}`;
      }
      return `${rr(x, y, barW, h, 12, colors[i])}${flag}`;
    })
    .join("");
  const baselineRule = bar(chartX - 10, baseline + 2, heights.length * (barW + gap) - gap + 20, 4, "#DCE3EC");

  return `${panel}${header}${tiles}${baselineRule}${bars}${lineCard}${sparkle(768, 110, 0.8)}${sparkle(1150, 860, 0.7)}${sparkle(380, 860, 0.6)}`;
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
