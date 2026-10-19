/**
 * Summary: Renders the branded SVG hero (1536x1024) for the blog post
 *   "is-your-private-proxy-really-private" using the locally installed
 *   Chrome/Edge in headless mode (same approach as
 *   generate-desktop-vs-cloud-hero.mjs / generate-foyer-walmart-heroes.mjs).
 *   No API key needed. The post's imagePrompt stays in
 *   content/blog/_index.json so the hero can later be regenerated with
 *   gpt-image-1 via scripts/generate-blog-images.mjs --force --only=<slug>
 *   if preferred.
 *
 * Scene: one locked mailbox/parcel-locker door, centered, with a single
 *   keyhole. A warm orange key approaches from the upper left (the customer
 *   who paid for it), and a second, identical but shadowy slate-colored key
 *   approaches the same keyhole from the upper right (the second customer
 *   nobody told you about). Same lock, two keys.
 *
 * Usage:
 *   node scripts/generate-private-proxy-hero.mjs            (skips if PNG exists)
 *   node scripts/generate-private-proxy-hero.mjs --force
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
const SLUG = "is-your-private-proxy-really-private";

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
const SLATE_D = "#64748B";
const MIST = "#EEF2F7";

const rr = (x, y, w, h, r, fill, extra = "") =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${fill}" ${extra}/>`;
const circle = (cx, cy, r, fill, extra = "") => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}" ${extra}/>`;

// A simple key glyph: round head with a keyhole notch, a shaft, two teeth.
// Drawn pointing right (toward +x), rotated/placed by the caller via transform.
function key(color, scale = 1, opacity = 1) {
  return `
  <g transform="scale(${scale})" opacity="${opacity}">
    <circle cx="0" cy="0" r="46" fill="none" stroke="${color}" stroke-width="18"/>
    <circle cx="0" cy="0" r="12" fill="${color}"/>
    <rect x="40" y="-9" width="150" height="18" rx="6" fill="${color}"/>
    <rect x="150" y="9" width="16" height="26" rx="4" fill="${color}"/>
    <rect x="175" y="9" width="16" height="34" rx="4" fill="${color}"/>
  </g>`;
}

function lockerDoor() {
  // The single locked mailbox door, centered, with a keyhole facing up.
  return `
  <g transform="translate(768,560)" filter="url(#soft)">
    ${rr(-220, -260, 440, 520, 28, NAVY)}
    ${rr(-190, -230, 380, 460, 18, NAVY_L)}
    <!-- handle / hinge details -->
    ${rr(150, -60, 14, 120, 7, SLATE_L)}
    <!-- keyhole plate -->
    ${circle(0, -40, 70, CREAM)}
    ${circle(0, -58, 22, NAVY)}
    ${rr(-10, -46, 20, 46, 8, NAVY)}
    <!-- small label plate near the bottom, left blank (no text per brand rule) -->
    ${rr(-150, 130, 300, 54, 10, MIST)}
    ${circle(-120, 157, 10, ORANGE)}
    ${rr(-96, 149, 180, 16, 6, SLATE_L)}
  </g>`;
}

function scene() {
  const door = lockerDoor();

  // Trusted key: warm orange, soft glow, approaching the keyhole from the
  // upper left, tip pointed down-right toward the lock.
  const trustedGlow = circle(420, 230, 80, ORANGE, 'opacity="0.18"');
  const trustedKey = `
  <g transform="translate(560,300) rotate(40)">
    ${key(ORANGE_DEEP, 1.05)}
  </g>`;

  // Second, shadowy key: identical shape, muted slate color, lower opacity,
  // approaching the SAME keyhole from the upper right, mirrored.
  const shadowKey = `
  <g transform="translate(980,300) scale(-1,1) rotate(40)">
    ${key(SLATE_D, 1.05, 0.85)}
  </g>`;

  // Faint second shadow behind it to read as "lurking / uninvited".
  const shadowGhost = `
  <g transform="translate(1010,268) scale(-1,1) rotate(40)" opacity="0.25">
    ${key(SLATE, 1.05)}
  </g>`;

  return `${door}${trustedGlow}${trustedKey}${shadowGhost}${shadowKey}`;
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
