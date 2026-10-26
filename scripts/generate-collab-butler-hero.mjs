/**
 * Summary: Renders the branded SVG hero (1536x1024) for the blog post
 *   "collab-butler-explained" using the locally installed Chrome/Edge
 *   in headless mode (same approach as generate-ai-influencer-butler-hero.mjs).
 *   No API key needed.
 *
 * Scene: a simple Kanban board with a few columns and cards, one card
 *   carrying a dollar-sign payout chip, representing Collab Butler's
 *   brand-collab tracking board.
 *
 * Usage:
 *   node scripts/generate-collab-butler-hero.mjs            (skips if PNG exists)
 *   node scripts/generate-collab-butler-hero.mjs --force
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const outDir = path.join(repoRoot, "public", "assets", "blog");
const SLUG = "collab-butler-explained";

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
const GREEN = "#BFE3CE";

const rr = (x, y, w, h, r, fill, extra = "") =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${fill}" ${extra}/>`;
const bar = (x, y, w, h = 12, fill = SLATE_L) => rr(x, y, w, h, h / 2, fill);
const circle = (cx, cy, r, fill, extra = "") => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}" ${extra}/>`;

function chip(x, y, w, h, fill, textFill) {
  return `
  <g transform="translate(${x},${y})" filter="url(#soft)">
    ${rr(0, 0, w, h, h / 2, fill)}
  </g>`;
}

function card(x, y, w, h, accent, opts = {}) {
  const { tagColor = null, payout = false, avatar = true } = opts;
  const parts = [];
  parts.push(`<g transform="translate(${x},${y})" filter="url(#soft)">`);
  parts.push(rr(0, 0, w, h, 16, WHITE, `stroke="${SLATE_L}" stroke-width="2"`));
  parts.push(rr(0, 0, 8, h, 4, accent));
  if (avatar) parts.push(circle(32, 30, 14, accent, `opacity="0.85"`));
  parts.push(bar(56, 20, w - 76, 12, NAVY_L));
  parts.push(bar(56, 40, w - 100, 9, SLATE_L));
  if (tagColor) parts.push(rr(24, h - 34, 56, 18, 9, tagColor));
  if (payout) {
    parts.push(circle(w - 32, h - 25, 18, ORANGE_DEEP));
    parts.push(`<text x="${w - 32}" y="${h - 19}" font-size="18" font-weight="700" fill="${WHITE}" text-anchor="middle">$</text>`);
  }
  parts.push(`</g>`);
  return parts.join("");
}

function column(x, y, w, h, label, labelColor, cards) {
  const parts = [];
  parts.push(rr(x, y, w, h, 20, "#FBE9CF"));
  parts.push(circle(x + 30, y + 34, 8, labelColor));
  parts.push(bar(x + 48, y + 26, w - 72, 16, NAVY_L));
  cards.forEach((c, i) => {
    parts.push(card(x + 18, y + 70 + i * 134, w - 36, 108, c.accent, c));
  });
  return parts.join("");
}

function scene() {
  const boardBg = rr(120, 140, 1296, 760, 24, "#FDEFD8", `stroke="${SLATE_L}" stroke-width="2"`);

  const col1 = column(160, 180, 290, 680, "Negotiating", ORANGE, [
    { accent: BLUE, tagColor: BLUE },
    { accent: PINK, tagColor: PINK },
  ]);

  const col2 = column(480, 180, 290, 680, "In Progress", NAVY, [
    { accent: GREEN, tagColor: GREEN, payout: true },
    { accent: BLUE },
  ]);

  const col3 = column(800, 180, 290, 680, "Submitted", ORANGE_DEEP, [
    { accent: PINK, payout: true },
  ]);

  const col4 = column(1120, 180, 256, 680, "Published", NAVY_L, [
    { accent: GREEN, tagColor: GREEN },
  ]);

  const sparkle = (x, y, s = 1) => `
  <g transform="translate(${x},${y}) scale(${s})" fill="${ORANGE}">
    <path d="M0 -22 L6 -6 L22 0 L6 6 L0 22 L-6 6 L-22 0 L-6 -6 Z"/>
  </g>`;

  return `${boardBg}${col1}${col2}${col3}${col4}${sparkle(1320, 150, 0.8)}${sparkle(170, 880, 0.6)}`;
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
