/**
 * Summary: Renders branded SVG hero images (1536x1024) for the Foyer Butler and
 *   Walmart Butler blog posts added 2026-10-13, using the locally installed
 *   Chrome/Edge in headless mode (same approach as generate-openai-vs-chatgpt-hero.mjs).
 *   No API key needed. Each post's imagePrompt stays in content/blog/_index.json,
 *   so the heroes can later be regenerated with gpt-image-1 via
 *   scripts/generate-blog-images.mjs --force --only=<slug> if preferred.
 *
 * Usage:
 *   node scripts/generate-foyer-walmart-heroes.mjs            (skips existing PNGs)
 *   node scripts/generate-foyer-walmart-heroes.mjs --force
 *   node scripts/generate-foyer-walmart-heroes.mjs --only=slug-one,slug-two
 *
 * Dependencies: node:child_process, node:fs, node:os, node:path. A Chromium
 * browser on PATH candidates below or via CHROME_PATH.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const outDir = path.join(repoRoot, "public", "assets", "blog");

const args = process.argv.slice(2);
const force = args.includes("--force");
const only = (args.find((a) => a.startsWith("--only=")) ?? "").slice(7).split(",").filter(Boolean);

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

// Brand palette (matches the gpt-image-1 STYLE_SUFFIX: warm orange, deep navy, soft cream).
const NAVY = "#1E2A4A";
const ORANGE = "#F59E0B";
const ORANGE_DEEP = "#D97706";
const CREAM = "#FEF6EA";
const WHITE = "#FFFFFF";
const SLATE = "#94A3B8";
const SLATE_L = "#C7D2DE";
const MIST = "#EEF2F7";
const SKY = "#DBEAFE";
const SKY_DEEP = "#3B82F6";
const GREEN = "#16A34A";

// ---------- small SVG helpers ----------
const rr = (x, y, w, h, r, fill, extra = "") =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${fill}" ${extra}/>`;
const bar = (x, y, w, h = 12, fill = SLATE_L) => rr(x, y, w, h, h / 2, fill);
const circle = (cx, cy, r, fill, extra = "") => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}" ${extra}/>`;

// Product tile: image block on top, two text bars, optional orange badge.
function tile(x, y, w, h, { accent = ORANGE, badge = false, img = MIST } = {}) {
  const imgH = Math.round(h * 0.58);
  return `
  <g transform="translate(${x},${y})">
    ${rr(0, 0, w, h, 14, WHITE, `stroke="${MIST}" stroke-width="2"`)}
    ${rr(10, 10, w - 20, imgH, 10, img)}
    ${rr(w / 2 - 22, 10 + imgH / 2 - 10, 44, 20, 6, accent, "opacity=\"0.35\"")}
    ${bar(14, imgH + 20, w * 0.6, 9, SLATE_L)}
    ${bar(14, imgH + 36, w * 0.35, 9, accent)}
    ${badge ? `${rr(w - 58, 16, 46, 22, 11, accent)}<text x="${w - 35}" y="32" text-anchor="middle" font-size="14" font-weight="700" fill="${WHITE}">-40%</text>` : ""}
  </g>`;
}

function tileGrid(x, y, cols, rows, w, h, gap, opts = {}) {
  let s = "";
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      s += tile(x + c * (w + gap), y + r * (h + gap), w, h, { ...opts, badge: opts.badge && (r + c) % 2 === 0 });
    }
  }
  return s;
}

// Phone frame with a white screen. Returns the frame plus the screen origin.
function phone(x, y, w = 360, h = 660, { faded = false } = {}) {
  const frame = faded ? SLATE_L : NAVY;
  return `
  <g transform="translate(${x},${y})" filter="url(#soft)">
    ${rr(0, 0, w, h, 44, frame)}
    ${rr(12, 12, w - 24, h - 24, 34, faded ? "#F8FAFC" : WHITE)}
    ${rr(w / 2 - 50, 22, 100, 14, 7, frame)}
  </g>`;
}

function check(cx, cy, r = 16) {
  return `${circle(cx, cy, r, GREEN)}<path d="M${cx - r * 0.45} ${cy} l${r * 0.3} ${r * 0.3} l${r * 0.6} -${r * 0.65}" fill="none" stroke="${WHITE}" stroke-width="${Math.max(3, r / 5)}" stroke-linecap="round" stroke-linejoin="round"/>`;
}

function curvedArrow(x1, y1, x2, y2, color = ORANGE, lift = 120) {
  const mx = (x1 + x2) / 2;
  const my = Math.min(y1, y2) - lift;
  return `<path d="M${x1} ${y1} Q ${mx} ${my} ${x2} ${y2}" fill="none" stroke="${color}" stroke-width="10" stroke-linecap="round" stroke-dasharray="2 22" marker-end="url(#arrowhead)"/>`;
}

function envelope(x, y, w = 420, h = 280, open = true) {
  return `
  <g transform="translate(${x},${y})" filter="url(#soft)">
    ${rr(0, 0, w, h, 24, NAVY)}
    ${open ? `<path d="M0 24 L${w / 2} ${h * 0.55} L${w} 24" fill="${NAVY}"/><path d="M8 8 L${w / 2} -${h * 0.45} L${w - 8} 8 Z" fill="#2B3A62"/>` : ""}
    <path d="M0 ${h} L${w / 2} ${h * 0.45} L${w} ${h} Z" fill="#2B3A62"/>
  </g>`;
}

function clock(cx, cy, r = 56) {
  return `${circle(cx, cy, r, WHITE, `stroke="${NAVY}" stroke-width="8"`)}<path d="M${cx} ${cy - r * 0.55} V${cy} H${cx + r * 0.45}" fill="none" stroke="${ORANGE}" stroke-width="8" stroke-linecap="round"/>`;
}

function calendar(x, y, w = 150, h = 150) {
  return `
  <g transform="translate(${x},${y})" filter="url(#soft)">
    ${rr(0, 0, w, h, 18, WHITE)}
    ${rr(0, 0, w, 38, 18, ORANGE)}${rr(0, 20, w, 18, 0, ORANGE)}
    ${circle(32, 0, 9, NAVY)}${circle(w - 32, 0, 9, NAVY)}
    ${[0, 1, 2].map((r) => [0, 1, 2, 3].map((c) => rr(18 + c * 30, 52 + r * 28, 20, 18, 5, (r === 1 && c === 2) ? ORANGE : MIST)).join("")).join("")}
  </g>`;
}

function listCard(x, y, w = 420, h = 520, { accent = ORANGE, checks = false } = {}) {
  const rows = 5;
  let body = "";
  for (let i = 0; i < rows; i++) {
    const ry = 96 + i * 82;
    body += `${rr(24, ry, 60, 60, 12, MIST)}${rr(40, ry + 16, 28, 28, 6, accent, "opacity=\"0.5\"")}${bar(100, ry + 12, w * 0.5, 11)}${bar(100, ry + 34, w * 0.3, 11, accent)}`;
    if (checks) body += check(w - 44, ry + 30, 15);
  }
  return `
  <g transform="translate(${x},${y})" filter="url(#soft)">
    ${rr(0, 0, w, h, 28, WHITE)}
    ${bar(24, 28, w * 0.55, 18, NAVY)}
    ${bar(24, 58, w * 0.4, 11)}
    ${body}
  </g>`;
}

function collectionCard(x, y, w = 420, h = 520, { accent = SKY_DEEP, checks = false } = {}) {
  let body = "";
  const tw = (w - 48 - 16) / 2;
  const th = 118;
  for (let i = 0; i < 6; i++) {
    const c = i % 2;
    const r = Math.floor(i / 2);
    body += tile(24 + c * (tw + 16), 96 + r * (th + 16), tw, th, { accent, img: SKY });
    if (checks) body += check(24 + c * (tw + 16) + tw - 18, 96 + r * (th + 16) + 18, 13);
  }
  return `
  <g transform="translate(${x},${y})" filter="url(#soft)">
    ${rr(0, 0, w, h, 28, WHITE)}
    ${bar(24, 28, w * 0.55, 18, NAVY)}
    ${bar(24, 58, w * 0.4, 11, accent)}
    ${body}
  </g>`;
}

// Shared frame: background, soft shapes, wordmark, scene.
function frame(scene) {
  return `<!doctype html>
<html><head><meta charset="utf-8" />
<style>html,body{margin:0;padding:0}#stage{width:1536px;height:1024px}svg{display:block}</style>
</head><body><div id="stage">
<svg width="1536" height="1024" viewBox="0 0 1536 1024" xmlns="http://www.w3.org/2000/svg" font-family="Segoe UI, Arial, sans-serif">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${CREAM}"/><stop offset="1" stop-color="#FBE9CF"/></linearGradient>
    <filter id="soft" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="10" stdDeviation="18" flood-color="${NAVY}" flood-opacity="0.10"/></filter>
    <marker id="arrowhead" markerWidth="36" markerHeight="36" refX="18" refY="18" orient="auto" markerUnits="userSpaceOnUse"><path d="M4 4 L34 18 L4 32 Z" fill="${ORANGE}"/></marker>
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
  ${scene}
</svg></div></body></html>`;
}

// ---------- scenes ----------
const SCENES = {
  // Phone with a bio page: avatar, name, tile grid, subscribe form; envelope and coins beside it.
  "foyer-butler-link-in-bio-that-sells": () => `
    ${phone(588, 190, 360, 680)}
    <g transform="translate(600,202)">
      ${circle(168, 86, 42, ORANGE)}${circle(168, 76, 14, WHITE)}${rr(146, 92, 44, 26, 13, WHITE)}
      ${bar(108, 142, 120, 12, NAVY)}${bar(88, 164, 160, 9)}
      ${tileGrid(28, 196, 2, 2, 134, 128, 14)}
      ${rr(28, 486, 282, 46, 23, MIST)}${bar(46, 503, 150, 10)}
      ${rr(28, 544, 282, 48, 24, ORANGE)}${bar(118, 563, 100, 10, WHITE)}
      ${circle(96, 630, 12, SLATE_L)}${circle(140, 630, 12, SLATE_L)}${circle(184, 630, 12, SLATE_L)}${circle(228, 630, 12, SLATE_L)}
    </g>
    ${envelope(220, 420, 300, 200, true)}
    ${circle(1140, 420, 46, ORANGE)}${circle(1140, 420, 30, ORANGE_DEEP)}<text x="1140" y="434" text-anchor="middle" font-size="40" font-weight="700" fill="${WHITE}">$</text>
    ${circle(1210, 520, 36, ORANGE)}${circle(1210, 520, 22, ORANGE_DEEP)}
    ${circle(1120, 590, 28, ORANGE)}${circle(1120, 590, 16, ORANGE_DEEP)}
    <g transform="translate(1040,660)" filter="url(#soft)">${rr(0, 0, 260, 150, 22, WHITE)}${bar(22, 24, 120, 12, NAVY)}
      <polyline points="22,118 70,96 118,104 166,70 214,58 238,40" fill="none" stroke="${ORANGE}" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/></g>`,

  // Phone with deal grid and % badges; refresh arrow and clock; category pills.
  "foyer-butler-todays-deals-on-your-page": () => `
    ${phone(588, 190, 360, 680)}
    <g transform="translate(600,202)">
      ${bar(108, 60, 120, 14, NAVY)}
      ${rr(28, 96, 76, 30, 15, ORANGE)}${rr(112, 96, 76, 30, 15, MIST)}${rr(196, 96, 76, 30, 15, MIST)}
      ${tileGrid(28, 146, 2, 4, 134, 112, 12, { badge: true })}
    </g>
    <g transform="translate(1130,330)">
      ${circle(0, 0, 110, WHITE, "filter=\"url(#soft)\"")}
      <path d="M-62 -10 A64 64 0 1 1 -10 62" fill="none" stroke="${ORANGE}" stroke-width="16" stroke-linecap="round"/>
      <path d="M-80 -30 L-62 -10 L-40 -34 Z" fill="${ORANGE}"/>
    </g>
    ${clock(1180, 620, 60)}
    <g transform="translate(200,360)">
      ${rr(0, 0, 230, 54, 27, WHITE, "filter=\"url(#soft)\"")}${circle(30, 27, 12, ORANGE)}${bar(56, 21, 130, 12)}
      ${rr(0, 76, 230, 54, 27, WHITE, "filter=\"url(#soft)\"")}${circle(30, 103, 12, SKY_DEEP)}${bar(56, 97, 110, 12)}
      ${rr(0, 152, 230, 54, 27, WHITE, "filter=\"url(#soft)\"")}${circle(30, 179, 12, GREEN)}${bar(56, 173, 140, 12)}
    </g>`,

  // Open envelope with a newsletter sheet of deal tiles sliding out; clock and calendar.
  "foyer-butler-newsletter-that-writes-itself": () => `
    <g transform="translate(330,520)">
      <path d="M8 8 L230 -200 L452 8 Z" fill="#2B3A62" filter="url(#soft)"/>
      <g transform="translate(60,-300)" filter="url(#soft)">
        ${rr(0, 0, 340, 420, 18, WHITE)}
        ${bar(26, 26, 200, 16, NAVY)}${bar(26, 54, 150, 10)}
        ${tileGrid(26, 86, 2, 2, 140, 120, 14, { badge: true })}
        ${rr(26, 346, 288, 44, 22, ORANGE)}${bar(120, 363, 100, 10, WHITE)}
      </g>
      ${rr(0, 0, 460, 300, 24, NAVY)}
      <path d="M0 300 L230 120 L460 300 Z" fill="#2B3A62"/>
      <path d="M0 0 L230 190 L460 0" fill="none" stroke="#2B3A62" stroke-width="14" stroke-linejoin="round"/>
    </g>
    ${clock(1120, 420, 64)}
    ${calendar(1030, 560, 180, 170)}`,

  // Download tile with a book, email form, subscriber chart.
  "foyer-butler-free-download-grows-your-list": () => `
    <g transform="translate(300,230)" filter="url(#soft)">
      ${rr(0, 0, 520, 560, 30, WHITE)}
      ${rr(40, 40, 440, 290, 18, MIST)}
      <g transform="translate(180,90)">
        ${rr(0, 0, 160, 200, 12, NAVY)}${rr(0, 0, 22, 200, 6, ORANGE)}${bar(44, 40, 90, 12, WHITE)}${bar(44, 64, 70, 10, SLATE)}${bar(44, 84, 80, 10, SLATE)}
      </g>
      ${circle(440, 300, 44, ORANGE)}<path d="M440 278 V318 M422 302 L440 320 L458 302" fill="none" stroke="${WHITE}" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>
      ${bar(40, 360, 260, 16, NAVY)}${bar(40, 390, 180, 10)}
      ${rr(40, 428, 440, 50, 25, MIST)}${bar(62, 447, 170, 11)}
      ${rr(40, 492, 440, 50, 25, ORANGE)}${bar(190, 511, 140, 11, WHITE)}
    </g>
    <g transform="translate(930,300)" filter="url(#soft)">
      ${rr(0, 0, 400, 420, 28, WHITE)}
      ${bar(30, 30, 180, 14, NAVY)}${bar(30, 56, 120, 10)}
      ${[0, 1, 2, 3].map((i) => `<line x1="30" y1="${110 + i * 70}" x2="370" y2="${110 + i * 70}" stroke="${MIST}" stroke-width="2"/>`).join("")}
      <polyline points="40,340 100,318 160,300 220,250 280,210 340,150" fill="none" stroke="${ORANGE}" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/>
      ${circle(340, 150, 14, ORANGE)}${circle(340, 150, 7, WHITE)}
    </g>
    ${circle(1160, 250, 34, ORANGE)}${circle(1160, 250, 20, ORANGE_DEEP)}`,

  // Two phones: faded buttons page on the left, bright tiles page on the right, arrow carrying tiles.
  "switch-link-in-bio-tool-to-foyer-butler": () => `
    ${phone(250, 250, 340, 620, { faded: true })}
    <g transform="translate(262,262)">
      ${circle(158, 80, 36, SLATE_L)}${bar(98, 130, 120, 10, SLATE_L)}
      ${[0, 1, 2, 3, 4].map((i) => `${rr(30, 170 + i * 72, 256, 52, 26, "#E2E8F0")}${bar(110, 191 + i * 72, 96, 10, SLATE_L)}`).join("")}
    </g>
    ${phone(940, 250, 340, 620)}
    <g transform="translate(952,262)">
      ${circle(158, 80, 36, ORANGE)}${bar(98, 130, 120, 10, NAVY)}
      ${tileGrid(26, 160, 2, 3, 128, 118, 12)}
    </g>
    ${curvedArrow(610, 420, 920, 420, ORANGE, 150)}
    <g transform="translate(700,250)">${tile(0, 0, 100, 90)}</g>
    <g transform="translate(790,300)">${tile(0, 0, 100, 90)}</g>`,

  // List card matched into a collection card, with checks.
  "walmart-collection-builder-amazon-list-to-collection": () => `
    ${listCard(190, 240, 420, 540, { accent: ORANGE })}
    ${collectionCard(930, 240, 420, 540, { accent: SKY_DEEP, checks: true })}
    ${curvedArrow(630, 420, 910, 420, ORANGE, 160)}
    ${check(768, 300, 34)}`,

  // Shop front with lists feeding a conveyor into a stack of finished collections, progress bar below.
  "recreate-amazon-storefront-on-walmart": () => `
    <g transform="translate(170,250)" filter="url(#soft)">
      ${rr(0, 60, 420, 420, 26, WHITE)}
      ${rr(-14, 40, 448, 60, 16, ORANGE)}
      ${[0, 1, 2, 3, 4, 5, 6].map((i) => rr(-14 + i * 64, 40, 32, 60, 0, ORANGE_DEEP)).join("")}
      ${rr(-14, 100, 448, 14, 7, NAVY)}
      ${[0, 1, 2].map((i) => `${rr(30, 140 + i * 105, 360, 86, 16, MIST)}${rr(46, 156 + i * 105, 54, 54, 10, WHITE)}${bar(116, 164 + i * 105, 180, 11)}${bar(116, 186 + i * 105, 120, 11, ORANGE)}`).join("")}
    </g>
    <path d="M620 640 H940" stroke="${NAVY}" stroke-width="14" stroke-linecap="round"/>
    ${[0, 1, 2, 3, 4].map((i) => circle(650 + i * 65, 640, 14, WHITE, `stroke="${NAVY}" stroke-width="6"`)).join("")}
    ${[0, 1, 2].map((i) => `<g transform="translate(${660 + i * 90},${560})">${tile(0, 0, 70, 60, { accent: SKY_DEEP, img: SKY })}</g>`).join("")}
    <g transform="translate(980,250)">
      ${[2, 1].map((i) => `<g transform="translate(${i * 22},${i * 26})" filter="url(#soft)">${rr(0, 0, 360, 300, 22, WHITE)}</g>`).join("")}
      <g filter="url(#soft)">${rr(0, 0, 360, 300, 22, WHITE)}${bar(24, 26, 180, 14, NAVY)}${tileGrid(24, 60, 2, 2, 150, 100, 12, { accent: SKY_DEEP, img: SKY })}${check(330, 30, 20)}</g>
    </g>
    ${rr(260, 840, 1016, 26, 13, MIST)}${rr(260, 840, 720, 26, 13, GREEN)}`,

  // Collection card with collage cover becoming a social post, queue behind it.
  "share-walmart-collections-on-facebook": () => `
    <g transform="translate(200,260)" filter="url(#soft)">
      ${rr(0, 0, 400, 500, 28, WHITE)}
      ${rr(24, 24, 170, 150, 14, SKY)}${rr(206, 24, 170, 150, 14, MIST)}${rr(24, 186, 170, 150, 14, MIST)}${rr(206, 186, 170, 150, 14, SKY)}
      ${bar(24, 366, 220, 16, NAVY)}${bar(24, 394, 160, 11, SKY_DEEP)}
      ${rr(24, 430, 352, 44, 22, SKY)}${bar(120, 447, 160, 10, SKY_DEEP)}
    </g>
    ${curvedArrow(620, 480, 900, 480, ORANGE, 150)}
    <g transform="translate(930,260)">${[2, 1].map((i) => `<g transform="translate(${i * 26},${i * 24})" filter="url(#soft)">${rr(0, 0, 400, 500, 26, WHITE, "opacity=\"0.85\"")}</g>`).join("")}</g>
    <g transform="translate(930,260)" filter="url(#soft)">
      ${rr(0, 0, 400, 500, 26, WHITE)}
      ${circle(46, 46, 24, ORANGE)}${bar(84, 34, 150, 12, NAVY)}${bar(84, 54, 90, 9)}
      ${bar(24, 96, 352, 11)}${bar(24, 116, 300, 11)}${bar(24, 136, 200, 11, ORANGE)}
      ${rr(24, 168, 352, 240, 16, SKY)}${rr(44, 188, 150, 100, 10, WHITE)}${rr(206, 188, 150, 100, 10, WHITE)}${rr(44, 298, 312, 90, 10, WHITE)}
      ${rr(24, 430, 120, 44, 22, MIST)}<path d="M50 455 h14 v-18 l10 -14 l6 4 l-4 12 h20 a8 8 0 0 1 8 8 l-6 16 a10 10 0 0 1 -10 6 h-24 z" fill="${ORANGE}"/>${bar(110, 447, 22, 10, SLATE)}
    </g>`,

  // Hub with six orbiting tool chips.
  "walmart-butler-tools-explained": () => {
    const cx = 768, cy = 560, R = 300;
    const icons = [
      // list
      `${bar(-22, -14, 44, 8, WHITE)}${bar(-22, 0, 44, 8, WHITE)}${bar(-22, 14, 30, 8, WHITE)}`,
      // play
      `<path d="M-14 -20 L22 0 L-14 20 Z" fill="${WHITE}"/>`,
      // photo
      `${rr(-24, -18, 48, 36, 6, WHITE)}<path d="M-18 12 L-6 -2 L4 8 L12 0 L18 12 Z" fill="${NAVY}"/>${circle(10, -8, 4, NAVY)}`,
      // chart
      `<polyline points="-22,14 -8,2 4,8 22,-14" fill="none" stroke="${WHITE}" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>`,
      // dollar
      `<text x="0" y="12" text-anchor="middle" font-size="36" font-weight="700" fill="${WHITE}">$</text>`,
      // link
      `<path d="M-6 8 a12 12 0 0 1 0 -17 l8 -8 a12 12 0 0 1 17 17 l-4 4 M6 -8 a12 12 0 0 1 0 17 l-8 8 a12 12 0 0 1 -17 -17 l4 -4" fill="none" stroke="${WHITE}" stroke-width="6" stroke-linecap="round"/>`,
    ];
    let chips = "";
    for (let i = 0; i < 6; i++) {
      const a = (-90 + i * 60) * Math.PI / 180;
      const x = cx + Math.cos(a) * R;
      const y = cy + Math.sin(a) * R;
      const fill = i % 2 === 0 ? ORANGE : SKY_DEEP;
      chips += `<line x1="${cx}" y1="${cy}" x2="${x}" y2="${y}" stroke="${NAVY}" stroke-width="4" stroke-dasharray="2 14" stroke-linecap="round" opacity="0.5"/>`;
      chips += `<g transform="translate(${x},${y})" filter="url(#soft)">${circle(0, 0, 64, WHITE)}${circle(0, 0, 50, fill)}${icons[i]}</g>`;
    }
    return `
    ${circle(cx, cy, R, "none", `stroke="${NAVY}" stroke-width="3" stroke-dasharray="4 18" opacity="0.35"`)}
    ${chips}
    <g transform="translate(${cx},${cy})" filter="url(#soft)">
      ${circle(0, 0, 120, WHITE)}${circle(0, 0, 100, NAVY)}
      <path d="M-40 10 q40 -46 80 0" fill="none" stroke="${ORANGE}" stroke-width="12" stroke-linecap="round"/>
      ${circle(0, -30, 20, ORANGE)}
    </g>`;
  },

  // Three stepping-down bars with cart / partial cart / coin icons, receipt beside.
  "walmart-creator-sales-vs-commission-explained": () => {
    const base = 800;
    const cart = (x, y, full) => `
      <g transform="translate(${x},${y})">
        <path d="M-40 -30 h14 l12 46 h52 l10 -32 h-66" fill="none" stroke="${NAVY}" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>
        ${circle(-6, 28, 7, NAVY)}${circle(30, 28, 7, NAVY)}
        ${full ? `${rr(-10, -46, 14, 14, 3, ORANGE)}${rr(8, -52, 14, 20, 3, ORANGE)}${rr(26, -46, 14, 14, 3, ORANGE)}` : `${rr(8, -46, 14, 14, 3, ORANGE)}`}
      </g>`;
    return `
    <g transform="translate(300,0)">
      ${rr(0, base - 520, 200, 520, 26, NAVY, "filter=\"url(#soft)\"")}${cart(100, base - 580, true)}
      ${rr(280, base - 300, 200, 300, 26, ORANGE, "filter=\"url(#soft)\"")}${cart(380, base - 360, false)}
      ${rr(560, base - 110, 200, 110, 26, ORANGE_DEEP, "filter=\"url(#soft)\"")}
      ${circle(660, base - 170, 40, ORANGE)}${circle(660, base - 170, 26, ORANGE_DEEP)}<text x="660" y="${base - 158}" text-anchor="middle" font-size="34" font-weight="700" fill="${WHITE}">$</text>
      <line x1="-40" y1="${base}" x2="820" y2="${base}" stroke="${NAVY}" stroke-width="6" stroke-linecap="round"/>
    </g>
    <g transform="translate(1160,300)" filter="url(#soft)">
      ${rr(0, 0, 220, 420, 18, WHITE)}
      <path d="M0 420 l22 -18 l22 18 l22 -18 l22 18 l22 -18 l22 18 l22 -18 l22 18 l22 -18 l22 18 Z" fill="${CREAM}"/>
      ${bar(26, 30, 120, 14, NAVY)}
      ${[0, 1, 2, 3, 4, 5].map((i) => `${bar(26, 76 + i * 44, 100, 10)}${bar(150, 76 + i * 44, 44, 10, i === 5 ? ORANGE : SLATE_L)}`).join("")}
      <line x1="26" y1="340" x2="194" y2="340" stroke="${MIST}" stroke-width="3"/>
      ${bar(26, 360, 80, 12, NAVY)}${bar(140, 360, 54, 12, ORANGE)}
    </g>`;
  },
};

// ---------- render ----------
fs.mkdirSync(outDir, { recursive: true });
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ib-heroes-"));
let made = 0;
for (const [slug, scene] of Object.entries(SCENES)) {
  if (only.length && !only.includes(slug)) continue;
  const outPath = path.join(outDir, `${slug}.png`);
  if (!force && fs.existsSync(outPath)) {
    console.log(`skip ${slug} (exists)`);
    continue;
  }
  const htmlPath = path.join(tmpDir, `${slug}.html`);
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
  console.log(`wrote ${path.relative(repoRoot, outPath)} (${Math.round(size / 1024)} KB)`);
  made++;
}
console.log(`done: ${made} hero(es) using ${path.basename(browser)}`);
