/**
 * Summary: Renders the branded SVG hero (1536x1024) for the blog post
 *   "raspberry-pi-residential-proxy-always-on-home-gateway" using the locally
 *   installed Chrome/Edge in headless mode (same approach as
 *   generate-private-proxy-hero.mjs / generate-desktop-vs-cloud-hero.mjs). No
 *   API key needed. The post's imagePrompt stays in content/blog/_index.json
 *   so the hero can later be regenerated with gpt-image-1 via
 *   scripts/generate-blog-images.mjs --force --only=<slug> if preferred.
 *
 * Scene: a small single-board computer with a battery pack beside it, sitting
 *   on a home shelf, with a warm dotted connection line reaching out to a
 *   small cloud-server icon in the distance. No specific product likeness;
 *   purely a generic illustration of "tiny home computer + battery, talking
 *   to a cloud server."
 *
 * Usage:
 *   node scripts/generate-pi-gateway-hero.mjs            (skips if PNG exists)
 *   node scripts/generate-pi-gateway-hero.mjs --force
 *
 * Dependencies: node:child_process, node:fs, node:os, node:path. A Chromium
 * browser on the PATH candidates below or via CHROME_PATH.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const outDir = path.join(repoRoot, "public", "assets", "blog");
const SLUG = "raspberry-pi-residential-proxy-always-on-home-gateway";

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

// Brand palette (matches the other hero scripts: warm orange, deep navy, soft cream).
const NAVY = "#1E2A4A";
const NAVY_L = "#2B3A62";
const ORANGE = "#F59E0B";
const ORANGE_DEEP = "#D97706";
const CREAM = "#FEF6EA";
const WHITE = "#FFFFFF";
const SLATE = "#94A3B8";
const SLATE_L = "#C7D2DE";
const GREEN = "#16A34A";

const rr = (x, y, w, h, r, fill, extra = "") =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${fill}" ${extra}/>`;
const bar = (x, y, w, h = 10, fill = SLATE_L) => rr(x, y, w, h, h / 2, fill);
const circle = (cx, cy, r, fill, extra = "") => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}" ${extra}/>`;

function check(cx, cy, r = 14) {
  return `${circle(cx, cy, r, GREEN)}<path d="M${cx - r * 0.45} ${cy} l${r * 0.3} ${r * 0.3} l${r * 0.6} -${r * 0.65}" fill="none" stroke="${WHITE}" stroke-width="${Math.max(3, r / 5)}" stroke-linecap="round" stroke-linejoin="round"/>`;
}

// A small cloud glyph (the cloud PC the gateway is feeding a home IP to).
function cloudServer(cx, cy, scale = 1) {
  return `
  <g transform="translate(${cx},${cy}) scale(${scale})" filter="url(#soft)">
    <path d="M-150 20 a60 60 0 0 1 10 -119 a85 85 0 0 1 160 -10 a70 70 0 0 1 10 129 Z" fill="${NAVY_L}"/>
    ${rr(-120, 10, 240, 90, 16, NAVY)}
    ${circle(-90, 40, 7, GREEN)}${circle(-65, 40, 7, SLATE_L)}
    ${bar(-100, 62, 180, 10, SLATE_L)}
    ${bar(-100, 80, 120, 10, SLATE_L)}
  </g>`;
}

// A tiny single-board computer: a small green-ish PCB with a few chips and
// header pins, deliberately generic (not a specific brand's board design).
function singleBoardComputer(cx, cy) {
  return `
  <g transform="translate(${cx},${cy})" filter="url(#soft)">
    ${rr(-130, -80, 260, 160, 14, "#2F6B4F")}
    ${rr(-108, -58, 90, 60, 6, NAVY)}
    ${rr(-108, 10, 60, 40, 5, NAVY_L)}
    ${rr(20, -58, 90, 36, 5, SLATE)}
    ${rr(20, -10, 90, 24, 4, SLATE_L)}
    <!-- header pins -->
    ${Array.from({ length: 10 })
      .map((_, i) => circle(-96 + i * 10, 56, 3, ORANGE_DEEP))
      .join("")}
    <!-- ports -->
    ${rr(118, -40, 14, 26, 3, SLATE)}
    ${rr(118, 0, 14, 20, 3, SLATE)}
  </g>`;
}

// A small battery pack (the UPS) sitting beside the board.
function batteryPack(cx, cy) {
  return `
  <g transform="translate(${cx},${cy})" filter="url(#soft)">
    ${rr(-55, -70, 110, 150, 14, NAVY)}
    ${rr(-20, -84, 40, 16, 4, NAVY)}
    ${rr(-38, -50, 76, 95, 8, "#143018")}
    ${rr(-28, 10, 56, 24, 5, GREEN)}
    ${circle(0, 55, 10, ORANGE)}
    <path d="M-4 48 l8 0 l-10 16 l8 0 l-10 16" fill="none" stroke="${WHITE}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
  </g>`;
}

// A simple shelf under the home gear.
function shelf(cx, cy, w) {
  return `${rr(cx - w / 2, cy, w, 18, 6, "#B98756")}${rr(cx - w / 2 + 10, cy + 18, 10, 60, 3, "#8C6239")}${rr(cx + w / 2 - 20, cy + 18, 10, 60, 3, "#8C6239")}`;
}

function scene() {
  const home = shelf(430, 560, 420);
  const sbc = singleBoardComputer(340, 480);
  const battery = batteryPack(560, 470);
  const homeGlow = circle(430, 440, 190, ORANGE, 'opacity="0.07"');

  const cloud = cloudServer(1180, 420, 1.15);
  const cloudGlow = circle(1180, 430, 210, NAVY, 'opacity="0.06"');

  // Dotted connection line from the home gear to the cloud icon, with a
  // small "home IP" badge riding partway along it.
  const link = `
  <path d="M620 470 C 820 380, 920 380, 1020 400" fill="none" stroke="${ORANGE_DEEP}" stroke-width="6" stroke-dasharray="2 18" stroke-linecap="round"/>
  <g transform="translate(830,392)" filter="url(#soft)">
    ${rr(-70, -22, 140, 44, 22, WHITE, `stroke="${SLATE_L}" stroke-width="2"`)}
    ${check(-42, 0, 14)}
    ${bar(-16, -6, 70, 12, SLATE_L)}
  </g>`;

  const homeCheck = check(340, 360, 20);

  return `${homeGlow}${cloudGlow}${home}${sbc}${battery}${homeCheck}${link}${cloud}`;
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

// ---------- render ----------
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
