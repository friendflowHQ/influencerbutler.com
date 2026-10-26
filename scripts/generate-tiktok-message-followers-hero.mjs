/**
 * Summary: Renders the branded SVG hero (1536x1024) for the blog post
 *   "tiktok-message-followers-explained" using the locally installed
 *   Chrome/Edge in headless mode (same approach as
 *   generate-ai-influencer-butler-hero.mjs). No API key needed.
 *
 * Scene: a large chat-bubble icon holding a small fan of stacked
 *   "message template" cards (representing rotating templates) with a
 *   clock badge for the scheduled follow-up delay, surrounded by small
 *   follower avatars outside the frame to suggest outreach going out.
 *
 * Usage:
 *   node scripts/generate-tiktok-message-followers-hero.mjs            (skips if PNG exists)
 *   node scripts/generate-tiktok-message-followers-hero.mjs --force
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const outDir = path.join(repoRoot, "public", "assets", "blog");
const SLUG = "tiktok-message-followers-explained";

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

function avatar(cx, cy, s, fill) {
  // Simple geometric "follower" made of a head circle and shoulder shape.
  return `
  <g transform="translate(${cx},${cy})" filter="url(#soft)">
    ${circle(0, 0, s, WHITE, `stroke="${SLATE_L}" stroke-width="2"`)}
    ${circle(0, -s * 0.22, s * 0.34, fill)}
    ${rr(-s * 0.5, s * 0.18, s, s * 0.56, s * 0.3, fill)}
  </g>`;
}

function templateCard(x, y, w, h, rot, fill, lineFill, accent) {
  return `
  <g transform="translate(${x},${y}) rotate(${rot})">
    ${rr(0, 0, w, h, h * 0.16, fill, `stroke="${SLATE_L}" stroke-width="2"`)}
    ${circle(h * 0.32, h * 0.32, h * 0.14, accent)}
    ${bar(h * 0.62, h * 0.22, w * 0.52, h * 0.1, lineFill)}
    ${bar(h * 0.62, h * 0.42, w * 0.32, h * 0.08, lineFill)}
  </g>`;
}

function chatBubble(cx, cy, w, h) {
  const x = cx - w / 2;
  const y = cy - h / 2;
  const tail = `M ${x + w * 0.22} ${y + h} L ${x + w * 0.1} ${y + h * 1.22} L ${x + w * 0.42} ${y + h} Z`;
  return `
  <g filter="url(#soft)">
    ${rr(x, y, w, h, h * 0.22, ORANGE)}
    <path d="${tail}" fill="${ORANGE}"/>
  </g>`;
}

function clockBadge(cx, cy, r) {
  return `
  <g transform="translate(${cx},${cy})" filter="url(#soft)">
    ${circle(0, 0, r, WHITE, `stroke="${NAVY}" stroke-width="4"`)}
    <line x1="0" y1="0" x2="0" y2="${-r * 0.55}" stroke="${NAVY}" stroke-width="6" stroke-linecap="round"/>
    <line x1="0" y1="0" x2="${r * 0.4}" y2="${r * 0.12}" stroke="${ORANGE_DEEP}" stroke-width="6" stroke-linecap="round"/>
    ${circle(0, 0, r * 0.1, NAVY)}
  </g>`;
}

function scene() {
  const frameOuter = rr(430, 90, 676, 760, 28, WHITE, `stroke="${SLATE_L}" stroke-width="3" filter="url(#soft)"`);
  const frameInner = rr(460, 120, 616, 640, 18, "#FBE9CF");

  // Main DM icon: a big chat bubble with a small fan of "rotating template"
  // cards tucked into its lower-right corner, plus a clock badge for the
  // scheduled follow-up delay.
  const bubble = chatBubble(718, 360, 420, 260);

  const cards = [
    templateCard(838, 470, 190, 100, -8, NAVY_L, SLATE_L, "#8E9FC2"),
    templateCard(858, 512, 190, 100, 3, NAVY, SLATE_L, ORANGE),
    templateCard(874, 556, 190, 100, -3, WHITE, SLATE_L, ORANGE_DEEP),
  ].join("");

  const clock = clockBadge(1024, 640, 54);

  // Small dots inside the bubble suggesting a typed message, not literal text.
  const dots = [0, 1, 2]
    .map((i) => circle(658 + i * 42, 352, 12, WHITE, "opacity=\"0.9\""))
    .join("");

  // Follower avatars orbiting outside the frame, each with a small orange
  // "message sent" badge, implying outreach going out to real accounts.
  const sentBadge = (x, y) => `${circle(x, y, 16, ORANGE, `stroke="${WHITE}" stroke-width="3"`)}`;
  const orbit = [
    avatar(170, 220, 64, BLUE),
    avatar(140, 470, 54, PINK),
    avatar(190, 740, 70, "#FDE6C8"),
    avatar(1330, 240, 70, PINK),
    avatar(1360, 500, 56, BLUE),
    avatar(1300, 770, 66, "#FDE6C8"),
  ].join("");
  const badges = [
    sentBadge(220, 180, 1),
    sentBadge(182, 432, 1),
    sentBadge(246, 698, 1),
    sentBadge(1286, 198, 1),
    sentBadge(1312, 460, 1),
    sentBadge(1252, 732, 1),
  ].join("");

  const sparkle = (x, y, s = 1) => `
  <g transform="translate(${x},${y}) scale(${s})" fill="${ORANGE}">
    <path d="M0 -22 L6 -6 L22 0 L6 6 L0 22 L-6 6 L-22 0 L-6 -6 Z"/>
  </g>`;

  return `${frameOuter}${frameInner}${bubble}${dots}${cards}${clock}${orbit}${badges}${sparkle(768, 150, 1)}${sparkle(1180, 860, 0.7)}${sparkle(340, 860, 0.6)}`;
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
