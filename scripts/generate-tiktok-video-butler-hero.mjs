/**
 * Summary: Renders the branded SVG hero (1536x1024) for the blog post
 *   "tiktok-video-butler-explained" using the locally installed Chrome/Edge
 *   in headless mode (same approach as generate-desktop-vs-cloud-hero.mjs).
 *   No API key needed.
 *
 * Scene: a geometric phone/video-frame shape with a play glyph, an upload
 *   arrow rising from it toward a small platform node above, and a small
 *   folder/archive glyph beside it holding a saved video card, representing
 *   posting through TikTok's own API plus the separate local backup feature.
 *
 * Usage:
 *   node scripts/generate-tiktok-video-butler-hero.mjs            (skips if PNG exists)
 *   node scripts/generate-tiktok-video-butler-hero.mjs --force
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const outDir = path.join(repoRoot, "public", "assets", "blog");
const SLUG = "tiktok-video-butler-explained";

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

function phoneFigure(cx, cy) {
  // Simple geometric "phone holding a video" made of soft shapes, not a literal screenshot.
  return `
  <g transform="translate(${cx},${cy})">
    ${rr(-110, -160, 220, 320, 32, NAVY, `filter="url(#soft)"`)}
    ${rr(-86, -136, 172, 272, 18, CREAM)}
    ${circle(0, -112, 7, NAVY_L)}
    <path d="M-24 -36 L-24 36 L30 0 Z" fill="${ORANGE}"/>
  </g>`;
}

function uploadArrow(cx, topY, bottomY) {
  // A rising arrow carrying the video up to the platform node above it.
  return `
  <g>
    ${rr(cx - 11, topY + 26, 22, bottomY - topY - 26, 11, ORANGE_DEEP)}
    <path d="M${cx - 30} ${topY + 40} L${cx} ${topY - 6} L${cx + 30} ${topY + 40} Z" fill="${ORANGE_DEEP}"/>
  </g>`;
}

function folderGlyph(cx, cy) {
  // A folder holding a small saved-video card peeking out, representing the local backup.
  return `
  <g transform="translate(${cx},${cy})" filter="url(#soft)">
    ${rr(-96, -46, 88, 40, 12, ORANGE_DEEP)}
    ${rr(-96, -10, 192, 150, 20, ORANGE_DEEP)}
    ${rr(-108, 14, 216, 134, 20, ORANGE)}
    ${rr(-40, -56, 108, 86, 12, WHITE, `stroke="${SLATE_L}" stroke-width="2"`)}
    <path d="M-10 -34 L24 -13 L-10 8 Z" fill="${NAVY}"/>
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

  // Small platform node the upload arrow feeds into, abstract (no logo).
  const platformNode = `
  <g transform="translate(700,290)">
    ${circle(0, 0, 34, NAVY)}
    ${circle(0, 0, 16, ORANGE)}
  </g>`;

  const phone = phoneFigure(700, 560);
  const arrow = uploadArrow(700, 324, 400);
  const folder = folderGlyph(940, 560);

  // Floating accent chips orbiting outside the frame, echoing a video library.
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

  return `${frameOuter}${frameInner}${titleBand}${platformNode}${arrow}${phone}${folder}${orbit}${sparkle(768, 860, 0.9)}${sparkle(1180, 860, 0.7)}${sparkle(340, 860, 0.6)}`;
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
