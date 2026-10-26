/**
 * Summary: Renders the branded SVG hero (1536x1024) for the blog post
 *   "voiceover-butler-explained" using the locally installed Chrome/Edge
 *   in headless mode (same approach as generate-desktop-vs-cloud-hero.mjs).
 *   No API key needed.
 *
 * Scene: a script "page" icon on the left flowing, as a soundwave of bars,
 *   into a simple geometric video-frame icon with a play mark on the right,
 *   inside a branded picture frame, representing a tool that writes the
 *   words a creator reads out loud on camera (not an audio generator).
 *
 * Usage:
 *   node scripts/generate-voiceover-butler-hero.mjs            (skips if PNG exists)
 *   node scripts/generate-voiceover-butler-hero.mjs --force
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const outDir = path.join(repoRoot, "public", "assets", "blog");
const SLUG = "voiceover-butler-explained";

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

  // The script, a simple "page" icon with lines of text standing in for the
  // written words Voiceover Butler produces.
  const page = `
  <g filter="url(#soft)">
    ${rr(498, 300, 200, 280, 20, WHITE, `stroke="${SLATE_L}" stroke-width="3"`)}
    ${bar(526, 330, 144, 14, ORANGE)}
    ${bar(526, 358, 140, 10, SLATE_L)}
    ${bar(526, 380, 104, 10, SLATE_L)}
    ${bar(526, 402, 140, 10, SLATE_L)}
    ${bar(526, 424, 80, 10, SLATE_L)}
    ${bar(526, 446, 126, 10, SLATE_L)}
    ${bar(526, 476, 96, 10, MIST)}
    ${bar(526, 498, 112, 10, MIST)}
  </g>`;

  // A soundwave of bars carrying the script toward the camera, standing in
  // for reading it out loud (this tool writes words, never the audio itself).
  const waveHeights = [20, 38, 60, 86, 60, 38, 20];
  const wave = waveHeights
    .map((h, i) => {
      const x = 712 + i * 20;
      const y = 440 - h / 2;
      const fill = i % 2 === 0 ? ORANGE : ORANGE_DEEP;
      return rr(x, y, 12, h, 6, fill);
    })
    .join("");

  // The finished video, a simple geometric frame with a play mark, that the
  // script is read into on camera.
  const videoCx = 962;
  const videoCy = 440;
  const videoFrame = `
  <g filter="url(#soft)">
    ${rr(862, 300, 200, 280, 26, NAVY)}
    ${rr(888, 326, 148, 128, 14, NAVY_L)}
    ${circle(videoCx, videoCy, 42, CREAM)}
    <path d="M${videoCx - 12} ${videoCy - 24} L${videoCx - 12} ${videoCy + 24} L${videoCx + 24} ${videoCy} Z" fill="${ORANGE}"/>
    ${bar(888, 480, 148, 12, ORANGE)}
    ${bar(888, 504, 96, 10, SLATE_L)}
    ${bar(888, 526, 116, 10, SLATE_L)}
  </g>`;

  // Soft ripple rings, the words becoming sound once read aloud.
  const ripples = [
    circle(videoCx, videoCy, 64, "none", `stroke="${ORANGE}" stroke-width="3" opacity="0.35"`),
    circle(videoCx, videoCy, 86, "none", `stroke="${ORANGE}" stroke-width="3" opacity="0.2"`),
  ].join("");

  const sparkle = (x, y, s = 1) => `
  <g transform="translate(${x},${y}) scale(${s})" fill="${ORANGE}">
    <path d="M0 -22 L6 -6 L22 0 L6 6 L0 22 L-6 6 L-22 0 L-6 -6 Z"/>
  </g>`;

  return `${frameOuter}${frameInner}${titleBand}${page}${wave}${videoFrame}${ripples}${sparkle(768, 700, 0.8)}${sparkle(1180, 860, 0.7)}${sparkle(340, 860, 0.6)}`;
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
