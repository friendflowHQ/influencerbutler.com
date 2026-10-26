/**
 * Summary: Renders the branded SVG hero (1536x1024) for the blog post
 *   "how-influencer-butler-testimonials-work" using the locally installed
 *   Chrome/Edge in headless mode (same approach as
 *   generate-ai-influencer-butler-hero.mjs). No API key needed.
 *
 * Scene: a large quote-bubble shape inside a branded picture frame, with a
 *   row of star shapes beneath it and a small checkmark "approved" badge
 *   overlapping its corner, plus small floating review-card chips (avatar
 *   circle + text bars) orbiting outside the frame, representing collected
 *   and moderated testimonials.
 *
 * Usage:
 *   node scripts/generate-how-influencer-butler-testimonials-work-hero.mjs            (skips if PNG exists)
 *   node scripts/generate-how-influencer-butler-testimonials-work-hero.mjs --force
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const outDir = path.join(repoRoot, "public", "assets", "blog");
const SLUG = "how-influencer-butler-testimonials-work";

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

// Five-pointed star, used both for the big rating row inside the frame and
// as small flourishes scattered around the scene.
function star(cx, cy, r, fill, extra = "") {
  const pts = [];
  for (let i = 0; i < 10; i++) {
    const rad = i % 2 === 0 ? r : r * 0.42;
    const ang = (-90 + i * 36) * (Math.PI / 180);
    pts.push(`${cx + rad * Math.cos(ang)},${cy + rad * Math.sin(ang)}`);
  }
  return `<polygon points="${pts.join(" ")}" fill="${fill}" ${extra}/>`;
}

function starRow(cx, cy, count, filled, r = 26, gap = 64) {
  const start = cx - ((count - 1) * gap) / 2;
  const out = [];
  for (let i = 0; i < count; i++) {
    out.push(star(start + i * gap, cy, r, i < filled ? ORANGE : SLATE_L));
  }
  return out.join("");
}

// A rounded speech-bubble shape with a small tail, holding two soft text bars
// (standing in for a line of testimonial copy) rather than literal words.
function quoteBubble(x, y, w, h) {
  const tailSize = 36;
  return `
  <g filter="url(#soft)">
    ${rr(x, y, w, h, 32, WHITE)}
    <path d="M${x + 80} ${y + h} l0 ${tailSize} l${tailSize} ${-tailSize}z" fill="${WHITE}"/>
    <path d="M${x + 44} ${y + 54} q14 -20 34 0" fill="none" stroke="${ORANGE}" stroke-width="10" stroke-linecap="round"/>
    ${bar(x + 44, y + 96, w - 88, 16, "#FBE9CF")}
    ${bar(x + 44, y + 128, w - 140, 16, "#FBE9CF")}
    ${bar(x + 44, y + 160, w - 190, 16, "#FBE9CF")}
  </g>`;
}

// Small "approved" badge: a filled circle with a simple checkmark stroke.
function checkBadge(cx, cy, r) {
  return `
  <g filter="url(#soft)">
    ${circle(cx, cy, r, NAVY)}
    ${circle(cx, cy, r - 6, "none", `stroke="${CREAM}" stroke-width="3" opacity="0.25"`)}
    <path d="M${cx - r * 0.45} ${cy} l${r * 0.3} ${r * 0.32} l${r * 0.55} ${-r * 0.6}" fill="none" stroke="${ORANGE}" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/>
  </g>`;
}

// Small floating review card: an avatar circle plus two text bars, standing
// in for one collected testimonial drifting outside the main frame.
function reviewCard(x, y, w, h, avatarFill) {
  return `
  <g transform="translate(${x},${y})" filter="url(#soft)">
    ${rr(0, 0, w, h, 18, WHITE, `stroke="${SLATE_L}" stroke-width="2"`)}
    ${circle(30, h / 2, 16, avatarFill)}
    ${bar(56, h / 2 - 14, w - 80, 10, "#FBE9CF")}
    ${bar(56, h / 2 + 6, w - 120, 10, MIST)}
  </g>`;
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

  const bubble = quoteBubble(538, 266, 460, 260);
  const rating = starRow(768, 600, 5, 4, 30, 72);
  const badge = checkBadge(916, 526, 46);

  // Floating review-card chips orbiting outside the frame, implying many
  // testimonials come in, only a curated few are ever shown up front.
  const orbit = [
    reviewCard(120, 210, 230, 86, PINK),
    reviewCard(90, 420, 210, 86, BLUE),
    reviewCard(130, 660, 220, 86, "#FDE6C8"),
    reviewCard(1200, 220, 220, 86, BLUE),
    reviewCard(1230, 460, 210, 86, "#FDE6C8"),
    reviewCard(1190, 700, 230, 86, PINK),
  ].join("");

  const sparkle = (x, y, s = 1) => `
  <g transform="translate(${x},${y}) scale(${s})" fill="${ORANGE}">
    <path d="M0 -22 L6 -6 L22 0 L6 6 L0 22 L-6 6 L-22 0 L-6 -6 Z"/>
  </g>`;

  return `${frameOuter}${frameInner}${titleBand}${bubble}${rating}${badge}${orbit}${sparkle(768, 110, 1)}${sparkle(1180, 860, 0.7)}${sparkle(340, 860, 0.6)}`;
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
