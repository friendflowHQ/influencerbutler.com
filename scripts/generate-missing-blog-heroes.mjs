/**
 * Summary: Renders a branded SVG hero (1536x1024 PNG) for every blog post whose
 *   `image` file is missing from public/, using the locally installed Chrome or
 *   Edge in headless mode (same look and approach as the per-post
 *   generate-*-hero.mjs scripts). No API key needed.
 *
 *   Posts hand-added to content/blog/_index.json without running an image
 *   generator used to ship with a broken hero (the Black Friday 2026 cluster).
 *   Run this after adding posts; scripts/ensure-blog-images.mjs (prebuild)
 *   is the last-resort guard that drops in the generic fallback instead.
 *
 *   Scene choice: SCENES_BY_SLUG for hand-picked posts, otherwise a keyword
 *   match on the post's id/title/imagePrompt, otherwise the category scene.
 *
 * Usage:
 *   node scripts/generate-missing-blog-heroes.mjs              (only missing images)
 *   node scripts/generate-missing-blog-heroes.mjs --only=<slug>
 *   node scripts/generate-missing-blog-heroes.mjs --only=<slug> --force
 *   node scripts/generate-missing-blog-heroes.mjs --fallback   (re-render public/assets/blog/_fallback.png)
 *   node scripts/generate-missing-blog-heroes.mjs --dry-run    (list what would be rendered)
 *
 * Dependencies: node:child_process, node:fs, node:os, node:path. Chrome or Edge
 *   (set CHROME_PATH to override).
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const publicDir = path.join(repoRoot, "public");
const manifestPath = path.join(repoRoot, "content", "blog", "_index.json");
const FALLBACK_REL = "/assets/blog/_fallback.png";

const args = process.argv.slice(2);
const force = args.includes("--force");
const dryRun = args.includes("--dry-run");
const renderFallback = args.includes("--fallback");
const onlyArg = args.find((a) => a.startsWith("--only="));
const only = onlyArg ? onlyArg.split("=")[1] : null;

// ---------- palette + primitives (matches the other hero scripts) ----------
const NAVY = "#1E2A4A";
const NAVY_L = "#2B3A62";
const ORANGE = "#F59E0B";
const ORANGE_DEEP = "#D97706";
const CREAM = "#FEF6EA";
const PEACH = "#FBE9CF";
const WHITE = "#FFFFFF";
const SLATE = "#94A3B8";
const SLATE_L = "#C7D2DE";
const PINK = "#F6C6CE";
const BLUE = "#BFD7EA";
const GREEN = "#2F9E6E";

const rr = (x, y, w, h, r, fill, extra = "") =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${fill}" ${extra}/>`;
const bar = (x, y, w, h = 12, fill = SLATE_L, extra = "") => rr(x, y, w, h, h / 2, fill, extra);
const circle = (cx, cy, r, fill, extra = "") => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}" ${extra}/>`;
const sparkle = (x, y, s = 1, fill = ORANGE) =>
  `<g transform="translate(${x},${y}) scale(${s})" fill="${fill}"><path d="M0 -22 L6 -6 L22 0 L6 6 L0 22 L-6 6 L-22 0 L-6 -6 Z"/></g>`;
const check = (cx, cy, r = 18, fill = GREEN) =>
  `${circle(cx, cy, r, fill)}<path d="M${cx - r * 0.45} ${cy} l${r * 0.32} ${r * 0.34} l${r * 0.6} -${r * 0.66}" fill="none" stroke="${WHITE}" stroke-width="${Math.max(3, r / 5)}" stroke-linecap="round" stroke-linejoin="round"/>`;

function panel(x, y, w, h, fill = PEACH) {
  return `${rr(x, y, w, h, 28, fill, `stroke="${SLATE_L}" stroke-width="3" filter="url(#soft)"`)}
  <g transform="translate(${x + 30},${y + 30})">${circle(14, 14, 12, NAVY)}${bar(36, 6, 160, 14, NAVY)}${bar(36, 26, 100, 8, SLATE)}</g>`;
}

function priceTag(x, y, rot = 0, fill = ORANGE, s = 1) {
  // A hanging sale tag with a hole and a percent-ish mark (no text).
  return `<g transform="translate(${x},${y}) rotate(${rot}) scale(${s})" filter="url(#soft)">
    <path d="M0 0 L70 0 L110 40 L70 80 L0 80 Z" fill="${fill}"/>
    ${circle(78, 40, 8, CREAM)}
    ${circle(22, 26, 7, WHITE)}${circle(46, 56, 7, WHITE)}
    <path d="M48 20 L20 62" stroke="${WHITE}" stroke-width="5" stroke-linecap="round"/>
  </g>`;
}

function productTile(x, y, w, h, accent = BLUE, done = false) {
  return `<g filter="url(#soft)">
    ${rr(x, y, w, h, 18, WHITE, `stroke="${SLATE_L}" stroke-width="2"`)}
    ${rr(x + 16, y + 16, w - 32, h * 0.5, 12, accent)}
    ${bar(x + 16, y + h * 0.5 + 30, w - 60, 12, NAVY_L)}
    ${bar(x + 16, y + h * 0.5 + 52, (w - 32) * 0.55, 10, SLATE_L)}
    ${done ? check(x + w - 20, y + 20, 20) : ""}
  </g>`;
}

function phone(x, y, w, h, inner = "") {
  return `<g filter="url(#soft)">
    ${rr(x, y, w, h, 42, NAVY)}
    ${rr(x + 14, y + 18, w - 28, h - 36, 30, WHITE)}
    ${bar(x + w / 2 - 34, y + 8, 68, 8, NAVY_L)}
    ${inner}
  </g>`;
}

function laptop(x, y, w, h, inner = "") {
  return `<g filter="url(#soft)">
    ${rr(x, y, w, h, 20, NAVY)}
    ${rr(x + 18, y + 18, w - 36, h - 36, 10, WHITE)}
    <path d="M${x - 50} ${y + h} L${x + w + 50} ${y + h} L${x + w + 20} ${y + h + 34} L${x - 20} ${y + h + 34} Z" fill="${NAVY_L}"/>
    ${inner}
  </g>`;
}

function chart(x, y, w, h, points, color = ORANGE) {
  const pts = points.map(([px, py]) => `${x + px * w},${y + h - py * h}`).join(" ");
  const area = `${x},${y + h} ${pts} ${x + w},${y + h}`;
  return `<polygon points="${area}" fill="${color}" opacity="0.15"/>
    <polyline points="${pts}" fill="none" stroke="${color}" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>
    ${points.map(([px, py], i) => (i === points.length - 1 ? circle(x + px * w, y + h - py * h, 12, color, `stroke="${WHITE}" stroke-width="4"`) : "")).join("")}`;
}

function giftBox(x, y, s, fill = ORANGE, ribbon = NAVY) {
  return `<g transform="translate(${x},${y})" filter="url(#soft)">
    ${rr(0, s * 0.3, s, s * 0.7, 10, fill)}
    ${rr(-8, s * 0.16, s + 16, s * 0.2, 8, ORANGE_DEEP)}
    ${rr(s / 2 - 9, s * 0.16, 18, s * 0.84, 4, ribbon)}
    <path d="M${s / 2} ${s * 0.16} q-34 -40 -46 -6 q8 14 46 6 q38 8 46 -6 q-12 -34 -46 6" fill="${ribbon}"/>
  </g>`;
}

function warning(x, y, s = 1) {
  return `<g transform="translate(${x},${y}) scale(${s})" filter="url(#soft)">
    <path d="M0 -60 L56 40 L-56 40 Z" fill="${ORANGE}" stroke="${ORANGE_DEEP}" stroke-width="6" stroke-linejoin="round"/>
    ${rr(-6, -28, 12, 40, 6, NAVY)}${circle(0, 26, 7, NAVY)}
  </g>`;
}

function clock(cx, cy, r, hand = 60) {
  return `<g filter="url(#soft)">${circle(cx, cy, r, WHITE, `stroke="${NAVY}" stroke-width="8"`)}
    <path d="M${cx} ${cy} L${cx} ${cy - r * 0.6}" stroke="${NAVY}" stroke-width="8" stroke-linecap="round"/>
    <path d="M${cx} ${cy} L${cx + r * 0.45 * Math.cos((hand * Math.PI) / 180)} ${cy - r * 0.45 * Math.sin((hand * Math.PI) / 180)}" stroke="${ORANGE}" stroke-width="8" stroke-linecap="round"/>
    ${circle(cx, cy, 8, NAVY)}</g>`;
}

function flag(x, y) {
  let cells = "";
  for (let r = 0; r < 4; r++) for (let c = 0; c < 6; c++) {
    cells += rr(x + 12 + c * 26, y + r * 24, 26, 24, 0, (r + c) % 2 === 0 ? NAVY : WHITE);
  }
  return `<g filter="url(#soft)">${rr(x, y - 6, 12, 300, 6, NAVY_L)}${rr(x + 12, y, 156, 96, 4, WHITE, `stroke="${NAVY}" stroke-width="3"`)}${cells}</g>`;
}

function shareIcon(cx, cy, fill = NAVY_L) {
  return `<g>${circle(cx, cy, 30, WHITE, `stroke="${SLATE_L}" stroke-width="3" filter="url(#soft)"`)}
    ${circle(cx - 10, cy, 6, fill)}${circle(cx + 10, cy - 11, 6, fill)}${circle(cx + 10, cy + 11, 6, fill)}
    <path d="M${cx - 10} ${cy} L${cx + 10} ${cy - 11} M${cx - 10} ${cy} L${cx + 10} ${cy + 11}" stroke="${fill}" stroke-width="3"/></g>`;
}

const orbit = (seed = 0) => {
  const spots = [
    [180, 260, 46, PINK], [150, 520, 34, BLUE], [210, 780, 40, "#FDE6C8"],
    [1340, 240, 42, BLUE], [1360, 540, 32, PINK], [1300, 800, 44, "#FDE6C8"],
  ];
  return spots.map(([x, y, r, f], i) => circle(x + ((seed * 13 + i * 7) % 20) - 10, y, r, f, `opacity="0.9"`)).join("");
};

// ---------- scenes ----------
const SCENES = {
  // Planning board with columns of idea cards and a lightbulb.
  ideasBoard() {
    const px = 380, py = 150, pw = 780, ph = 700;
    let cols = "";
    const fills = [PINK, BLUE, "#FDE6C8"];
    for (let c = 0; c < 3; c++) {
      const cx = px + 40 + c * 245;
      cols += rr(cx, py + 110, 220, 540, 18, WHITE, `opacity="0.7"`);
      cols += bar(cx + 20, py + 130, 110, 14, NAVY_L);
      for (let i = 0; i < 4 - (c % 2); i++) {
        const cy = py + 170 + i * 115;
        cols += `<g filter="url(#soft)">${rr(cx + 16, cy, 188, 96, 14, fills[(c + i) % 3])}${bar(cx + 34, cy + 22, 120, 12, NAVY_L)}${bar(cx + 34, cy + 46, 90, 10, WHITE)}${i === 0 ? circle(cx + 178, cy + 24, 10, ORANGE) : ""}</g>`;
      }
    }
    const bulb = `<g transform="translate(1220,250)" filter="url(#soft)">${circle(0, 0, 70, ORANGE)}${rr(-30, 60, 60, 40, 10, NAVY_L)}${bar(-24, 106, 48, 10, NAVY)}<path d="M-20 10 q20 -40 40 0" fill="none" stroke="${WHITE}" stroke-width="7" stroke-linecap="round"/></g>`;
    return `${panel(px, py, pw, ph)}${cols}${bulb}${priceTag(250, 620, -14)}${sparkle(1260, 140, 0.8)}${sparkle(320, 220, 0.6)}`;
  },

  // Countdown calendar with sale tags.
  countdown() {
    const cx = 420, cy = 170, cw = 700, ch = 640;
    let days = "";
    for (let r = 0; r < 4; r++) for (let c = 0; c < 7; c++) {
      const x = cx + 40 + c * 92, y = cy + 190 + r * 100;
      const hot = r === 3 && c >= 4;
      days += rr(x, y, 76, 80, 12, hot ? ORANGE : WHITE, hot ? "" : `stroke="${SLATE_L}" stroke-width="2"`);
      if (r === 3 && c === 4) days += circle(x + 38, y + 40, 18, NAVY);
      else if (!hot) days += bar(x + 14, y + 14, 26, 10, SLATE_L);
    }
    const cal = `<g filter="url(#soft)">${rr(cx, cy, cw, ch, 28, WHITE, `stroke="${SLATE_L}" stroke-width="3"`)}${rr(cx, cy, cw, 140, 28, NAVY)}${rr(cx, cy + 100, cw, 40, 0, NAVY)}
      ${rr(cx + 150, cy - 30, 22, 70, 11, ORANGE)}${rr(cx + cw - 172, cy - 30, 22, 70, 11, ORANGE)}${bar(cx + 50, cy + 60, 240, 20, WHITE)}${bar(cx + 50, cy + 92, 140, 12, SLATE_L)}</g>`;
    return `${cal}${days}${clock(1240, 300, 80, 30)}${priceTag(200, 400, -18)}${priceTag(1180, 560, 14, NAVY_L)}${priceTag(250, 640, 10, ORANGE_DEEP, 0.8)}${sparkle(1150, 160, 0.8)}`;
  },

  // Storefront grid with checkmarks.
  storefront() {
    const lx = 380, ly = 170;
    const accents = [BLUE, PINK, "#FDE6C8", PINK, "#FDE6C8", BLUE];
    let tiles = "";
    for (let i = 0; i < 6; i++) {
      tiles += productTile(lx + 50 + (i % 3) * 250, ly + 120 + Math.floor(i / 3) * 280, 220, 250, accents[i], true);
    }
    const head = `${rr(lx + 50, ly + 50, 720, 50, 14, PEACH)}${circle(lx + 80, ly + 75, 14, ORANGE)}${bar(lx + 106, ly + 68, 200, 14, NAVY_L)}`;
    const clip = `<g transform="translate(1210,360)" filter="url(#soft)">${rr(0, 0, 190, 250, 18, WHITE, `stroke="${SLATE_L}" stroke-width="3"`)}${rr(60, -16, 70, 32, 10, NAVY)}
      ${[0, 1, 2, 3].map((i) => `${check(36, 56 + i * 50, 13)}${bar(60, 50 + i * 50, 100, 12, SLATE_L)}`).join("")}</g>`;
    return `${laptop(lx, ly, 820, 700, head + tiles)}${clip}${priceTag(180, 300, -12)}${sparkle(1300, 200, 0.8)}${sparkle(220, 760, 0.6)}`;
  },

  // Curated gift list with gift boxes and share icons.
  giftList() {
    const lx = 470, ly = 140, lw = 520, lh = 720;
    const rows = [0, 1, 2, 3].map((i) => {
      const y = ly + 140 + i * 135;
      return `<g filter="url(#soft)">${rr(lx + 36, y, lw - 72, 110, 18, i % 2 ? CREAM : WHITE, `stroke="${SLATE_L}" stroke-width="2"`)}${rr(lx + 54, y + 16, 78, 78, 14, [PINK, BLUE, "#FDE6C8", PINK][i])}${bar(lx + 150, y + 30, 200, 14, NAVY_L)}${bar(lx + 150, y + 58, 130, 10, SLATE_L)}${circle(lx + lw - 80, y + 55, 16, i === 1 ? ORANGE : SLATE_L)}</g>`;
    }).join("");
    return `${panel(lx, ly, lw, lh, WHITE)}${rows}${giftBox(1090, 520, 170)}${giftBox(1180, 330, 120, PINK, ORANGE_DEEP)}${giftBox(250, 560, 150, BLUE, ORANGE)}${shareIcon(1110, 220)}${shareIcon(330, 330, ORANGE_DEEP)}${sparkle(1280, 760, 0.8)}${sparkle(380, 180, 0.6)}`;
  },

  // Phone showing a story with a link sticker and a sale tag.
  story() {
    const x = 590, y = 110, w = 360, h = 760;
    const inner = `${rr(x + 14, y + 18, w - 28, h - 36, 30, "#FDE6C8")}
      ${[0, 1, 2].map((i) => bar(x + 40 + i * 98, y + 40, 86, 6, i === 0 ? NAVY : WHITE)).join("")}
      ${circle(x + 60, y + 86, 20, ORANGE)}${bar(x + 92, y + 78, 110, 12, NAVY_L)}
      ${rr(x + 60, y + 170, w - 120, 260, 22, WHITE)}${rr(x + 90, y + 200, w - 180, 170, 14, BLUE)}${bar(x + 90, y + 390, 150, 14, NAVY_L)}
      <g filter="url(#soft)">${rr(x + 70, y + 480, w - 140, 70, 35, WHITE)}${circle(x + 112, y + 515, 18, ORANGE)}
        <path d="M${x + 104} ${y + 515} h16 M${x + 112} ${y + 507} v16" stroke="${WHITE}" stroke-width="5" stroke-linecap="round"/>${bar(x + 142, y + 508, 120, 14, NAVY_L)}</g>
      ${circle(x + w / 2, y + 650, 32, WHITE, `stroke="${NAVY_L}" stroke-width="4"`)}`;
    const heart = (hx, hy, s, f) => `<path transform="translate(${hx},${hy}) scale(${s})" d="M0 12 C-20 -8 -40 10 0 40 C40 10 20 -8 0 12 Z" fill="${f}" filter="url(#soft)"/>`;
    return `${phone(x, y, w, h, inner)}${priceTag(990, 260, 12)}${priceTag(400, 520, -16, NAVY_L)}${heart(1110, 560, 2.2, PINK)}${heart(430, 260, 1.6, ORANGE)}${sparkle(1080, 160, 0.8)}${sparkle(470, 780, 0.6)}`;
  },

  // Winding path with warning signs and a creator marker stepping around them.
  pitfalls() {
    const path1 = `<path d="M200 860 C 480 860, 420 560, 760 560 S 1080 300, 1340 260" fill="none" stroke="${WHITE}" stroke-width="90" stroke-linecap="round" filter="url(#soft)"/>
      <path d="M200 860 C 480 860, 420 560, 760 560 S 1080 300, 1340 260" fill="none" stroke="${SLATE_L}" stroke-width="6" stroke-dasharray="26 22" stroke-linecap="round"/>`;
    const holes = `${rr(520, 740, 140, 46, 23, NAVY_L, `opacity="0.85"`)}${rr(940, 470, 130, 42, 21, NAVY_L, `opacity="0.85"`)}`;
    const walker = `<g transform="translate(780,500)" filter="url(#soft)">${circle(0, -64, 30, ORANGE)}${rr(-30, -32, 60, 80, 24, NAVY)}${circle(0, -64, 12, CREAM)}</g>`;
    return `${path1}${holes}${warning(590, 680, 1.1)}${warning(1005, 410, 1)}${warning(380, 470, 0.8)}${walker}${flag(1290, 120)}${sparkle(1180, 180, 0.7)}${sparkle(300, 300, 0.6)}`;
  },

  // Dropping price chart beside a phone posting in real time, with a clock.
  liveDrop() {
    const cx = 330, cy = 180, cw = 640, ch = 560;
    const card = `<g filter="url(#soft)">${rr(cx, cy, cw, ch, 26, WHITE, `stroke="${SLATE_L}" stroke-width="3"`)}</g>${circle(cx + 50, cy + 50, 14, ORANGE)}${bar(cx + 76, cy + 42, 180, 14, NAVY_L)}
      ${[0, 1, 2, 3].map((i) => bar(cx + 40, cy + 140 + i * 100, cw - 80, 3, SLATE_L)).join("")}
      ${chart(cx + 50, cy + 120, cw - 100, 380, [[0, 0.9], [0.2, 0.85], [0.4, 0.7], [0.55, 0.72], [0.75, 0.38], [1, 0.12]], ORANGE_DEEP)}
      <path d="M${cx + cw - 70} ${cy + 380} l0 70 l-22 -22 m22 22 l22 -22" fill="none" stroke="${NAVY}" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>`;
    const px = 1050, py = 230, pw = 280, ph = 560;
    const inner = `${[0, 1, 2].map((i) => `<g>${rr(px + 34, py + 70 + i * 150, pw - 68, 130, 16, i === 0 ? "#FDE6C8" : CREAM)}${rr(px + 48, py + 86 + i * 150, 70, 70, 12, [BLUE, PINK, BLUE][i])}${bar(px + 130, py + 96 + i * 150, 90, 12, NAVY_L)}${bar(px + 130, py + 120 + i * 150, 60, 10, i === 0 ? ORANGE : SLATE_L)}</g>`).join("")}`;
    return `${card}${phone(px, py, pw, ph, inner)}${clock(1000, 180, 70, 80)}${priceTag(200, 760, -10)}${sparkle(1380, 860, 0.7)}${sparkle(260, 200, 0.6)}`;
  },

  // Brand campaign cards with boost arrows.
  campaignBoost() {
    const cards = [
      [420, 230, PINK, true], [700, 170, BLUE, false], [980, 230, "#FDE6C8", true],
      [560, 520, "#FDE6C8", false], [840, 520, PINK, true],
    ].map(([x, y, f, hot]) => `<g filter="url(#soft)">${rr(x, y, 240, 260, 22, WHITE, `stroke="${hot ? ORANGE : SLATE_L}" stroke-width="${hot ? 5 : 3}"`)}${rr(x + 20, y + 20, 200, 110, 14, f)}${circle(x + 44, y + 162, 16, NAVY_L)}${bar(x + 72, y + 154, 130, 14, NAVY_L)}${bar(x + 24, y + 196, 190, 18, PEACH)}${bar(x + 24, y + 196, hot ? 160 : 80, 18, ORANGE)}${hot ? `<g transform="translate(${x + 200},${y - 6})">${circle(0, 0, 26, ORANGE)}<path d="M0 12 V-12 M-10 -2 L0 -12 L10 -2" stroke="${WHITE}" stroke-width="5" fill="none" stroke-linecap="round" stroke-linejoin="round"/></g>` : ""}</g>`).join("");
    return `${cards}${priceTag(200, 420, -14)}${priceTag(1260, 620, 12, NAVY_L)}${sparkle(1290, 300, 0.8)}${sparkle(300, 760, 0.6)}${sparkle(760, 860, 0.5)}`;
  },

  // Laptop full of deals heading to a finish flag.
  finishLine() {
    const lx = 300, ly = 220, lw = 720, lh = 470;
    let grid = "";
    for (let i = 0; i < 6; i++) {
      const x = lx + 50 + (i % 3) * 210, y = ly + 50 + Math.floor(i / 3) * 190;
      grid += `${rr(x, y, 190, 170, 14, [BLUE, PINK, "#FDE6C8"][i % 3])}${rr(x + 110, y + 14, 66, 34, 17, ORANGE)}${bar(x + 18, y + 128, 110, 12, NAVY_L)}`;
    }
    const track = `<path d="M1040 840 L1440 840" stroke="${WHITE}" stroke-width="40" stroke-linecap="round"/>${[0, 1, 2, 3].map((i) => rr(1060 + i * 90, 834, 50, 12, 6, SLATE_L)).join("")}`;
    return `${laptop(lx, ly, lw, lh, grid)}${track}${flag(1170, 420)}<path d="M1060 760 q120 -140 260 -260" fill="none" stroke="${ORANGE}" stroke-width="10" stroke-dasharray="6 18" stroke-linecap="round"/>${priceTag(190, 280, -12)}${sparkle(1300, 300, 0.8)}${sparkle(1100, 220, 0.6)}`;
  },

  // Rising momentum chart with an upward arrow.
  momentum() {
    const cx = 340, cy = 180, cw = 860, ch = 640;
    const card = `<g filter="url(#soft)">${rr(cx, cy, cw, ch, 28, WHITE, `stroke="${SLATE_L}" stroke-width="3"`)}</g>${circle(cx + 54, cy + 54, 16, ORANGE)}${bar(cx + 84, cy + 44, 200, 16, NAVY_L)}${bar(cx + 84, cy + 70, 120, 10, SLATE_L)}`;
    let bars = "";
    const hs = [0.35, 0.3, 0.42, 0.5, 0.62, 0.78];
    hs.forEach((h, i) => {
      const bw = 90, x = cx + 70 + i * 128, bh = h * 420;
      bars += rr(x, cy + ch - 60 - bh, bw, bh, 14, i >= 4 ? ORANGE : PEACH);
    });
    const arrow = `<path d="M${cx + 90} ${cy + 420} C ${cx + 380} ${cy + 380}, ${cx + 560} ${cy + 260}, ${cx + 780} ${cy + 150}" fill="none" stroke="${NAVY}" stroke-width="10" stroke-linecap="round"/>
      <path d="M${cx + 740} ${cy + 140} L${cx + 790} ${cy + 146} L${cx + 772} ${cy + 194}" fill="none" stroke="${NAVY}" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/>`;
    return `${card}${bars}${arrow}${priceTag(1240, 300, 14)}${clock(240, 700, 60, 120)}${sparkle(1300, 760, 0.8)}${sparkle(260, 260, 0.6)}`;
  },

  // Generic article scene for categories without a better match.
  article() {
    const px = 430, py = 120, pw = 680, ph = 760;
    const body = `${rr(px + 30, py + 120, pw - 60, 280, 20, BLUE)}${circle(px + 180, py + 260, 60, "#FDE6C8")}${rr(px + 300, py + 200, 250, 140, 18, WHITE, `opacity="0.85"`)}
      ${[0, 1, 2, 3, 4].map((i) => bar(px + 30, py + 440 + i * 50, (pw - 60) * [1, 0.92, 0.84, 0.95, 0.6][i], 14, i === 0 ? NAVY_L : SLATE_L)).join("")}`;
    return `${panel(px, py, pw, ph, WHITE)}${body}${priceTag(220, 420, -12)}${shareIcon(1240, 300)}${sparkle(1250, 760, 0.8)}${sparkle(330, 220, 0.6)}`;
  },
};

// Hand-picked scenes for posts that already exist.
const SCENES_BY_SLUG = {
  "black-friday-content-ideas-creators": "ideasBoard",
  "black-friday-creator-playbook-2026": "countdown",
  "black-friday-storefront-checklist": "storefront",
  "black-friday-benable-gift-lists": "giftList",
  "black-friday-instagram-stories": "story",
  "black-friday-mistakes-to-avoid": "pitfalls",
  "black-friday-real-time-posting": "liveDrop",
  "creator-connections-black-friday": "campaignBoost",
  "cyber-monday-creator-tactics": "finishLine",
  "day-after-cyber-monday-momentum": "momentum",
};

// Keyword hints for future posts (checked against id + title + imagePrompt).
const KEYWORD_SCENES = [
  [/storefront|shop page|idea list/i, "storefront"],
  [/gift|benable|wishlist/i, "giftList"],
  [/stor(y|ies)|instagram|reel|tiktok|phone/i, "story"],
  [/mistake|avoid|pitfall|warning|risk|ban/i, "pitfalls"],
  [/real.?time|live|price drop|alert/i, "liveDrop"],
  [/campaign|creator connections|brand/i, "campaignBoost"],
  [/finish|cyber monday|last call|final/i, "finishLine"],
  [/momentum|growth|grow|earnings|commission|revenue/i, "momentum"],
  [/countdown|calendar|schedule|playbook|prep/i, "countdown"],
  [/idea|content|plan/i, "ideasBoard"],
];

const CATEGORY_SCENES = {
  Amazon: "storefront", Benable: "giftList", Content: "ideasBoard", Deals: "liveDrop",
  Facebook: "campaignBoost", Growth: "momentum", Instagram: "story", Pinterest: "ideasBoard",
  Proxy: "pitfalls", TikTok: "story", Walmart: "storefront",
};

function pickScene(post) {
  if (SCENES_BY_SLUG[post.id]) return SCENES_BY_SLUG[post.id];
  const hay = `${post.id} ${post.title || ""} ${post.imagePrompt || ""}`;
  for (const [re, scene] of KEYWORD_SCENES) if (re.test(hay)) return scene;
  return CATEGORY_SCENES[post.category] || "article";
}

function frame(inner) {
  return `<!doctype html>
<html><head><meta charset="utf-8" />
<style>html,body{margin:0;padding:0}#stage{width:1536px;height:1024px}svg{display:block}</style>
</head><body><div id="stage">
<svg width="1536" height="1024" viewBox="0 0 1536 1024" xmlns="http://www.w3.org/2000/svg" font-family="Segoe UI, Arial, sans-serif">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${CREAM}"/><stop offset="1" stop-color="${PEACH}"/></linearGradient>
    <filter id="soft" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="10" stdDeviation="18" flood-color="${NAVY}" flood-opacity="0.10"/></filter>
  </defs>
  <rect width="1536" height="1024" fill="url(#bg)"/>
  ${circle(200, 180, 120, ORANGE, 'opacity="0.06"')}
  ${circle(1360, 880, 160, NAVY, 'opacity="0.05"')}
  <g transform="translate(108,92)">
    ${circle(22, 20, 22, NAVY)}
    <path d="M11 26 q11 -13 22 0" fill="none" stroke="${ORANGE}" stroke-width="4" stroke-linecap="round"/>
    ${circle(22, 14, 6, ORANGE)}
    <text x="58" y="28" font-size="30" font-weight="700" fill="${NAVY}">Influencer <tspan fill="${ORANGE}">Butler</tspan></text>
  </g>
  ${inner}
</svg></div></body></html>`;
}

function findBrowser() {
  const candidates = [
    process.env.CHROME_PATH,
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium-browser",
  ].filter(Boolean);
  return candidates.find((c) => fs.existsSync(c));
}

function render(browser, sceneName, outPath, seed = 0) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ib-hero-"));
  const htmlPath = path.join(tmpDir, "hero.html");
  fs.writeFileSync(htmlPath, frame(`${orbit(seed)}${SCENES[sceneName]()}`), "utf8");
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  execFileSync(browser, [
    "--headless",
    "--disable-gpu",
    "--hide-scrollbars",
    "--force-device-scale-factor=1",
    "--window-size=1536,1024",
    `--screenshot=${outPath}`,
    "file:///" + htmlPath.replace(/\\/g, "/"),
  ], { stdio: "ignore" });
  fs.rmSync(tmpDir, { recursive: true, force: true });
  if (!fs.existsSync(outPath)) throw new Error(`browser did not write ${outPath}`);
  return fs.statSync(outPath).size;
}

function main() {
  const browser = findBrowser();
  if (!browser && !dryRun) {
    console.error("No Chrome or Edge found. Set CHROME_PATH to a Chromium-based browser executable.");
    process.exit(1);
  }

  if (renderFallback) {
    const out = path.join(publicDir, FALLBACK_REL);
    const size = render(browser, "article", out);
    console.log(`wrote ${path.relative(repoRoot, out)} (${Math.round(size / 1024)} KB)`);
    return;
  }

  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  let posts = (manifest.posts || []).filter((p) => p.image && p.image.startsWith("/"));
  if (only) posts = posts.filter((p) => p.id === only);
  if (only && !posts.length) {
    console.error(`No post with id "${only}".`);
    process.exit(1);
  }

  let rendered = 0;
  posts.forEach((post, i) => {
    const out = path.join(publicDir, post.image.replace(/^\//, ""));
    if (!force && fs.existsSync(out)) return;
    const scene = pickScene(post);
    if (dryRun) {
      console.log(`would render ${post.image} (scene: ${scene})`);
      return;
    }
    const size = render(browser, scene, out, i);
    rendered++;
    console.log(`wrote ${post.image} (scene: ${scene}, ${Math.round(size / 1024)} KB)`);
  });
  if (!dryRun) console.log(rendered ? `\nRendered ${rendered} hero(es) with ${path.basename(browser)}.` : "No missing blog heroes.");
}

main();
