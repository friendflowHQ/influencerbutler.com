/**
 * Summary: Renders the branded SVG hero (1536x1024) for the blog post
 *   "community-share-butler-explained" using the locally installed Chrome/Edge
 *   in headless mode (same approach as generate-desktop-vs-cloud-hero.mjs).
 *   No API key needed.
 *
 * Scene: a small cluster of group/people icon cards scattered around a
 *   rules document, with a magnifying glass reading the document, and one
 *   group card circled in green to mark it as a safe, compliant match.
 *
 * Usage:
 *   node scripts/generate-community-share-butler-hero.mjs            (skips if PNG exists)
 *   node scripts/generate-community-share-butler-hero.mjs --force
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const outDir = path.join(repoRoot, "public", "assets", "blog");
const SLUG = "community-share-butler-explained";

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
const GREEN = "#86C999";
const GREEN_DEEP = "#4D9A68";

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

function groupCard(cx, cy, s = 1, ringColor = null) {
  // A small "Facebook group" card: rounded square, three tiny member dots,
  // and a short name bar, optionally circled to mark a confirmed match.
  const w = 150 * s;
  const h = 110 * s;
  const ring = ringColor
    ? circle(0, 0, Math.max(w, h) * 0.72, "none", `stroke="${ringColor}" stroke-width="${6 * s}" stroke-dasharray="${10 * s} ${8 * s}"`)
    : "";
  return `
  <g transform="translate(${cx},${cy})" filter="url(#soft)">
    ${ring}
    <g transform="translate(${-w / 2},${-h / 2})">
      ${rr(0, 0, w, h, 16 * s, WHITE, `stroke="${SLATE_L}" stroke-width="${2 * s}"`)}
      ${circle(28 * s, 30 * s, 13 * s, BLUE)}
      ${circle(46 * s, 30 * s, 13 * s, PINK)}
      ${circle(64 * s, 30 * s, 13 * s, "#FDE6C8")}
      ${bar(16 * s, 58 * s, w - 32 * s, 10 * s, MIST)}
      ${bar(16 * s, 76 * s, (w - 32 * s) * 0.55, 8 * s, SLATE_L)}
    </g>
  </g>`;
}

function rulesDocument(cx, cy) {
  const w = 300;
  const h = 360;
  const lineColor = (i) => (i === 3 ? ORANGE : SLATE_L);
  const lines = [0, 1, 2, 3, 4, 5, 6].map((i) =>
    bar(28, 86 + i * 32, i === 3 ? w - 56 : w - 56 - (i % 2) * 40, 12, lineColor(i))
  ).join("");
  return `
  <g transform="translate(${cx - w / 2},${cy - h / 2})" filter="url(#soft)">
    ${rr(0, 0, w, h, 20, WHITE, `stroke="${SLATE_L}" stroke-width="3"`)}
    ${rr(0, 0, w, 56, 20, NAVY)}
    ${rr(0, 36, w, 20, 0, NAVY)}
    ${circle(32, 28, 10, ORANGE)}
    ${bar(56, 20, 140, 16, WHITE)}
    ${lines}
    <g transform="translate(${28 + 30},${86 + 3 * 32 + 6})">
      ${rr(-6, -18, (w - 56) + 12, 28, 8, ORANGE, "opacity=\"0.18\"")}
    </g>
  </g>`;
}

function magnifier(cx, cy, scale = 1) {
  return `
  <g transform="translate(${cx},${cy}) scale(${scale})" filter="url(#soft)">
    <circle cx="0" cy="0" r="58" fill="${CREAM}" fill-opacity="0.55" stroke="${NAVY}" stroke-width="10"/>
    <circle cx="0" cy="0" r="58" fill="none" stroke="${ORANGE}" stroke-width="4" opacity="0.6"/>
    <rect x="38" y="38" width="64" height="20" rx="10" fill="${NAVY}" transform="rotate(45 38 38)"/>
  </g>`;
}

function scene() {
  const document = rulesDocument(768, 540);
  const glass = magnifier(905, 430, 1.05);

  // A loose cluster of candidate group cards around the document, implying
  // "many groups found," with one confirmed as a safe, compliant match.
  const cards = [
    groupCard(230, 260, 1),
    groupCard(210, 560, 0.9),
    groupCard(300, 840, 0.95),
    groupCard(1320, 250, 1),
    groupCard(1340, 560, 0.9),
    groupCard(1250, 840, 1, GREEN_DEEP),
  ].join("");

  const checkOnMatch = `
  <g transform="translate(1250,840)">
    ${circle(66, -40, 20, GREEN)}
    <path d="M58 -40 L64 -34 L75 -47" fill="none" stroke="${WHITE}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>
  </g>`;

  const sparkle = (x, y, s = 1) => `
  <g transform="translate(${x},${y}) scale(${s})" fill="${ORANGE}">
    <path d="M0 -22 L6 -6 L22 0 L6 6 L0 22 L-6 6 L-22 0 L-6 -6 Z"/>
  </g>`;

  return `${cards}${checkOnMatch}${document}${glass}${sparkle(768, 130, 1)}${sparkle(1420, 860, 0.6)}${sparkle(120, 880, 0.6)}`;
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
