/**
 * Summary: Renders the branded SVG hero (1536x1024) for the blog post
 *   "events-explained" using the locally installed Chrome/Edge in headless
 *   mode (same approach as generate-desktop-vs-cloud-hero.mjs).
 *   No API key needed.
 *
 * Scene: a calendar/event card with an RSVP checkmark badge, a small cluster
 *   of people glyphs (the community on the call), and a document/recap icon
 *   off to the side, representing register, attend, and catch-up-later.
 *
 * Usage:
 *   node scripts/generate-events-hero.mjs            (skips if PNG exists)
 *   node scripts/generate-events-hero.mjs --force
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const outDir = path.join(repoRoot, "public", "assets", "blog");
const SLUG = "events-explained";

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

function personGlyph(cx, cy, s, fill) {
  // Small abstract person: a head circle + a rounded shoulder block.
  return `
  <g transform="translate(${cx},${cy})">
    ${circle(0, -s * 0.9, s * 0.42, fill)}
    ${rr(-s * 0.58, -s * 0.4, s * 1.16, s * 1.1, s * 0.4, fill)}
  </g>`;
}

function calendarCard(x, y, w, h) {
  const headerH = h * 0.22;
  return `
  <g transform="translate(${x},${y})" filter="url(#soft)">
    ${rr(0, 0, w, h, 24, WHITE, `stroke="${SLATE_L}" stroke-width="3"`)}
    ${rr(0, 0, w, headerH, 24, ORANGE)}
    ${rr(0, headerH - 24, w, 24, 0, ORANGE)}
    ${circle(w * 0.22, headerH * 0.5, h * 0.045, WHITE)}
    ${circle(w * 0.78, headerH * 0.5, h * 0.045, WHITE)}
    ${bar(w * 0.12, headerH + 28, w * 0.5, 16, SLATE_L)}
    ${bar(w * 0.12, headerH + 60, w * 0.32, 12, MIST)}
    ${[0, 1, 2].map((row) =>
      [0, 1, 2, 3, 4].map((col) => circle(w * 0.14 + col * (w * 0.18), headerH + 120 + row * (h * 0.12), w * 0.028, MIST)).join("")
    ).join("")}
  </g>`;
}

function rsvpBadge(cx, cy, r) {
  return `
  <g transform="translate(${cx},${cy})" filter="url(#soft)">
    ${circle(0, 0, r, "#16A34A")}
    <path d="M${-r * 0.5} 0 L${-r * 0.1} ${r * 0.4} L${r * 0.55} ${-r * 0.4}" fill="none" stroke="${WHITE}" stroke-width="${r * 0.22}" stroke-linecap="round" stroke-linejoin="round"/>
  </g>`;
}

function recapDoc(x, y, w, h) {
  return `
  <g transform="translate(${x},${y})" filter="url(#soft)">
    ${rr(0, 0, w, h, 16, WHITE, `stroke="${SLATE_L}" stroke-width="3"`)}
    ${rr(w * 0.16, h * 0.16, w * 0.68, h * 0.1, h * 0.05, ORANGE)}
    ${[0, 1, 2, 3].map((i) => bar(w * 0.16, h * 0.38 + i * (h * 0.14), w * (i % 2 === 0 ? 0.68 : 0.46), h * 0.07, i === 0 ? SLATE_L : MIST)).join("")}
    ${circle(w * 0.84, h * 0.86, w * 0.1, "#FDE6C8")}
    <path d="M${w * 0.78} ${h * 0.86} L${w * 0.83} ${h * 0.91} L${w * 0.91} ${h * 0.8}" fill="none" stroke="${ORANGE_DEEP}" stroke-width="${w * 0.03}" stroke-linecap="round" stroke-linejoin="round"/>
  </g>`;
}

function scene() {
  const panelX = 430;
  const panelY = 90;
  const panelW = 676;
  const panelH = 760;

  const panel = rr(panelX, panelY, panelW, panelH, 28, "#FBE9CF");

  const cardW = 420;
  const cardH = 500;
  const cardX = panelX + (panelW - cardW) / 2 - 40;
  const cardY = panelY + 70;
  const card = calendarCard(cardX, cardY, cardW, cardH);
  const badge = rsvpBadge(cardX + cardW - 10, cardY + 24, 46);

  // Small cluster of people below the card, representing the community on
  // the call.
  const peopleY = panelY + panelH - 150;
  const peopleCenterX = cardX + cardW / 2;
  const people = [
    personGlyph(peopleCenterX - 90, peopleY, 44, ORANGE),
    personGlyph(peopleCenterX, peopleY - 14, 52, NAVY),
    personGlyph(peopleCenterX + 90, peopleY, 44, "#5B6B93"),
  ].join("");

  // Recap document tucked at the edge of the frame, implying "catch up
  // later" without covering the main card.
  const recapW = 200;
  const recapH = 230;
  const recapX = panelX + panelW - recapW + 60;
  const recapY = panelY + panelH - recapH - 40;
  const recap = recapDoc(recapX, recapY, recapW, recapH);

  // Floating chips orbiting outside the frame, small calendar-dot accents.
  const orbit = [
    circle(150, 200, 46, PINK),
    circle(170, 480, 34, BLUE),
    circle(110, 760, 40, "#FDE6C8"),
    circle(1340, 230, 40, BLUE),
    circle(1360, 560, 32, PINK),
    circle(1300, 800, 46, "#FDE6C8"),
  ].join("");

  const sparkle = (x, y, s = 1) => `
  <g transform="translate(${x},${y}) scale(${s})" fill="${ORANGE}">
    <path d="M0 -22 L6 -6 L22 0 L6 6 L0 22 L-6 6 L-22 0 L-6 -6 Z"/>
  </g>`;

  return `${panel}${card}${badge}${people}${recap}${orbit}${sparkle(1180, 860, 0.7)}${sparkle(340, 860, 0.6)}`;
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
