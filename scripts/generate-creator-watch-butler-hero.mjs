/**
 * Summary: Renders the branded SVG hero (1536x1024) for the blog post
 *   "creator-watch-butler-explained" using the locally installed Chrome/Edge
 *   in headless mode (same approach as generate-desktop-vs-cloud-hero.mjs).
 *   No API key needed.
 *
 * Scene: a simple geometric eye watching a row of storefront icon cards,
 *   with one card lit up in orange and carrying a notification badge,
 *   representing a watched creator's storefront that just got a new pick.
 *
 * Usage:
 *   node scripts/generate-creator-watch-butler-hero.mjs            (skips if PNG exists)
 *   node scripts/generate-creator-watch-butler-hero.mjs --force
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const outDir = path.join(repoRoot, "public", "assets", "blog");
const SLUG = "creator-watch-butler-explained";

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

function eyeGlyph(cx, cy, scale = 1) {
  // Simple geometric eye made of soft shapes: an almond "white," an iris,
  // and a pupil highlight. Not a literal, detailed eye, just a watching glyph.
  return `
  <g transform="translate(${cx},${cy}) scale(${scale})" filter="url(#soft)">
    <path d="M-260 0 Q0 -150 260 0 Q0 150 -260 0 Z" fill="${WHITE}" stroke="${SLATE_L}" stroke-width="3"/>
    ${circle(0, 0, 100, NAVY)}
    ${circle(0, 0, 100, NAVY_L, 'opacity="0.0"')}
    ${circle(-28, -28, 30, ORANGE)}
    ${circle(0, 0, 46, "#101A33")}
    <path d="M-260 0 Q0 -150 260 0" fill="none" stroke="${NAVY}" stroke-width="10" stroke-linecap="round"/>
    <path d="M-260 0 Q0 150 260 0" fill="none" stroke="${NAVY}" stroke-width="10" stroke-linecap="round"/>
  </g>`;
}

function storefrontCard(x, y, s, fill, active = false) {
  const halo = active
    ? circle(x + s / 2, y + s * 0.42, s * 1.05, ORANGE, 'opacity="0.16"')
    : "";
  const base = rr(x, y, s, s * 0.9, s * 0.14, WHITE, `stroke="${SLATE_L}" stroke-width="2.5"`);
  const awning = rr(x, y, s, s * 0.22, s * 0.1, active ? ORANGE_DEEP : fill);
  const door = rr(x + s * 0.36, y + s * 0.48, s * 0.28, s * 0.42, s * 0.06, active ? ORANGE : NAVY_L);
  const window1 = rr(x + s * 0.1, y + s * 0.34, s * 0.16, s * 0.16, s * 0.04, MIST);
  const window2 = rr(x + s * 0.74, y + s * 0.34, s * 0.16, s * 0.16, s * 0.04, MIST);
  const badge = active
    ? `${circle(x + s * 0.96, y - s * 0.02, s * 0.17, ORANGE_DEEP, `stroke="${WHITE}" stroke-width="4"`)}${circle(x + s * 0.96, y - s * 0.02, s * 0.06, WHITE)}`
    : "";
  return `<g>${halo}${base}${awning}${window1}${window2}${door}${badge}</g>`;
}

function scene() {
  const frameOuter = rr(180, 120, 1176, 760, 28, WHITE, `stroke="${SLATE_L}" stroke-width="3" filter="url(#soft)"`);
  const frameInner = rr(210, 150, 1116, 700, 18, "#FBE9CF");

  const eye = eyeGlyph(768, 360);

  // Soft focus beam from the eye down to the one storefront that lit up.
  const beam = `<path d="M560 460 L700 620 L838 620 Z" fill="${ORANGE}" opacity="0.08"/>`;

  const cardY = 650;
  const cardS = 150;
  const cardXs = [310, 500, 690, 880, 1070];
  const activeIndex = 2;
  const cards = cardXs
    .map((x, i) => storefrontCard(x, cardY, cardS, i % 2 === 0 ? BLUE : PINK, i === activeIndex))
    .join("");

  const sparkle = (x, y, s = 1) => `
  <g transform="translate(${x},${y}) scale(${s})" fill="${ORANGE}">
    <path d="M0 -22 L6 -6 L22 0 L6 6 L0 22 L-6 6 L-22 0 L-6 -6 Z"/>
  </g>`;

  const activeCx = cardXs[activeIndex] + cardS / 2;
  const sparkles = `${sparkle(activeCx + 90, cardY - 30, 0.8)}${sparkle(300, 220, 0.6)}${sparkle(1260, 260, 0.55)}`;

  return `${frameOuter}${frameInner}${beam}${eye}${cards}${sparkles}`;
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
