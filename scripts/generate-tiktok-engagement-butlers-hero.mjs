/**
 * Summary: Renders the branded SVG hero (1536x1024) for the blog post
 *   "tiktok-engagement-butlers-explained" using the locally installed
 *   Chrome/Edge in headless mode (same approach as
 *   generate-ai-influencer-butler-hero.mjs). No API key needed.
 *
 * Scene: a heart icon, a follow (plus-person) icon, and a chat-bubble icon,
 *   each inside its own badge, arranged left to right inside a branded
 *   picture frame, with small clock glyphs and timing dots between them,
 *   representing three paced, scheduled engagement actions.
 *
 * Usage:
 *   node scripts/generate-tiktok-engagement-butlers-hero.mjs            (skips if PNG exists)
 *   node scripts/generate-tiktok-engagement-butlers-hero.mjs --force
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const outDir = path.join(repoRoot, "public", "assets", "blog");
const SLUG = "tiktok-engagement-butlers-explained";

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

function iconBadge(cx, cy, r, fill) {
  return `
  <g filter="url(#soft)">
    ${circle(cx, cy, r, WHITE, `stroke="${SLATE_L}" stroke-width="3"`)}
    ${circle(cx, cy, r - 10, fill)}
  </g>`;
}

function heartIcon(cx, cy, s, fill) {
  // A simple rounded heart, built from two lobes and a point.
  return `
  <g transform="translate(${cx},${cy}) scale(${s})">
    <path d="M0,30 C-36,6 -48,-20 -24,-36 C-10,-46 0,-36 0,-24 C0,-36 10,-46 24,-36 C48,-20 36,6 0,30 Z" fill="${fill}"/>
  </g>`;
}

function followIcon(cx, cy, s, fill, badgeFill) {
  // A person silhouette with a small "plus" badge, standing in for "follow."
  return `
  <g transform="translate(${cx},${cy}) scale(${s})">
    ${circle(-8, -24, 18, fill)}
    ${rr(-32, 2, 48, 38, 19, fill)}
    <g transform="translate(24,-8)">
      ${circle(0, 0, 16, badgeFill)}
      <path d="M0 -8 L0 8 M-8 0 L8 0" stroke="${WHITE}" stroke-width="4" stroke-linecap="round"/>
    </g>
  </g>`;
}

function chatBubble(cx, cy, s, fill, dotFill) {
  // A rounded speech bubble with a small tail and three dots, standing in for "comment."
  return `
  <g transform="translate(${cx},${cy}) scale(${s})">
    ${rr(-36, -28, 72, 50, 20, fill)}
    <path d="M-12,22 L-12,40 L6,22 Z" fill="${fill}"/>
    ${circle(-16, -3, 5, dotFill)}${circle(0, -3, 5, dotFill)}${circle(16, -3, 5, dotFill)}
  </g>`;
}

function clockGlyph(cx, cy, r, fill) {
  // A small clock face, standing in for the delay/pacing between actions.
  return `
  <g transform="translate(${cx},${cy})">
    ${circle(0, 0, r, WHITE, `stroke="${fill}" stroke-width="3"`)}
    <path d="M0 ${-r * 0.55} L0 0 L${r * 0.45} ${r * 0.15}" stroke="${fill}" stroke-width="3" stroke-linecap="round" fill="none"/>
  </g>`;
}

function timingDots(cx, cy, fill) {
  return [circle(cx - 16, cy, 5, fill), circle(cx, cy, 5, fill), circle(cx + 16, cy, 5, fill)].join("");
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

  // Three paced engagement actions, arranged left to right: like, follow, comment.
  const rowY = 520;
  const xHeart = 560;
  const xFollow = 768;
  const xChat = 976;
  const badgeR = 92;

  const badges = [
    iconBadge(xHeart, rowY, badgeR, "#FDE3C8"),
    iconBadge(xFollow, rowY, badgeR, "#E4E9F2"),
    iconBadge(xChat, rowY, badgeR, "#FDE3C8"),
  ].join("");

  const icons = [
    heartIcon(xHeart, rowY, 1, ORANGE_DEEP),
    followIcon(xFollow, rowY, 1, NAVY, ORANGE),
    chatBubble(xChat, rowY, 1, NAVY, ORANGE),
  ].join("");

  // Small clock glyphs and timing dots between each icon, implying the delay between actions.
  const connectors = [
    clockGlyph((xHeart + xFollow) / 2, rowY - 48, 22, SLATE),
    timingDots((xHeart + xFollow) / 2, rowY + 48, SLATE),
    clockGlyph((xFollow + xChat) / 2, rowY - 48, 22, SLATE),
    timingDots((xFollow + xChat) / 2, rowY + 48, SLATE),
  ].join("");

  // Small caption bars under each badge, implying an account row being engaged with.
  const labels = [xHeart, xFollow, xChat]
    .map(
      (x) => `
    ${bar(x - 60, rowY + 128, 120, 12, SLATE_L)}
    ${bar(x - 40, rowY + 150, 80, 10, "#E7D9BE")}`
    )
    .join("");

  // Floating clock glyphs orbiting outside the frame, echoing the scheduler.
  const orbit = [
    clockGlyph(170, 260, 36, ORANGE),
    clockGlyph(1330, 300, 30, NAVY_L),
    clockGlyph(150, 760, 28, NAVY_L),
    clockGlyph(1340, 760, 34, ORANGE),
  ].join("");

  const sparkle = (x, y, s = 1) => `
  <g transform="translate(${x},${y}) scale(${s})" fill="${ORANGE}">
    <path d="M0 -22 L6 -6 L22 0 L6 6 L0 22 L-6 6 L-22 0 L-6 -6 Z"/>
  </g>`;

  return `${frameOuter}${frameInner}${titleBand}${badges}${icons}${connectors}${labels}${orbit}${sparkle(768, 110, 1)}${sparkle(1180, 860, 0.7)}${sparkle(340, 860, 0.6)}`;
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
