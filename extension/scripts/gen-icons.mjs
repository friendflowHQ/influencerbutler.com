// Generates placeholder extension icons (orange rounded square with a white
// "bowtie" butler mark) as PNGs, with zero dependencies. Rerun via
// `npm run icons` if sizes change; replace with designed assets before the
// Chrome Web Store listing.
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

const SIZES = [16, 32, 48, 128];
const ORANGE = [249, 115, 22, 255]; // #f97316, the site accent
const WHITE = [255, 255, 255, 255];
const CLEAR = [0, 0, 0, 0];

function main() {
  const outDir = path.join(path.dirname(path.dirname(fileURLToPath(import.meta.url))), "static", "icons");
  fs.mkdirSync(outDir, { recursive: true });
  for (const size of SIZES) {
    const png = encodePng(size, size, drawIcon(size));
    fs.writeFileSync(path.join(outDir, `icon-${size}.png`), png);
    console.log(`icons/icon-${size}.png`);
  }
}

function drawIcon(size) {
  const px = new Uint8Array(size * size * 4);
  const radius = Math.max(2, Math.round(size * 0.19));
  const cx = (size - 1) / 2;
  const cy = (size - 1) / 2;
  // Bowtie: two triangles meeting at the center, plus a small square knot.
  const tieHalfW = size * 0.32;
  const tieHalfH = size * 0.16;
  const knot = size * 0.07;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      let color = ORANGE;
      // Rounded corners: clear pixels outside the corner circles.
      const nx = Math.max(radius - x, x - (size - 1 - radius), 0);
      const ny = Math.max(radius - y, y - (size - 1 - radius), 0);
      if (nx * nx + ny * ny > radius * radius) color = CLEAR;
      else {
        const dx = Math.abs(x - cx);
        const dy = Math.abs(y - cy);
        const inWing = dx <= tieHalfW && dy <= tieHalfH * (dx / tieHalfW) + knot * 0.4;
        const inKnot = dx <= knot && dy <= knot;
        if (size >= 32 ? inWing || inKnot : dx <= tieHalfW && dy <= tieHalfH) color = WHITE;
      }
      px.set(color, i);
    }
  }
  return px;
}

function encodePng(width, height, rgba) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0; // filter type 0 per scanline
    raw.set(rgba.subarray(y * width * 4, (y + 1) * width * 4), y * (width * 4 + 1) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
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

let CRC_TABLE = null;
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

main();
