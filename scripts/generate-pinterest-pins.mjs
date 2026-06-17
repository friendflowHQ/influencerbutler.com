/**
 * Summary: Builds vertical 2:3 Pinterest pins (1024x1536) for every blog post by
 *   compositing the existing hero image (top) with a bold, branded title overlay
 *   (bottom). Pinterest favors tall pins with a readable title, and this reuses
 *   the hero images you already generated, so it costs nothing and needs no API
 *   key. Output: public/assets/blog/pins/<slug>.png.
 *
 * Usage:
 *   node scripts/generate-pinterest-pins.mjs
 *   node scripts/generate-pinterest-pins.mjs --force
 *   node scripts/generate-pinterest-pins.mjs --only=what-is-benable
 *
 * Requires: sharp  (npm install sharp)
 * Dependencies: node:fs/promises, node:path, sharp.
 */
import { readFile, writeFile, mkdir, access } from "node:fs/promises";
import { constants as FS } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

let sharp;
try {
  sharp = (await import("sharp")).default;
} catch {
  console.error(
    "ERROR: 'sharp' is not installed. Run:  npm install sharp\n" +
      "Then re-run: node scripts/generate-pinterest-pins.mjs"
  );
  process.exit(1);
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const manifestPath = path.join(repoRoot, "content", "blog", "_index.json");
const publicDir = path.join(repoRoot, "public");
const pinsDir = path.join(publicDir, "assets", "blog", "pins");

const W = 1024;
const H = 1536;
const HERO_H = 760; // top image band
const NAVY = "#0f172a";
const ORANGE = "#f59e0b";
const PAD = 84;

const args = process.argv.slice(2);
const force = args.includes("--force");
const onlyArg = args.find((a) => a.startsWith("--only="));
const only = onlyArg ? onlyArg.split("=")[1] : null;

async function fileExists(p) {
  try { await access(p, FS.F_OK); return true; } catch { return false; }
}
function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
}
// Greedy word-wrap using an approximate glyph width for bold sans.
function wrap(text, fontSize, maxWidth, maxLines) {
  const approx = fontSize * 0.56;
  const perLine = Math.max(8, Math.floor(maxWidth / approx));
  const words = text.split(/\s+/);
  const lines = [];
  let cur = "";
  for (const w of words) {
    const test = cur ? cur + " " + w : w;
    if (test.length > perLine && cur) { lines.push(cur); cur = w; }
    else cur = test;
  }
  if (cur) lines.push(cur);
  if (lines.length > maxLines) {
    lines.length = maxLines;
    lines[maxLines - 1] = lines[maxLines - 1].replace(/[.,:;]?$/, "") + "...";
  }
  return lines;
}

function buildOverlaySVG(title, category) {
  const usable = W - PAD * 2;
  const len = title.length;
  const fontSize = len <= 40 ? 74 : len <= 70 ? 62 : 52;
  const lines = wrap(title, fontSize, usable, 6);
  const lh = Math.round(fontSize * 1.16);
  const eyebrowY = HERO_H + 78;
  const accentY = HERO_H + 30;
  const titleStartY = eyebrowY + 64;
  const tspans = lines
    .map(
      (ln, i) =>
        `<tspan x="${PAD}" y="${titleStartY + i * lh}">${esc(ln)}</tspan>`
    )
    .join("");
  const FONT = "DejaVu Sans, Liberation Sans, Arial, Helvetica, sans-serif";
  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
  <rect x="0" y="${HERO_H}" width="${W}" height="${H - HERO_H}" fill="${NAVY}"/>
  <rect x="${PAD}" y="${accentY}" width="120" height="10" rx="5" fill="${ORANGE}"/>
  <text x="${PAD}" y="${eyebrowY}" font-family="${FONT}" font-size="30" font-weight="700" letter-spacing="3" fill="${ORANGE}">${esc(
    (category || "Blog").toUpperCase()
  )}</text>
  <text font-family="${FONT}" font-size="${fontSize}" font-weight="800" fill="#ffffff">${tspans}</text>
  <text x="${PAD}" y="${H - 70}" font-family="${FONT}" font-size="30" font-weight="700" letter-spacing="2" fill="#e2e8f0">influencerbutler.com</text>
  <rect x="${W - PAD - 18}" y="${H - 92}" width="18" height="18" rx="4" fill="${ORANGE}"/>
</svg>`;
}

async function buildPin(post) {
  const heroRel = (post.image || "").replace(/^\//, "");
  const heroPath = path.join(publicDir, heroRel);
  const outPath = path.join(pinsDir, `${post.id}.png`);
  if (!(await fileExists(heroPath))) {
    console.log(`  skip (no hero): ${post.id}`);
    return "skipped";
  }
  if (!force && (await fileExists(outPath))) {
    console.log(`  skip (exists): ${post.id}`);
    return "skipped";
  }
  const hero = await sharp(heroPath)
    .resize(W, HERO_H, { fit: "cover", position: "attention" })
    .toBuffer();
  const svg = Buffer.from(buildOverlaySVG(post.title, post.category));
  await mkdir(pinsDir, { recursive: true });
  await sharp({
    create: { width: W, height: H, channels: 4, background: NAVY },
  })
    .composite([
      { input: hero, top: 0, left: 0 },
      { input: svg, top: 0, left: 0 },
    ])
    .png()
    .toFile(outPath);
  console.log(`  saved: assets/blog/pins/${post.id}.png`);
  return "generated";
}

async function main() {
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  let posts = Array.isArray(manifest.posts) ? manifest.posts : [];
  if (only) posts = posts.filter((p) => p.id === only);
  if (!posts.length) {
    console.error(only ? `No post with id "${only}".` : "No posts.");
    process.exit(1);
  }
  console.log(`Building ${posts.length} Pinterest pin(s) (1024x1536)${force ? " (force)" : ""}\n`);
  let gen = 0, skip = 0; const fail = [];
  for (const p of posts) {
    try {
      const r = await buildPin(p);
      r === "generated" ? gen++ : skip++;
    } catch (e) {
      console.error(`  FAILED ${p.id}: ${e.message}`);
      fail.push(p.id);
    }
  }
  console.log(`\nDone. generated=${gen} skipped=${skip} failed=${fail.length}`);
  if (fail.length) { console.log("Failed:", fail.join(", ")); process.exit(1); }
}
main().catch((e) => { console.error(e); process.exit(1); });
