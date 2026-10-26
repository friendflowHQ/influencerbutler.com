/**
 * Summary: Renders the branded SVG hero (1536x1024) for the blog post
 *   "tiktok-goldmine-explained" using the locally installed Chrome/Edge
 *   in headless mode (same approach as generate-desktop-vs-cloud-hero.mjs).
 *   No API key needed.
 *
 * Scene: a loose cluster of small profile-icon circles (a wide harvest of
 *   TikTok accounts) pouring through a funnel shape, narrowing down to a
 *   tidy row of a few highlighted, qualified profile icons, one wearing a
 *   small verified checkmark badge, representing filtering a harvest down
 *   to a qualified outreach list.
 *
 * Usage:
 *   node scripts/generate-tiktok-goldmine-hero.mjs            (skips if PNG exists)
 *   node scripts/generate-tiktok-goldmine-hero.mjs --force
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const outDir = path.join(repoRoot, "public", "assets", "blog");
const SLUG = "tiktok-goldmine-explained";

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

function avatarIcon(id, cx, cy, r, bg, fg, ring = SLATE_L) {
  // Abstract "profile" glyph: a disc with a clipped head-and-shoulders shape
  // inside it, not a literal face.
  return `
  <g transform="translate(${cx},${cy})" filter="url(#soft)">
    <clipPath id="clip-${id}"><circle cx="0" cy="0" r="${r}"/></clipPath>
    ${circle(0, 0, r, bg, `stroke="${ring}" stroke-width="2"`)}
    <g clip-path="url(#clip-${id})">
      ${circle(0, -r * 0.3, r * 0.36, fg)}
      ${rr(-r * 0.52, r * 0.06, r * 1.04, r * 0.95, r * 0.32, fg)}
    </g>
  </g>`;
}

function verifiedBadge(cx, cy, r) {
  return `
  <g transform="translate(${cx},${cy})">
    ${circle(0, 0, r, NAVY, `stroke="${WHITE}" stroke-width="3"`)}
    <path d="M${-r * 0.45} 0 L${-r * 0.08} ${r * 0.42} L${r * 0.5} ${-r * 0.46}" fill="none" stroke="${WHITE}" stroke-width="${r * 0.26}" stroke-linecap="round" stroke-linejoin="round"/>
  </g>`;
}

function funnel(cx, topY, spoutY, spoutBottomY, topHalfW, spoutHalfW) {
  const d = `M${cx - topHalfW} ${topY} L${cx + topHalfW} ${topY} L${cx + spoutHalfW} ${spoutY} L${cx + spoutHalfW} ${spoutBottomY} L${cx - spoutHalfW} ${spoutBottomY} L${cx - spoutHalfW} ${spoutY} Z`;
  return `<path d="${d}" fill="${NAVY}" opacity="0.92" stroke="${ORANGE_DEEP}" stroke-width="3"/>`;
}

function scene() {
  const frameOuter = rr(430, 90, 676, 760, 28, WHITE, `stroke="${SLATE_L}" stroke-width="3" filter="url(#soft)"`);
  const frameInner = rr(460, 120, 616, 640, 18, "#FBE9CF");

  // A loose, wide harvest of raw accounts found from seeds and hashtags,
  // muted because they have not been qualified yet.
  const clusterSpecs = [
    [540, 175, 34], [640, 150, 30], [742, 182, 38], [844, 155, 32], [935, 185, 36],
    [560, 258, 30], [662, 246, 26], [900, 252, 34], [1000, 236, 28],
    [600, 328, 28], [820, 316, 30], [958, 332, 26],
  ];
  const cluster = clusterSpecs
    .map((s, i) => avatarIcon(`c${i}`, s[0], s[1], s[2], WHITE, SLATE_L))
    .join("");

  // The funnel doing the qualifying: #ad / Paid partnership / brand-tag /
  // verified-only rules narrow the harvest down to a short list.
  const chute = funnel(768, 400, 560, 645, 230, 34);
  const particles = [
    circle(750, 585, 8, ORANGE),
    circle(768, 605, 7, ORANGE_DEEP),
    circle(786, 585, 8, ORANGE),
  ].join("");

  // The short, qualified list left after filtering, highlighted in brand color.
  const qualifiedSpecs = [
    [598, 690, 44],
    [698, 706, 46],
    [828, 706, 46],
    [938, 690, 44],
  ];
  const qualified = qualifiedSpecs
    .map((s, i) => avatarIcon(`q${i}`, s[0], s[1], s[2], ORANGE_DEEP, CREAM, ORANGE_DEEP))
    .join("");
  const badge = verifiedBadge(828 + 34, 706 + 32, 16);

  // The wider TikTok universe being searched, orbiting outside the frame.
  const orbit = [
    avatarIcon("o0", 160, 210, 46, WHITE, SLATE_L),
    avatarIcon("o1", 180, 480, 34, WHITE, SLATE_L),
    avatarIcon("o2", 120, 740, 40, WHITE, SLATE_L),
    avatarIcon("o3", 1300, 220, 40, WHITE, SLATE_L),
    avatarIcon("o4", 1340, 500, 34, WHITE, SLATE_L),
    avatarIcon("o5", 1280, 770, 46, WHITE, SLATE_L),
  ].join("");

  const sparkle = (x, y, s = 1) => `
  <g transform="translate(${x},${y}) scale(${s})" fill="${ORANGE}">
    <path d="M0 -22 L6 -6 L22 0 L6 6 L0 22 L-6 6 L-22 0 L-6 -6 Z"/>
  </g>`;

  return `${frameOuter}${frameInner}${cluster}${chute}${particles}${qualified}${badge}${orbit}${sparkle(768, 110, 1)}${sparkle(1180, 860, 0.7)}${sparkle(340, 860, 0.6)}`;
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
