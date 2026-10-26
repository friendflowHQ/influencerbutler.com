/**
 * Summary: Renders the branded SVG hero (1536x1024) for the blog post
 *   "relink-butler-explained" using the locally installed Chrome/Edge
 *   in headless mode (same approach as generate-ai-influencer-butler-hero.mjs).
 *   No API key needed.
 *
 * Scene: a broken chain-link icon being reconnected into a fresh link shape,
 *   with a small diff-table/checklist glyph nearby, representing an old
 *   affiliate link being rewritten and approved into a new one.
 *
 * Usage:
 *   node scripts/generate-relink-butler-hero.mjs            (skips if PNG exists)
 *   node scripts/generate-relink-butler-hero.mjs --force
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const outDir = path.join(repoRoot, "public", "assets", "blog");
const SLUG = "relink-butler-explained";

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
const GREEN = "#BFE3C8";

const rr = (x, y, w, h, r, fill, extra = "") =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${fill}" ${extra}/>`;
const bar = (x, y, w, h = 12, fill = SLATE_L) => rr(x, y, w, h, h / 2, fill);
const circle = (cx, cy, r, fill, extra = "") => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}" ${extra}/>`;

// A single rounded "link" capsule, rotated, built from two concentric rounded
// rects so it reads as a chain-link shape rather than a plain pill.
function linkCapsule(cx, cy, angle, w, h, stroke, fill = "none", strokeWidth = 16) {
  return `
  <g transform="translate(${cx},${cy}) rotate(${angle})">
    <rect x="${-w / 2}" y="${-h / 2}" width="${w}" height="${h}" rx="${h / 2}"
      fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" />
  </g>`;
}

function brokenChain(cx, cy) {
  // Left link, intact, navy.
  const left = linkCapsule(cx - 95, cy, -28, 150, 86, NAVY_L);
  // Right half of a broken link, drawn as two short arcs pulling apart, slate.
  const rightTop = `
  <g transform="translate(${cx + 150},${cy - 18}) rotate(28)">
    <path d="M -40 0 A 43 43 0 0 1 20 -30" fill="none" stroke="${SLATE}" stroke-width="16" stroke-linecap="round"/>
  </g>`;
  const rightBottom = `
  <g transform="translate(${cx + 150},${cy + 22}) rotate(28)">
    <path d="M -40 0 A 43 43 0 0 0 20 30" fill="none" stroke="${SLATE}" stroke-width="16" stroke-linecap="round"/>
  </g>`;
  // A small gap-spark between the intact link and the broken one, showing the break.
  const spark = sparkle(cx + 60, cy, 0.55, SLATE_L);
  return `${left}${rightTop}${rightBottom}${spark}`;
}

function reconnectedChain(cx, cy) {
  const a = linkCapsule(cx - 90, cy, -28, 150, 86, NAVY_L);
  const b = linkCapsule(cx + 70, cy, 28, 150, 86, ORANGE, "none", 16);
  const glow = circle(cx - 10, cy, 10, ORANGE, `opacity="0.9"`);
  return `${a}${b}${glow}`;
}

function sparkle(x, y, s = 1, fill = ORANGE) {
  return `
  <g transform="translate(${x},${y}) scale(${s})" fill="${fill}">
    <path d="M0 -22 L6 -6 L22 0 L6 6 L0 22 L-6 6 L-22 0 L-6 -6 Z"/>
  </g>`;
}

// A small diff / approval checklist card: rows of "old value -> new value"
// with a checkbox, representing the preview-then-approve table.
function diffCard(x, y, w, h) {
  const rows = [0, 1, 2].map((i) => {
    const ry = y + 70 + i * 54;
    const checked = i !== 1; // middle row unchecked, matching "nothing is pre-ticked"
    const box = checked
      ? `${rr(x + 26, ry - 14, 28, 28, 7, ORANGE)}<path d="M${x + 31} ${ry} l6 7 l12 -14" fill="none" stroke="${WHITE}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>`
      : rr(x + 26, ry - 14, 28, 28, 7, WHITE, `stroke="${SLATE_L}" stroke-width="3"`);
    return `
    <g>
      ${box}
      ${bar(x + 70, ry - 15, 90, 10, SLATE_L)}
      <path d="M${x + 172} ${ry - 10} l14 10 l-14 10" fill="none" stroke="${SLATE}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
      ${bar(x + 198, ry - 15, 100, 10, checked ? "#FBD9A5" : MIST)}
    </g>`;
  }).join("");

  return `
  <g filter="url(#soft)">
    ${rr(x, y, w, h, 22, WHITE, `stroke="${SLATE_L}" stroke-width="3"`)}
    ${rr(x + 26, y + 24, w - 52, 26, 8, NAVY)}
    ${bar(x + 40, y + 31, 70, 12, ORANGE)}
    ${bar(x + 220, y + 31, 70, 12, "#5B6B8C")}
    ${rows}
  </g>`;
}

function scene() {
  const panelX = 430, panelY = 90, panelW = 676, panelH = 760;
  const frameOuter = rr(panelX, panelY, panelW, panelH, 28, WHITE, `stroke="${SLATE_L}" stroke-width="3" filter="url(#soft)"`);
  const frameInner = rr(panelX + 30, panelY + 30, panelW - 60, panelH - 60, 18, "#FBE9CF");

  const titleBand = `
  <g transform="translate(${panelX + 30},${panelY + 60})">
    ${rr(0, 0, panelW - 60, 72, 14, NAVY)}
    ${circle(36, 36, 16, ORANGE)}
    ${bar(66, 24, 260, 14, WHITE)}
    ${bar(66, 46, 170, 10, SLATE_L)}
  </g>`;

  const cx = panelX + panelW / 2;

  // Upper half of the inner panel: the broken chain reconnecting to the new link.
  const chainY = panelY + 300;
  const chains = `${brokenChain(cx - 70, chainY - 70)}${reconnectedChain(cx - 70, chainY + 90)}`;
  const arrowDown = `
  <path d="M${cx - 70} ${chainY - 10} L${cx - 70} ${chainY + 26}" stroke="${SLATE}" stroke-width="6" stroke-linecap="round"/>
  <path d="M${cx - 86} ${chainY + 10} L${cx - 70} ${chainY + 30} L${cx - 54} ${chainY + 10}" fill="none" stroke="${SLATE}" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>`;

  // Diff/checklist card sitting lower-right in the inner panel, slightly overlapping.
  const cardW = 330, cardH = 190;
  const card = diffCard(panelX + panelW - cardW - 54, panelY + panelH - cardH - 56, cardW, cardH);

  // A couple of small accent sparkles and a soft orbiting dot to echo brand motifs.
  const accents = `${sparkle(panelX + 70, panelY + panelH - 220, 0.7)}${circle(panelX + 60, panelY + 260, 10, ORANGE, `opacity="0.5"`)}`;

  return `${frameOuter}${frameInner}${titleBand}${chains}${arrowDown}${accents}${card}`;
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
