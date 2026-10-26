/**
 * Summary: Renders the branded SVG hero (1536x1024) for the blog post
 *   "ai-concierge-talk-to-butler-ai" using the locally installed Chrome/Edge
 *   in headless mode (same approach as generate-desktop-vs-cloud-hero.mjs).
 *   No API key needed.
 *
 * Scene: a chat bubble with a simple headset glyph facing a friendly abstract
 *   helper glyph, with a dashed guided-tour spotlight ring around a small
 *   button below them, representing the 24/7 AI concierge that demos the
 *   product and walks you through a guided click path.
 *
 * Usage:
 *   node scripts/generate-ai-concierge-talk-to-butler-ai-hero.mjs            (skips if PNG exists)
 *   node scripts/generate-ai-concierge-talk-to-butler-ai-hero.mjs --force
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const outDir = path.join(repoRoot, "public", "assets", "blog");
const SLUG = "ai-concierge-talk-to-butler-ai";

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

function chatBubble(cx, cy) {
  // A rounded chat bubble with a tail, holding a simple headset glyph
  // (an arc with a mic stem) to represent the voice/text concierge.
  return `
  <g transform="translate(${cx},${cy})" filter="url(#soft)">
    ${rr(-230, -170, 460, 320, 56, WHITE, `stroke="${SLATE_L}" stroke-width="3"`)}
    <path d="M -70 150 L -70 210 L -10 150 Z" fill="${WHITE}" stroke="${SLATE_L}" stroke-width="3"/>
    <path d="M -58 150 L -58 192 L -22 150 Z" fill="${WHITE}"/>
    <path d="M -110 -40 a 110 110 0 0 1 220 0" fill="none" stroke="${NAVY}" stroke-width="22" stroke-linecap="round"/>
    ${rr(-128, -40, 36, 92, 18, ORANGE)}
    ${rr(92, -40, 36, 92, 18, ORANGE)}
    ${rr(-14, 30, 28, 60, 14, NAVY_L)}
    ${circle(-74, 160, 14, SLATE_L)}
    ${circle(-20, 160, 14, ORANGE)}
    ${circle(34, 160, 14, SLATE_L)}
  </g>`;
}

function helperGlyph(cx, cy) {
  // A friendly abstract helper: a soft rounded blob body with two dot
  // "eyes" and a small raised arm, not a literal face or mascot.
  return `
  <g transform="translate(${cx},${cy})" filter="url(#soft)">
    ${rr(-130, -150, 260, 300, 110, ORANGE)}
    ${circle(96, -60, 34, ORANGE)}
    ${circle(-48, -30, 16, NAVY)}
    ${circle(30, -30, 16, NAVY)}
    <path d="M -46 30 q 46 36 92 0" fill="none" stroke="${NAVY}" stroke-width="10" stroke-linecap="round"/>
    ${circle(-150, 60, 26, "#FBE9CF")}
    ${circle(150, 20, 18, "#FBE9CF")}
  </g>`;
}

function spotlightButton(cx, cy) {
  // A dashed "guided tour" ring around a small rounded button, with a
  // pointer cursor nearby, representing the on-screen walkthrough that
  // highlights a control and waits for the next click.
  return `
  <g transform="translate(${cx},${cy})">
    <circle cx="0" cy="0" r="92" fill="none" stroke="${ORANGE}" stroke-width="6" stroke-dasharray="10 14" opacity="0.8"/>
    ${rr(-54, -22, 108, 44, 22, NAVY)}
    ${bar(-30, -6, 60, 12, ORANGE)}
    <path d="M 46 40 L 92 92 L 70 86 L 58 110 L 44 70 Z" fill="${NAVY_L}"/>
  </g>`;
}

function scene() {
  const sparkle = (x, y, s = 1) => `
  <g transform="translate(${x},${y}) scale(${s})" fill="${ORANGE}">
    <path d="M0 -22 L6 -6 L22 0 L6 6 L0 22 L-6 6 L-22 0 L-6 -6 Z"/>
  </g>`;

  const bubble = chatBubble(560, 420);
  const helper = helperGlyph(1040, 460);
  const spotlight = spotlightButton(800, 800);

  // A soft dotted "conversation" trail linking the bubble to the helper.
  const trail = `
  <g>
    ${circle(740, 400, 7, SLATE_L)}
    ${circle(790, 390, 7, SLATE_L)}
    ${circle(840, 400, 7, SLATE_L)}
  </g>`;

  const backdrop = rr(300, 140, 936, 760, 36, "#FBE9CF", `opacity="0.6"`);

  return `${backdrop}${bubble}${trail}${helper}${spotlight}${sparkle(400, 220, 1)}${sparkle(1180, 240, 0.7)}${sparkle(1180, 900, 0.6)}${sparkle(360, 900, 0.5)}`;
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
