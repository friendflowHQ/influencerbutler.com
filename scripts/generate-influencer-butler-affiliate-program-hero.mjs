/**
 * Summary: Renders the branded SVG hero (1536x1024) for the blog post
 *   "influencer-butler-affiliate-program-explained" using the locally
 *   installed Chrome/Edge in headless mode (same approach as
 *   generate-ai-influencer-butler-hero.mjs). No API key needed.
 *
 * Scene: a referral-link chain connecting two simple profile circles inside
 *   a branded dashboard panel, with a percent badge and a coin/payout glyph
 *   and a small rising sparkline, representing the affiliate program's
 *   referral link, recurring commission rate, and payout dashboard.
 *
 * Usage:
 *   node scripts/generate-influencer-butler-affiliate-program-hero.mjs            (skips if PNG exists)
 *   node scripts/generate-influencer-butler-affiliate-program-hero.mjs --force
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const outDir = path.join(repoRoot, "public", "assets", "blog");
const SLUG = "influencer-butler-affiliate-program-explained";

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

function profileFigure(cx, cy, bodyFill, headFill = "#F2D3B8") {
  // Simple geometric "creator" avatar: head + shoulders, not a literal face.
  return `
  <g transform="translate(${cx},${cy})">
    ${circle(0, -58, 40, headFill)}
    ${rr(-56, -14, 112, 96, 40, bodyFill)}
  </g>`;
}

function chainLink(cx, cy, scale = 1) {
  // Two interlocked rounded-rect links standing in for a referral link/URL.
  return `
  <g transform="translate(${cx},${cy}) scale(${scale})">
    <rect x="-46" y="-20" width="64" height="40" rx="20" fill="none" stroke="${ORANGE_DEEP}" stroke-width="14" transform="rotate(-20)"/>
    <rect x="-18" y="-20" width="64" height="40" rx="20" fill="none" stroke="${ORANGE}" stroke-width="14" transform="rotate(-20)"/>
  </g>`;
}

function percentBadge(cx, cy) {
  // Abstract percent glyph (two dots + a diagonal bar) inside a circle badge,
  // standing in for the commission rate without spelling out a number.
  return `
  <g transform="translate(${cx},${cy})" filter="url(#soft)">
    ${circle(0, 0, 54, WHITE, `stroke="${SLATE_L}" stroke-width="3"`)}
    <line x1="-22" y1="22" x2="22" y2="-22" stroke="${NAVY}" stroke-width="10" stroke-linecap="round"/>
    ${circle(-22, -18, 10, ORANGE)}
    ${circle(22, 18, 10, NAVY_L)}
  </g>`;
}

function coinStack(cx, cy) {
  // Abstract stacked coins standing in for a recurring payout.
  return `
  <g transform="translate(${cx},${cy})" filter="url(#soft)">
    <ellipse cx="0" cy="26" rx="54" ry="20" fill="${ORANGE_DEEP}"/>
    <ellipse cx="0" cy="8" rx="54" ry="20" fill="${ORANGE}"/>
    <ellipse cx="0" cy="-10" rx="54" ry="20" fill="#FBBF4A"/>
    <circle cx="0" cy="-10" r="14" fill="none" stroke="${WHITE}" stroke-width="5" opacity="0.8"/>
  </g>`;
}

function sparklineChart(x, y, w, h) {
  const pts = [0, 0.7, 0.45, 0.8, 0.6, 1, 0.78, 1.15];
  const stepX = w / (pts.length - 1);
  const coords = pts.map((p, i) => [x + i * stepX, y + h - p * h]);
  const path = coords.map((c, i) => `${i === 0 ? "M" : "L"}${c[0].toFixed(1)} ${c[1].toFixed(1)}`).join(" ");
  const dots = coords
    .map(([cx, cy], i) => circle(cx, cy, i === coords.length - 1 ? 9 : 6, i === coords.length - 1 ? ORANGE : SLATE_L))
    .join("");
  return `
  <g>
    <path d="${path}" fill="none" stroke="${ORANGE}" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>
    ${dots}
  </g>`;
}

function scene() {
  const frameOuter = rr(430, 90, 676, 760, 28, WHITE, `stroke="${SLATE_L}" stroke-width="3" filter="url(#soft)"`);
  const frameInner = rr(460, 120, 616, 640, 18, "#FBE9CF");

  const titleBand = `
  <g transform="translate(460,150)">
    ${rr(0, 0, 616, 72, 14, NAVY)}
    ${circle(36, 36, 16, ORANGE)}
    ${bar(66, 24, 260, 14, WHITE)}
    ${bar(66, 46, 160, 10, SLATE_L)}
  </g>`;

  // Two creators, linked by a referral chain, inside the dashboard panel.
  const creatorA = profileFigure(610, 430, NAVY);
  const creatorB = profileFigure(930, 430, NAVY_L);
  const link = chainLink(770, 400, 1.15);

  const percent = percentBadge(900, 300);
  const coins = coinStack(640, 300);

  // A small "referral activity" sparkline near the bottom of the panel,
  // echoing the dashboard's own activity chart.
  const chartCard = rr(500, 560, 536, 150, 16, WHITE, `stroke="${SLATE_L}" stroke-width="2"`);
  const chart = sparklineChart(540, 600, 456, 80);

  // Floating chain + dot "link" motifs orbiting outside the frame, implying
  // the link being shared across different places.
  const orbitLinks = [
    chainLink(150, 220, 0.8),
    chainLink(1330, 260, 0.7),
    chainLink(170, 740, 0.7),
    chainLink(1300, 760, 0.85),
  ].join("");
  const orbitDots = [
    circle(260, 420, 14, "#FDE6C8"),
    circle(1250, 460, 16, PINK),
    circle(300, 860, 12, BLUE),
  ].join("");

  const sparkle = (x, y, s = 1) => `
  <g transform="translate(${x},${y}) scale(${s})" fill="${ORANGE}">
    <path d="M0 -22 L6 -6 L22 0 L6 6 L0 22 L-6 6 L-22 0 L-6 -6 Z"/>
  </g>`;

  return `${frameOuter}${frameInner}${titleBand}${chartCard}${chart}${creatorA}${creatorB}${link}${percent}${coins}${orbitLinks}${orbitDots}${sparkle(768, 110, 1)}${sparkle(1180, 860, 0.7)}${sparkle(340, 860, 0.6)}`;
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
