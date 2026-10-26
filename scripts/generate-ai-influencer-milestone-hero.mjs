/**
 * Summary: Renders the branded SVG hero (1536x1024) for the blog post
 *   "ai-influencer-milestone-explained" using the locally installed Chrome/Edge
 *   in headless mode (same approach as generate-ai-influencer-butler-hero.mjs).
 *   No API key needed.
 *
 * Scene: a simple video-frame glyph with a soft progress/loading ring around it
 *   (implying it renders as a background job) next to a small celebratory
 *   confetti-burst / bottle-pop motif, representing an auto-generated
 *   milestone celebration clip.
 *
 * Usage:
 *   node scripts/generate-ai-influencer-milestone-hero.mjs            (skips if PNG exists)
 *   node scripts/generate-ai-influencer-milestone-hero.mjs --force
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const outDir = path.join(repoRoot, "public", "assets", "blog");
const SLUG = "ai-influencer-milestone-explained";

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

function confettiBurst(cx, cy, scale = 1) {
  // Small celebratory spark/confetti motif, built from simple rounded shapes.
  const pieces = [
    { dx: -60, dy: -70, w: 16, h: 28, rot: -24, fill: ORANGE },
    { dx: 10, dy: -92, w: 14, h: 24, rot: 8, fill: NAVY_L },
    { dx: 68, dy: -56, w: 16, h: 26, rot: 30, fill: PINK },
    { dx: -92, dy: -10, w: 14, h: 22, rot: -60, fill: BLUE },
    { dx: 88, dy: 4, w: 14, h: 22, rot: 58, fill: ORANGE_DEEP },
    { dx: -40, dy: 40, w: 12, h: 20, rot: -10, fill: NAVY_L },
    { dx: 46, dy: 48, w: 12, h: 20, rot: 16, fill: PINK },
  ];
  const confetti = pieces
    .map(
      (p) => `
    <g transform="translate(${cx + p.dx},${cy + p.dy}) rotate(${p.rot})">
      ${rr(-p.w / 2, -p.h / 2, p.w, p.h, p.w * 0.3, p.fill)}
    </g>`
    )
    .join("");

  return `
  <g transform="translate(0,0) scale(${scale})">
    ${circle(cx, cy, 34, ORANGE)}
    ${circle(cx, cy, 34, "none", `stroke="${WHITE}" stroke-width="3" opacity="0.6"`)}
    ${confetti}
  </g>`;
}

function videoFrame(cx, cy, s) {
  // Simple video-frame glyph: rounded rect with a centered play triangle,
  // wrapped in a dashed progress/loading ring to imply background rendering.
  const half = s / 2;
  return `
  <g transform="translate(${cx},${cy})">
    <circle cx="0" cy="0" r="${half + 46}" fill="none" stroke="${SLATE_L}" stroke-width="10" opacity="0.5"/>
    <circle cx="0" cy="0" r="${half + 46}" fill="none" stroke="${ORANGE}" stroke-width="10"
      stroke-linecap="round" stroke-dasharray="${Math.PI * 2 * (half + 46) * 0.62} ${Math.PI * 2 * (half + 46)}"
      transform="rotate(-90)"/>
    ${rr(-half, -half * 0.72, s, s * 0.72 * 2, 28, WHITE, `stroke="${SLATE_L}" stroke-width="3" filter="url(#soft)"`)}
    ${rr(-half + 20, -half * 0.72 + 20, s - 40, s * 0.72 * 2 - 40, 16, "#FBE9CF")}
    <g transform="translate(-26,-30)">
      <path d="M0 0 L58 30 L0 60 Z" fill="${NAVY}"/>
    </g>
  </g>`;
}

function endCard(x, y, w, h) {
  return `
  <g transform="translate(${x},${y})">
    ${rr(0, 0, w, h, 16, NAVY)}
    ${circle(30, h / 2, 14, ORANGE)}
    ${bar(56, h / 2 - 16, w - 100, 12, WHITE)}
    ${bar(56, h / 2 + 6, w - 160, 8, SLATE_L)}
  </g>`;
}

function scene() {
  const frameOuter = rr(430, 90, 676, 760, 28, WHITE, `stroke="${SLATE_L}" stroke-width="3" filter="url(#soft)"`);
  const frameInner = rr(460, 120, 616, 640, 18, "#FBE9CF");

  const video = videoFrame(768, 420, 320);
  const burst = confettiBurst(928, 236, 1);
  const smallBurst = confettiBurst(610, 236, 0.55);

  const card = endCard(530, 700, 476, 90);

  const thumbs = `
    ${circle(500, 790, 10, ORANGE)}
    ${bar(524, 782, 90, 10, SLATE_L)}
  `;

  // Floating sparkles outside the frame, echoing the celebration motif.
  const sparkle = (x, y, s = 1, fill = ORANGE) => `
  <g transform="translate(${x},${y}) scale(${s})" fill="${fill}">
    <path d="M0 -22 L6 -6 L22 0 L6 6 L0 22 L-6 6 L-22 0 L-6 -6 Z"/>
  </g>`;

  const orbit = [
    sparkle(180, 220, 1, ORANGE),
    sparkle(150, 520, 0.7, NAVY_L),
    sparkle(220, 800, 0.8, PINK),
    sparkle(1330, 240, 0.8, BLUE),
    sparkle(1360, 560, 0.6, ORANGE_DEEP),
    sparkle(1280, 830, 0.9, ORANGE),
  ].join("");

  return `${frameOuter}${frameInner}${video}${burst}${smallBurst}${card}${thumbs}${orbit}`;
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
