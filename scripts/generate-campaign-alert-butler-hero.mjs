/**
 * Summary: Renders the branded SVG hero (1536x1024) for the blog post
 *   "campaign-alert-butler-explained" using the locally installed Chrome/Edge
 *   in headless mode (same approach as generate-desktop-vs-cloud-hero.mjs).
 *   No API key needed.
 *
 * Scene: a geometric alert bell standing inside a branded picture frame,
 *   with a checkmark badge auto-accepting a fanned stack of campaign cards,
 *   a small schedule clock glyph beside it, and brand "follow" chips
 *   orbiting outside the frame, representing brands you follow for new
 *   Creator Connections campaigns.
 *
 * Usage:
 *   node scripts/generate-campaign-alert-butler-hero.mjs            (skips if PNG exists)
 *   node scripts/generate-campaign-alert-butler-hero.mjs --force
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const outDir = path.join(repoRoot, "public", "assets", "blog");
const SLUG = "campaign-alert-butler-explained";

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

function bellIcon(cx, cy, scale = 1) {
  // Geometric alert bell: top knob, dome, tapered body, base rim, clapper.
  return `
  <g transform="translate(${cx},${cy}) scale(${scale})" filter="url(#soft)">
    ${circle(0, -170, 18, ORANGE_DEEP)}
    ${circle(0, -40, 120, ORANGE)}
    ${rr(-120, -40, 240, 160, 40, ORANGE)}
    ${rr(-150, 120, 300, 28, 14, ORANGE_DEEP)}
    ${rr(-17, 146, 34, 30, 10, ORANGE_DEEP)}
    ${circle(0, 192, 22, ORANGE_DEEP)}
  </g>`;
}

function checkBadge(cx, cy, r) {
  // Navy circle with a white checkmark, overlapping the bell like a
  // just-landed auto-accept confirmation.
  return `
  <g transform="translate(${cx},${cy})" filter="url(#soft)">
    ${circle(0, 0, r, NAVY, `stroke="${WHITE}" stroke-width="6"`)}
    <path d="M${-r * 0.42} 0 L${-r * 0.08} ${r * 0.38} L${r * 0.46} ${-r * 0.34}"
      stroke="${WHITE}" stroke-width="${r * 0.2}" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
  </g>`;
}

function clockGlyph(cx, cy, r) {
  // Small schedule clock, for the every-N-hours interval picker.
  return `
  <g transform="translate(${cx},${cy})" filter="url(#soft)">
    ${circle(0, 0, r, WHITE, `stroke="${SLATE_L}" stroke-width="4"`)}
    ${circle(0, 0, r * 0.82, NAVY_L)}
    <line x1="0" y1="0" x2="0" y2="${-r * 0.48}" stroke="${WHITE}" stroke-width="${r * 0.12}" stroke-linecap="round"/>
    <line x1="0" y1="0" x2="${r * 0.36}" y2="${r * 0.1}" stroke="${WHITE}" stroke-width="${r * 0.12}" stroke-linecap="round"/>
    ${circle(0, 0, r * 0.1, ORANGE)}
  </g>`;
}

function campaignCard(cx, cy, w, h, rotate, fill) {
  // A simple "campaign" card: brand dot, two text bars, and a solid
  // bottom bar standing in for an accepted/filled state.
  return `
  <g transform="translate(${cx},${cy}) rotate(${rotate})" filter="url(#soft)">
    ${rr(-w / 2, -h / 2, w, h, 16, WHITE, `stroke="${SLATE_L}" stroke-width="2"`)}
    ${circle(-w / 2 + 26, -h / 2 + 26, 14, fill)}
    ${bar(-w / 2 + 50, -h / 2 + 16, w - 76, 10, SLATE_L)}
    ${bar(-w / 2 + 50, -h / 2 + 36, w - 112, 8, MIST)}
    ${bar(-w / 2 + 22, h / 2 - 30, w - 44, 14, fill)}
  </g>`;
}

function brandChip(cx, cy, r, fill) {
  // A followed-brand avatar chip with a small "followed" dot, standing
  // in for a brand on the follow list rather than a literal logo.
  return `
  <g transform="translate(${cx},${cy})" filter="url(#soft)">
    ${circle(0, 0, r, WHITE, `stroke="${SLATE_L}" stroke-width="2"`)}
    ${circle(0, 0, r * 0.72, fill)}
    ${circle(r * 0.6, r * 0.6, r * 0.34, ORANGE_DEEP, `stroke="${WHITE}" stroke-width="3"`)}
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

  // A fanned stack of campaign cards waiting behind the bell, as if new
  // listings just arrived from followed brands.
  const cards = [
    campaignCard(808, 630, 360, 128, 7, "#FDE6C8"),
    campaignCard(768, 600, 360, 128, 0, PINK),
    campaignCard(728, 630, 360, 128, -7, BLUE),
  ].join("");

  const bell = bellIcon(768, 410, 0.9);
  const check = checkBadge(896, 478, 58);
  const clock = clockGlyph(540, 430, 54);

  // Brand "follow" chips orbiting outside the frame, implying the list of
  // brands being watched for brand-new campaigns.
  const orbit = [
    brandChip(150, 200, 90, PINK),
    brandChip(170, 480, 70, BLUE),
    brandChip(110, 760, 80, "#FDE6C8"),
    brandChip(1300, 220, 80, BLUE),
    brandChip(1330, 520, 70, PINK),
    brandChip(1270, 790, 90, "#FDE6C8"),
  ].join("");

  const sparkle = (x, y, s = 1) => `
  <g transform="translate(${x},${y}) scale(${s})" fill="${ORANGE}">
    <path d="M0 -22 L6 -6 L22 0 L6 6 L0 22 L-6 6 L-22 0 L-6 -6 Z"/>
  </g>`;

  return `${frameOuter}${frameInner}${titleBand}${cards}${bell}${check}${clock}${orbit}${sparkle(768, 110, 1)}${sparkle(1180, 860, 0.7)}${sparkle(340, 860, 0.6)}`;
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
