/**
 * Summary: Renders the branded SVG hero (1536x1024) for the blog post
 *   "egress-ip-monitor-explained" using the locally installed Chrome/Edge
 *   in headless mode (same approach as generate-desktop-vs-cloud-hero.mjs).
 *   No API key needed.
 *
 * Scene: a large status-chip capsule with a glowing color-coded dot and a
 *   small shield badge, sitting between a cozy home icon and a data-center
 *   rack icon, with a signal path running from the home up into the chip
 *   and a flagged, dashed path running from the chip down to the rack,
 *   representing the app watching its own connection and telling a real
 *   residential IP apart from a data-center one.
 *
 * Usage:
 *   node scripts/generate-egress-ip-monitor-hero.mjs            (skips if PNG exists)
 *   node scripts/generate-egress-ip-monitor-hero.mjs --force
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const outDir = path.join(repoRoot, "public", "assets", "blog");
const SLUG = "egress-ip-monitor-explained";

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
const GREEN = "#34A371";
const GREEN_DEEP = "#1F7A51";
const RED = "#DC6358";
const YELLOW = "#F0B84A";

const rr = (x, y, w, h, r, fill, extra = "") =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${fill}" ${extra}/>`;
const bar = (x, y, w, h = 12, fill = SLATE_L) => rr(x, y, w, h, h / 2, fill);
const circle = (cx, cy, r, fill, extra = "") => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}" ${extra}/>`;

// A cozy home icon: simple roof + body, standing for a real residential connection.
function houseIcon(cx, cy, s = 1) {
  return `
  <g transform="translate(${cx},${cy}) scale(${s})" filter="url(#soft)">
    ${rr(-70, -10, 140, 110, 16, WHITE, `stroke="${SLATE_L}" stroke-width="3"`)}
    <path d="M-86 -6 L0 -92 L86 -6 Z" fill="${ORANGE_DEEP}"/>
    ${rr(-22, 32, 44, 68, 10, "#FBE9CF")}
    ${circle(0, 66, 4, ORANGE_DEEP)}
    ${rr(-52, 20, 26, 26, 6, BLUE)}
    ${rr(26, 20, 26, 26, 6, BLUE)}
  </g>`;
}

// A small data-center rack icon: a tall cabinet with blinking unit slits.
function rackIcon(cx, cy, s = 1) {
  const slit = (y) => `${rr(-46, y, 92, 16, 5, NAVY_L)}${circle(34, y + 8, 4, RED)}`;
  return `
  <g transform="translate(${cx},${cy}) scale(${s})" filter="url(#soft)">
    ${rr(-56, -96, 112, 192, 14, NAVY, `stroke="${NAVY_L}" stroke-width="3"`)}
    ${slit(-74)}${slit(-40)}${slit(-6)}${slit(28)}${slit(62)}
  </g>`;
}

// A rounded shield, standing for the app actively protecting the account.
function shieldIcon(cx, cy, s = 1) {
  return `
  <g transform="translate(${cx},${cy}) scale(${s})">
    <path d="M0 -46 L42 -28 L42 10 Q42 54 0 72 Q-42 54 -42 10 L-42 -28 Z" fill="${NAVY}"/>
    <path d="M0 -46 L42 -28 L42 10 Q42 54 0 72 Z" fill="${NAVY_L}"/>
    <path d="M-20 4 L-6 20 L24 -16" fill="none" stroke="${ORANGE}" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>
  </g>`;
}

// The headline element: a large capsule-shaped status chip with a glowing,
// color-coded dot inside it, echoing the real topbar connection chip.
function statusChip(cx, cy, dotFill, ringFill) {
  return `
  <g transform="translate(${cx},${cy})" filter="url(#soft)">
    ${circle(0, 0, 118, ringFill, `opacity="0.35"`)}
    ${circle(0, 0, 96, WHITE, `stroke="${SLATE_L}" stroke-width="3"`)}
    ${circle(0, 0, 54, dotFill)}
    ${circle(0, 0, 54, "none", `stroke="${WHITE}" stroke-width="5" opacity="0.5"`)}
  </g>`;
}

function scene() {
  const frameOuter = rr(430, 90, 676, 760, 28, WHITE, `stroke="${SLATE_L}" stroke-width="3" filter="url(#soft)"`);
  const frameInner = rr(460, 120, 616, 640, 18, "#FBE9CF");

  const titleBand = `
  <g transform="translate(460,150)">
    ${rr(0, 0, 616, 72, 14, NAVY)}
    ${circle(36, 36, 16, GREEN)}
    ${bar(66, 24, 260, 14, WHITE)}
    ${bar(66, 46, 160, 10, SLATE_L)}
  </g>`;

  // Signal path rising from the home into the chip: a safe, solid connection.
  const safePath = `<path d="M598 620 C 660 560, 700 460, 768 400" fill="none" stroke="${GREEN}" stroke-width="7" stroke-linecap="round" opacity="0.8"/>`;
  // Flagged path dropping from the chip to the rack: dashed, marked unsafe.
  const flaggedPath = `<path d="M768 400 C 840 470, 900 560, 938 630" fill="none" stroke="${RED}" stroke-width="7" stroke-linecap="round" stroke-dasharray="4 14" opacity="0.6"/>`;

  const house = houseIcon(560, 660, 1.05);
  const rack = rackIcon(980, 650, 1.0);
  const chip = statusChip(768, 400, GREEN, GREEN);
  const shield = shieldIcon(768, 250, 0.9);

  // Small pulse rings radiating from the chip, implying continuous live monitoring.
  const pulses = [
    circle(768, 400, 140, "none", `stroke="${GREEN}" stroke-width="3" opacity="0.25"`),
    circle(768, 400, 168, "none", `stroke="${GREEN}" stroke-width="2" opacity="0.15"`),
  ].join("");

  // A tiny "x" tag flagging the rack path, and a tiny check tagging the home path.
  const flagX = `
  <g transform="translate(938,636)">
    ${circle(0, 0, 20, WHITE, `stroke="${RED}" stroke-width="3"`)}
    <path d="M-8 -8 L8 8 M8 -8 L-8 8" stroke="${RED}" stroke-width="4" stroke-linecap="round"/>
  </g>`;
  const flagCheck = `
  <g transform="translate(598,606)">
    ${circle(0, 0, 20, WHITE, `stroke="${GREEN}" stroke-width="3"`)}
    <path d="M-8 1 L-2 9 L9 -8" fill="none" stroke="${GREEN}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
  </g>`;

  // Small off-palette dots outside the frame, hinting at the chip's other
  // possible colors (yellow for vpn/proxy, gray for unknown) without
  // turning the illustration into a literal screenshot.
  const satelliteDots = [
    circle(170, 260, 22, YELLOW, `opacity="0.8"`),
    circle(140, 560, 16, SLATE_L, `opacity="0.9"`),
    circle(1340, 300, 18, YELLOW, `opacity="0.8"`),
    circle(1310, 640, 16, SLATE_L, `opacity="0.9"`),
  ].join("");

  const sparkle = (x, y, s = 1) => `
  <g transform="translate(${x},${y}) scale(${s})" fill="${ORANGE}">
    <path d="M0 -22 L6 -6 L22 0 L6 6 L0 22 L-6 6 L-22 0 L-6 -6 Z"/>
  </g>`;

  return `${frameOuter}${frameInner}${titleBand}${safePath}${flaggedPath}${pulses}${house}${rack}${chip}${shield}${flagCheck}${flagX}${satelliteDots}${sparkle(768, 850, 0.8)}${sparkle(1180, 200, 0.6)}${sparkle(340, 200, 0.6)}`;
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
