// Generates the placeholder icons in icons/ with no dependencies.
// Run with: node scripts/make-icons.js
//
// The design is a rounded square showing a mini tab list: a pinned tab on
// top, two colored groups anchored below it, then faint ungrouped tabs.

const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const SIZES = [16, 32, 48, 128];
const OUT_DIR = path.join(__dirname, "..", "icons");

const BG = [37, 99, 235]; // blue
const PINNED = [255, 255, 255];
const GROUP_A = [250, 204, 21]; // yellow
const GROUP_B = [74, 222, 128]; // green
const UNGROUPED = [147, 180, 248]; // pale blue

// Rows in a 0..1 unit square: [top, bottom, color].
const ROWS = [
  [0.16, 0.28, PINNED],
  [0.34, 0.46, GROUP_A],
  [0.5, 0.62, GROUP_B],
  [0.7, 0.76, UNGROUPED],
  [0.8, 0.86, UNGROUPED],
];

function insideRoundedSquare(x, y, size, radius) {
  const cx = Math.min(Math.max(x, radius), size - radius);
  const cy = Math.min(Math.max(y, radius), size - radius);
  return (x - cx) ** 2 + (y - cy) ** 2 <= radius ** 2;
}

function pixel(x, y, size) {
  // Sample at pixel centers.
  const px = x + 0.5;
  const py = y + 0.5;
  if (!insideRoundedSquare(px, py, size, size * 0.2)) return [0, 0, 0, 0];

  const u = px / size;
  const v = py / size;
  if (u >= 0.16 && u <= 0.84) {
    for (const [top, bottom, color] of ROWS) {
      if (v >= top && v <= bottom) return [...color, 255];
    }
  }
  return [...BG, 255];
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function png(size) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const raw = Buffer.alloc(size * (size * 4 + 1));
  let offset = 0;
  for (let y = 0; y < size; y++) {
    raw[offset++] = 0; // filter: none
    for (let x = 0; x < size; x++) {
      for (const channel of pixel(x, y, size)) raw[offset++] = channel;
    }
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

fs.mkdirSync(OUT_DIR, { recursive: true });
for (const size of SIZES) {
  const file = path.join(OUT_DIR, `icon${size}.png`);
  fs.writeFileSync(file, png(size));
  console.log(`wrote ${path.relative(process.cwd(), file)}`);
}
