/**
 * Summary: Renders the branded SVG hero (1536x1024) for the blog post
 *   "expired-butler-explained" using the locally installed Chrome/Edge
 *   in headless mode (same approach as generate-ai-influencer-butler-hero.mjs).
 *   No API key needed.
 *
 * Scene: a social post card wearing a small "EXPIRED" stamp and a wilted
 *   tag, with a broom sweeping past it and a few faded dead-link chips being
 *   swept off to the side, representing automatic cleanup of expired deal
 *   posts.
 *
 * Usage:
 *   node scripts/generate-expired-butler-hero.mjs            (skips if PNG exists)
 *   node scripts/generate-expired-butler-hero.mjs --force
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const outDir = path.join(repoRoot, "public", "assets", "blog");
const SLUG = "expired-butler-explained";

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
const SAGE = "#CFE0C9";

const rr = (x, y, w, h, r, fill, extra = "") =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${fill}" ${extra}/>`;
const bar = (x, y, w, h = 12, fill = SLATE_L) => rr(x, y, w, h, h / 2, fill);
const circle = (cx, cy, r, fill, extra = "") => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}" ${extra}/>`;

// A faded post card, implying a dead deal post: muted body, a wilted hanging
// tag, and a crossed-out price bar.
function fadedPostCard(x, y, w, h) {
  const tagX = x + w - 34;
  const tagY = y - 18;
  return `
  <g transform="translate(${x},${y})" filter="url(#soft)" opacity="0.92">
    ${rr(0, 0, w, h, 20, WHITE, `stroke="${SLATE_L}" stroke-width="3"`)}
    ${circle(34, 34, 18, SLATE_L)}
    ${bar(64, 24, w - 100, 14, SLATE_L)}
    ${bar(64, 46, w - 150, 10, MIST)}
    ${rr(28, 86, w - 56, h - 150, 14, MIST)}
    ${bar(28, h - 48, 120, 22, SLATE_L)}
    <line x1="28" y1="${h - 37}" x2="148" y2="${h - 59}" stroke="${SLATE}" stroke-width="4" stroke-linecap="round"/>
  </g>
  <g transform="translate(${tagX},${tagY}) rotate(18)">
    ${rr(-26, 0, 52, 34, 8, "#D8CBA0")}
    ${circle(0, 10, 5, WHITE)}
  </g>`;
}

// Round "EXPIRED" stamp: a ring with a diagonal slash, no literal text so the
// illustration stays abstract/geometric per brand style.
function expiredStamp(cx, cy, r) {
  return `
  <g transform="translate(${cx},${cy}) rotate(-14)">
    <circle cx="0" cy="0" r="${r}" fill="none" stroke="${ORANGE_DEEP}" stroke-width="7"/>
    <circle cx="0" cy="0" r="${r - 14}" fill="none" stroke="${ORANGE_DEEP}" stroke-width="3" stroke-dasharray="6 7"/>
    <line x1="${-r * 0.55}" y1="${-r * 0.1}" x2="${r * 0.55}" y2="${r * 0.1}" stroke="${ORANGE_DEEP}" stroke-width="9" stroke-linecap="round"/>
  </g>`;
}

// Simple geometric broom: handle + angled bristle fan, mid-sweep.
function broom(cx, cy, rotate = -24) {
  return `
  <g transform="translate(${cx},${cy}) rotate(${rotate})">
    ${rr(-9, -220, 18, 200, 9, "#C8935A")}
    <path d="M -60 -36 L 60 -36 L 40 56 Q 0 78 -40 56 Z" fill="${NAVY}"/>
    <path d="M -60 -36 L 60 -36 L 40 56 Q 0 78 -40 56 Z" fill="none" stroke="${NAVY_L}" stroke-width="4"/>
    ${[-40, -20, 0, 20, 40].map((dx) => `<line x1="${dx * 0.7}" y1="-30" x2="${dx}" y2="60" stroke="${NAVY_L}" stroke-width="3" opacity="0.6"/>`).join("")}
  </g>`;
}

function dustMote(cx, cy, r, opacity = 0.5) {
  return circle(cx, cy, r, ORANGE, `opacity="${opacity}"`);
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

  // The main post card being cleaned up, centered in the frame.
  const card = fadedPostCard(588, 272, 340, 300);
  const stamp = expiredStamp(560, 350, 78);

  // Broom sweeping in from the lower-left of the frame toward the card.
  const sweep = broom(540, 780, -30);
  const motes = [
    dustMote(700, 760, 8, 0.45),
    dustMote(730, 790, 6, 0.35),
    dustMote(760, 730, 5, 0.3),
    dustMote(690, 820, 5, 0.3),
  ].join("");

  // A couple of small swept-aside chips (dead-link stand-ins) drifting out
  // of the frame toward the lower-right, fading as they go.
  const sweptChips = `
  <g opacity="0.55">${rr(980, 700, 90, 46, 10, MIST, `stroke="${SLATE_L}" stroke-width="2"`)}${bar(994, 714, 50, 8, SLATE_L)}${bar(994, 728, 34, 6, SLATE_L)}</g>
  <g opacity="0.35">${rr(1060, 760, 70, 40, 10, MIST, `stroke="${SLATE_L}" stroke-width="2"`)}${bar(1072, 772, 36, 7, SLATE_L)}</g>`;

  // A clean "kept" card off to the right with a small banner strip instead
  // of a stamp, standing in for a campaign post that was edited rather than
  // deleted.
  const keptCard = `
  <g transform="translate(560,560)" filter="url(#soft)">
    ${rr(0, 0, 300, 150, 16, WHITE, `stroke="${SLATE_L}" stroke-width="3"`)}
    ${rr(16, 16, 268, 26, 8, ORANGE)}
    ${circle(32, 29, 7, WHITE)}
    ${bar(48, 23, 120, 10, WHITE)}
    ${bar(16, 58, 190, 12, SLATE_L)}
    ${bar(16, 80, 150, 9, MIST)}
    ${circle(250, 95, 20, SAGE)}
  </g>`;

  // Floating faded product/link chips outside the frame, implying a backlog
  // of old posts waiting on a scan.
  const orbit = [
    `<g opacity="0.5">${rr(150, 210, 90, 60, 12, WHITE, `stroke="${SLATE_L}" stroke-width="2"`)}${bar(166, 228, 58, 8, SLATE_L)}${bar(166, 244, 40, 6, MIST)}</g>`,
    `<g opacity="0.4">${rr(140, 500, 80, 54, 12, WHITE, `stroke="${SLATE_L}" stroke-width="2"`)}${bar(154, 516, 52, 7, SLATE_L)}</g>`,
    `<g opacity="0.55">${rr(1290, 240, 90, 60, 12, WHITE, `stroke="${SLATE_L}" stroke-width="2"`)}${bar(1306, 258, 58, 8, SLATE_L)}${bar(1306, 274, 40, 6, MIST)}</g>`,
    `<g opacity="0.4">${rr(1300, 540, 80, 54, 12, WHITE, `stroke="${SLATE_L}" stroke-width="2"`)}${bar(1314, 556, 52, 7, SLATE_L)}</g>`,
  ].join("");

  const sparkle = (x, y, s = 1) => `
  <g transform="translate(${x},${y}) scale(${s})" fill="${ORANGE}">
    <path d="M0 -22 L6 -6 L22 0 L6 6 L0 22 L-6 6 L-22 0 L-6 -6 Z"/>
  </g>`;

  return `${frameOuter}${frameInner}${titleBand}${orbit}${card}${stamp}${keptCard}${sweptChips}${motes}${sweep}${sparkle(768, 860, 0.7)}${sparkle(340, 860, 0.6)}`;
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
