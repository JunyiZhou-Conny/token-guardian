#!/usr/bin/env node
"use strict";

// Draws the menu-bar template icon (a gauge ring with a needle) as black-on-transparent PNGs.
// macOS tints "Template" images for light and dark menu bars. Run: node scripts/make-tray-icon.cjs
const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");

function crc32(buf) {
  let c = ~0;
  for (const byte of buf) {
    c ^= byte;
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function png(size) {
  const raw = Buffer.alloc(size * (size * 4 + 1));
  const c = (size - 1) / 2;
  const outer = size * 0.47;
  const inner = size * 0.33;
  const samples = 4;
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      let hit = 0;
      for (let sy = 0; sy < samples; sy++) {
        for (let sx = 0; sx < samples; sx++) {
          const px = x + (sx + 0.5) / samples - 0.5 - c;
          const py = y + (sy + 0.5) / samples - 0.5 - c;
          const r = Math.hypot(px, py);
          const angle = Math.atan2(py, px); // 0 = right, positive = down
          // Ring with a gap at the bottom, like a gauge.
          const inRing = r <= outer && r >= inner && !(angle > Math.PI * 0.3 && angle < Math.PI * 0.7);
          // Needle from the centre toward the upper right.
          const nx = Math.cos(-Math.PI / 4);
          const ny = Math.sin(-Math.PI / 4);
          const along = px * nx + py * ny;
          const across = Math.abs(px * ny - py * nx);
          const inNeedle = along >= -size * 0.06 && along <= inner * 0.95 && across <= size * 0.065;
          const inHub = r <= size * 0.11;
          if (inRing || inNeedle || inHub) hit++;
        }
      }
      const o = y * (size * 4 + 1) + 1 + x * 4;
      raw[o + 3] = Math.round((hit / (samples * samples)) * 255);
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8; // bit depth
  header[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", zlib.deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const out = path.join(__dirname, "..", "assets");
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, "trayTemplate.png"), png(16));
fs.writeFileSync(path.join(out, "trayTemplate@2x.png"), png(32));
console.log("Wrote assets/trayTemplate.png and assets/trayTemplate@2x.png");
