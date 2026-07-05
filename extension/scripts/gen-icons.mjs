// Renders scripts/assets/icon.html (vector Influencer Butler mark: bowler
// hat, orange face, tux and bowtie) to static/icons/icon-{16,32,48,128}.png
// using the locally installed Chrome/Edge headless. No npm dependencies.
//
// Headless Chrome on Windows renders blank screenshots at window sizes
// roughly between 100 and 160 px, so instead of sizing the window per icon
// we always screenshot a reliable 256x256 window with the SVG pinned to the
// exact target size in the top-left corner (?size=N), then crop the PNG in
// pure Node (decode, crop, re-encode).
//
// Usage: npm run icons
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

const SIZES = [16, 32, 48, 128];
const WINDOW = 256; // empirically reliable screenshot size
let CRC_TABLE = null; // declared before the top-level render loop runs

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const htmlPath = path.join(root, "scripts", "assets", "icon.html");
const outDir = path.join(root, "static", "icons");
fs.mkdirSync(outDir, { recursive: true });

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

const browser = CANDIDATES.find((candidate) => fs.existsSync(candidate));
if (!browser) {
  console.error("No Chrome or Edge found. Set CHROME_PATH to a Chromium-based browser.");
  process.exit(1);
}

const scratchProfile = fs.mkdtempSync(path.join(os.tmpdir(), "ib-icons-"));
const shotPath = path.join(scratchProfile, "shot.png");
const fileUrl = "file:///" + htmlPath.replace(/\\/g, "/");

for (const size of SIZES) {
  execFileSync(browser, [
    "--headless",
    "--disable-gpu",
    "--hide-scrollbars",
    "--force-device-scale-factor=1",
    "--default-background-color=00000000",
    "--run-all-compositor-stages-before-draw",
    "--virtual-time-budget=4000",
    // icon.html reads logo pixels from a file:// image via canvas.
    "--allow-file-access-from-files",
    `--user-data-dir=${scratchProfile}`,
    `--window-size=${WINDOW},${WINDOW}`,
    `--screenshot=${shotPath}`,
    `${fileUrl}?size=${size}`,
  ]);
  const shot = decodePng(fs.readFileSync(shotPath));
  const cropped = crop(shot, size, size);
  const out = path.join(outDir, `icon-${size}.png`);
  fs.writeFileSync(out, encodePng(size, size, cropped));
  console.log(`icons/icon-${size}.png (${size}x${size})`);
}

fs.rmSync(scratchProfile, { recursive: true, force: true });

// ---------- minimal PNG codec (8-bit RGBA only) ----------

function decodePng(buf) {
  const width = buf.readUInt32BE(16);
  const height = buf.readUInt32BE(20);
  const bitDepth = buf[24];
  const colorType = buf[25];
  if (bitDepth !== 8 || colorType !== 6) {
    throw new Error(`expected 8-bit RGBA png, got depth=${bitDepth} colorType=${colorType}`);
  }
  const idat = [];
  let offset = 8;
  while (offset < buf.length) {
    const length = buf.readUInt32BE(offset);
    const type = buf.toString("ascii", offset + 4, offset + 8);
    if (type === "IDAT") idat.push(buf.subarray(offset + 8, offset + 8 + length));
    offset += 12 + length;
  }
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const bpp = 4;
  const stride = width * bpp;
  const pixels = Buffer.alloc(height * stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const prev = y > 0 ? pixels.subarray((y - 1) * stride, y * stride) : null;
    const cur = pixels.subarray(y * stride, (y + 1) * stride);
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? cur[x - bpp] : 0;
      const b = prev ? prev[x] : 0;
      const c = x >= bpp && prev ? prev[x - bpp] : 0;
      let value = line[x];
      switch (filter) {
        case 0: break;
        case 1: value = (value + a) & 0xff; break;
        case 2: value = (value + b) & 0xff; break;
        case 3: value = (value + ((a + b) >> 1)) & 0xff; break;
        case 4: value = (value + paeth(a, b, c)) & 0xff; break;
        default: throw new Error(`unsupported png filter ${filter}`);
      }
      cur[x] = value;
    }
  }
  return { width, height, pixels };
}

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

function crop(image, width, height) {
  const out = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++) {
    image.pixels.copy(out, y * width * 4, y * image.width * 4, y * image.width * 4 + width * 4);
  }
  return out;
}

function encodePng(width, height, rgba) {
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function chunk(type, data) {
  const buf = Buffer.alloc(8 + data.length + 4);
  buf.writeUInt32BE(data.length, 0);
  buf.write(type, 4, "ascii");
  data.copy(buf, 8);
  buf.writeUInt32BE(crc32(buf.subarray(4, 8 + data.length)), 8 + data.length);
  return buf;
}

function crc32(buf) {
  if (!CRC_TABLE) {
    CRC_TABLE = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      CRC_TABLE[n] = c >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (const byte of buf) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
