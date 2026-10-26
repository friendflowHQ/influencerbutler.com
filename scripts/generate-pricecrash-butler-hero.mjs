/**
 * Summary: Renders the branded SVG hero (1536x1024) for the blog post
 *   "pricecrash-butler-explained" using the locally installed Chrome/Edge
 *   in headless mode (same approach as generate-desktop-vs-cloud-hero.mjs).
 *   No API key needed.
 *
 * Scene: a large geometric price tag crashing diagonally downward inside a
 *   branded picture frame, paired with a crash arrow, an abstract percent-off
 *   badge, and a small radar scan-sweep glyph in the corner, with scanned
 *   product thumbnails orbiting outside, representing an automated sweep
 *   that catches a rare, extreme markdown.
 *
 * Usage:
 *   node scripts/generate-pricecrash-butler-hero.mjs            (skips if PNG exists)
 *   node scripts/generate-pricecrash-butler-hero.mjs --force
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const outDir = path.join(repoRoot, "public", "assets", "blog");
const SLUG = "pricecrash-butler-explained";

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

function priceTag(cx, cy, w, h, rotateDeg, fill, holeFill) {
  // A geometric price-tag silhouette: pointed on the left, rounded on the right,
  // with a punched hole near the point, tilted to read as mid-fall.
  const r = h * 0.18;
  const d = `M ${-w / 2} 0
    L ${-w / 2 + h / 2} ${-h / 2}
    L ${w / 2 - r} ${-h / 2}
    Q ${w / 2} ${-h / 2} ${w / 2} ${-h / 2 + r}
    L ${w / 2} ${h / 2 - r}
    Q ${w / 2} ${h / 2} ${w / 2 - r} ${h / 2}
    L ${-w / 2 + h / 2} ${h / 2}
    Z`;
  return `
  <g transform="translate(${cx},${cy}) rotate(${rotateDeg})" filter="url(#soft)">
    <path d="${d}" fill="${fill}"/>
    ${circle(-w / 2 + h / 2, 0, h * 0.11, holeFill, `stroke="${NAVY}" stroke-width="3"`)}
  </g>`;
}

function crashArrow(cx, cy, rotateDeg, len, thick, fill) {
  // A thick shaft with a triangular head, used as a downward "crashing" motion cue.
  return `
  <g transform="translate(${cx},${cy}) rotate(${rotateDeg})" opacity="0.9">
    ${rr(-thick / 2, -len / 2, thick, len * 0.72, thick / 2, fill)}
    <polygon points="${-thick * 1.7},${len * 0.2} ${thick * 1.7},${len * 0.2} 0,${len * 0.58}" fill="${fill}"/>
  </g>`;
}

function percentBadge(cx, cy, r, fill, markFill) {
  // Abstract percent-off badge: a ring with a diagonal slash and two dots,
  // read as a percent glyph without using any text.
  return `
  <g transform="translate(${cx},${cy})" filter="url(#soft)">
    ${circle(0, 0, r, fill)}
    <line x1="${-r * 0.48}" y1="${r * 0.48}" x2="${r * 0.48}" y2="${-r * 0.48}" stroke="${markFill}" stroke-width="${r * 0.15}" stroke-linecap="round"/>
    ${circle(-r * 0.48, -r * 0.4, r * 0.16, markFill)}
    ${circle(r * 0.48, r * 0.4, r * 0.16, markFill)}
  </g>`;
}

function radarSweep(cx, cy, r) {
  // Small radar scan-sweep glyph: concentric rings, a filled wedge, and a blip,
  // implying a continuous automated sweep rather than a one-time check.
  const rings = [0.42, 0.7, 1].map(
    (f) => `<circle cx="0" cy="0" r="${r * f}" fill="none" stroke="${NAVY}" stroke-width="3" opacity="${0.45 - f * 0.22}"/>`
  ).join("");
  return `
  <g transform="translate(${cx},${cy})">
    ${rings}
    <path d="M0 0 L0 ${-r} A ${r} ${r} 0 0 1 ${r * 0.74} ${-r * 0.67} Z" fill="${ORANGE}" opacity="0.22"/>
    <line x1="0" y1="0" x2="${r * 0.74}" y2="${-r * 0.67}" stroke="${ORANGE_DEEP}" stroke-width="4" stroke-linecap="round"/>
    ${circle(r * 0.32, -r * 0.58, 7, ORANGE)}
    ${circle(0, 0, 7, NAVY)}
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

  // Faint diagonal motion trail above the tag, reinforcing the fall.
  const trail = [0.3, 0.52, 0.74].map((f, i) =>
    circle(640 - i * 46, 330 - i * 46, 10 - i * 2, ORANGE, `opacity="${0.35 - i * 0.1}"`)
  ).join("");

  const arrow = crashArrow(700, 430, 32, 150, 34, ORANGE_DEEP);
  const tag = priceTag(790, 560, 330, 210, 28, ORANGE, "#FBE9CF");
  const badge = percentBadge(930, 700, 76, NAVY, WHITE);
  const radar = radarSweep(982, 210, 62);

  const thumbs = [
    productThumb(500, 700, 62, BLUE),
    productThumb(506, 240, 64, PINK),
  ].join("");

  // Floating product chips orbiting outside the frame: the ordinary listings
  // a sweep passes over, with the one crashed tag flagged inside the frame.
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

  return `${frameOuter}${frameInner}${titleBand}${thumbs}${trail}${arrow}${tag}${badge}${radar}${orbit}${sparkle(1180, 860, 0.7)}${sparkle(340, 860, 0.6)}`;
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
