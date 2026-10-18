/**
 * Summary: Renders the branded SVG hero (1536x1024) for the blog post
 *   "why-influencer-butler-is-a-desktop-app-not-a-cloud-app" using the locally
 *   installed Chrome/Edge in headless mode (same approach as
 *   generate-foyer-walmart-heroes.mjs). No API key needed. The post's
 *   imagePrompt stays in content/blog/_index.json so the hero can later be
 *   regenerated with gpt-image-1 via scripts/generate-blog-images.mjs
 *   --force --only=<slug> if preferred.
 *
 * Scene: left, a laptop at home with its own single wifi signal and a green
 *   check ("your connection"); right, a data center rack crowded with identical
 *   browser windows sharing one address, with an amber warning triangle.
 *
 * Usage:
 *   node scripts/generate-desktop-vs-cloud-hero.mjs            (skips if PNG exists)
 *   node scripts/generate-desktop-vs-cloud-hero.mjs --force
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
const SLUG = "why-influencer-butler-is-a-desktop-app-not-a-cloud-app";

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
const MIST = "#EEF2F7";
const GREEN = "#16A34A";
const RED = "#DC2626";

const rr = (x, y, w, h, r, fill, extra = "") =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${fill}" ${extra}/>`;
const bar = (x, y, w, h = 12, fill = SLATE_L) => rr(x, y, w, h, h / 2, fill);
const circle = (cx, cy, r, fill, extra = "") => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}" ${extra}/>`;

function check(cx, cy, r = 16) {
  return `${circle(cx, cy, r, GREEN)}<path d="M${cx - r * 0.45} ${cy} l${r * 0.3} ${r * 0.3} l${r * 0.6} -${r * 0.65}" fill="none" stroke="${WHITE}" stroke-width="${Math.max(3, r / 5)}" stroke-linecap="round" stroke-linejoin="round"/>`;
}

// Three concentric wifi arcs above a point.
function wifi(cx, cy, color = ORANGE, scale = 1) {
  // Concentric quarter-arcs centred on the dot, each spanning 45 degrees either
  // side of straight up (sweep flag 1 = clockwise from the left end, over the top).
  const arcs = [1, 2, 3].map((i) => {
    const r = 34 * i * scale;
    const dx = r * 0.707;
    const dy = r * 0.707;
    return `<path d="M${cx - dx} ${cy - dy} A${r} ${r} 0 0 1 ${cx + dx} ${cy - dy}" fill="none" stroke="${color}" stroke-width="${10 * scale}" stroke-linecap="round"/>`;
  });
  return `${circle(cx, cy, 10 * scale, color)}${arcs.join("")}`;
}

// Small browser window glyph (used en masse on the server side).
function browserWin(x, y, w = 64, h = 46, tint = SLATE_L) {
  return `
  <g transform="translate(${x},${y})">
    ${rr(0, 0, w, h, 6, WHITE, `stroke="${tint}" stroke-width="2"`)}
    ${rr(0, 0, w, 12, 6, tint)}${rr(0, 6, w, 6, 0, tint)}
    ${circle(8, 6, 2.5, WHITE)}${circle(16, 6, 2.5, WHITE)}${circle(24, 6, 2.5, WHITE)}
    ${bar(8, 20, w * 0.6, 5, MIST)}${bar(8, 30, w * 0.4, 5, MIST)}
  </g>`;
}

function warningTriangle(cx, cy, s = 70) {
  return `
  <g transform="translate(${cx},${cy})" filter="url(#soft)">
    <path d="M0 ${-s} L${s * 0.95} ${s * 0.7} L${-s * 0.95} ${s * 0.7} Z" fill="${ORANGE}" stroke="${WHITE}" stroke-width="8" stroke-linejoin="round"/>
    ${rr(-7, -s * 0.45, 14, s * 0.7, 6, NAVY)}
    ${circle(0, s * 0.45, 8, NAVY)}
  </g>`;
}

// ---------- scene ----------
function scene() {
  // LEFT: home. Laptop on a desk, one wifi signal, a big green check.
  const laptop = `
  <g transform="translate(150,420)" filter="url(#soft)">
    ${rr(60, 0, 440, 290, 22, NAVY)}
    ${rr(78, 18, 404, 254, 14, WHITE)}
    ${rr(0, 290, 560, 26, 10, NAVY_L)}
    ${rr(230, 290, 100, 8, 4, SLATE)}
    <!-- app window on screen -->
    ${rr(96, 36, 368, 32, 8, CREAM)}
    ${circle(112, 52, 6, ORANGE)}${bar(126, 47, 120, 10, NAVY)}
    ${bar(96, 86, 200, 12, SLATE_L)}
    ${bar(96, 110, 300, 12, SLATE_L)}
    ${rr(96, 140, 368, 50, 10, MIST)}
    ${circle(120, 165, 12, GREEN)}<path d="M114 165 l4 4 l8 -9" fill="none" stroke="${WHITE}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
    ${bar(142, 160, 150, 10, NAVY)}
    ${bar(300, 160, 140, 10, GREEN)}
    ${bar(96, 206, 240, 12, SLATE_L)}
    ${bar(96, 230, 180, 12, SLATE_L)}
  </g>`;

  // Simple house outline behind the laptop to say "home".
  const house = `
  <g transform="translate(160,120)" opacity="0.9">
    <path d="M0 220 L250 20 L500 220" fill="none" stroke="${NAVY}" stroke-width="16" stroke-linecap="round" stroke-linejoin="round"/>
    ${rr(40, 220, 420, 20, 10, NAVY)}
    ${rr(380, 70, 44, 90, 8, NAVY)}
  </g>`;

  const homeSignal = wifi(410, 300, ORANGE, 1.1);
  const homeCheck = check(690, 450, 44);

  // RIGHT: data center rack crowded with identical browser windows, one shared cable, a warning.
  const rack = (() => {
    let s = `
  <g transform="translate(880,170)" filter="url(#soft)">
    ${rr(0, 0, 520, 640, 28, NAVY)}
    ${rr(18, 18, 484, 604, 18, NAVY_L)}`;
    // Rack unit stripes.
    for (let i = 0; i < 7; i++) {
      const y = 36 + i * 84;
      s += `${rr(34, y, 452, 68, 12, NAVY)}${circle(58, y + 34, 7, i % 3 === 0 ? RED : GREEN)}${circle(80, y + 34, 7, GREEN)}${bar(104, y + 28, 90, 10, SLATE)}`;
    }
    s += `</g>`;
    // Crowd of identical browser windows spilling over the rack.
    const cols = 6;
    const rows = 5;
    const cx = 880 + 70;
    const cy = 170 + 120;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const jitterX = ((r * 7 + c * 13) % 9) - 4;
        const jitterY = ((r * 11 + c * 5) % 7) - 3;
        s += browserWin(cx + c * 66 + jitterX, cy + r * 54 + jitterY, 60, 42, (r + c) % 4 === 0 ? ORANGE : SLATE_L);
      }
    }
    return s;
  })();

  // One cable from the rack to a single shared address pin.
  const sharedAddress = `
  <path d="M1140 810 C1140 880 1140 880 1140 900" fill="none" stroke="${NAVY}" stroke-width="10" stroke-linecap="round"/>
  <g transform="translate(1140,930)" filter="url(#soft)">
    ${rr(-150, -24, 300, 48, 24, WHITE, `stroke="${SLATE_L}" stroke-width="2"`)}
    ${circle(-120, 0, 12, ORANGE_DEEP)}
    ${bar(-96, -6, 220, 12, SLATE)}
  </g>`;

  const warn = warningTriangle(1360, 150, 64);

  // Divider between the two halves.
  const divider = `<line x1="768" y1="150" x2="768" y2="940" stroke="${NAVY}" stroke-width="4" stroke-dasharray="2 22" stroke-linecap="round" opacity="0.35"/>`;

  // Rank the two sides with a check vs the warning (no words).
  return `${house}${homeSignal}${laptop}${homeCheck}${divider}${rack}${sharedAddress}${warn}`;
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
