'use strict';

/**
 * Generates branded NEXUS PNG icons (no external dependencies).
 *  - build/icon.png            -> 256x256, used by electron-builder for the app icon
 *  - electron/assets/tray-icon.png -> 32x32, used for the Windows system tray
 *
 * The artwork matches the in-app SVG logo: a white rounded tile with a
 * blue/cyan hexagonal data-node mark.
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

// --- CRC32 (for PNG chunks) ---------------------------------------------
const crcTable = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length, 0);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

function mix(a, b, t) {
  return Math.round(a + (b - a) * t);
}

function lerpColor(from, to, t) {
  return [
    mix(from[0], to[0], t),
    mix(from[1], to[1], t),
    mix(from[2], to[2], t),
    mix(from[3], to[3], t),
  ];
}

function roundedRectContains(x, y, left, top, right, bottom, radius) {
  if (x < left || x > right || y < top || y > bottom) return false;
  const cx = x < left + radius ? left + radius : x > right - radius ? right - radius : x;
  const cy = y < top + radius ? top + radius : y > bottom - radius ? bottom - radius : y;
  const dx = x - cx;
  const dy = y - cy;
  return dx * dx + dy * dy <= radius * radius;
}

function pointInPolygon(x, y, points) {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const xi = points[i][0];
    const yi = points[i][1];
    const xj = points[j][0];
    const yj = points[j][1];
    const intersect = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function distToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq));
  const x = ax + t * dx;
  const y = ay + t * dy;
  return Math.hypot(px - x, py - y);
}

function blendPixel(px, width, x, y, rgba) {
  const i = (y * width + x) * 4;
  const sourceA = rgba[3] / 255;
  const targetA = px[i + 3] / 255;
  const outA = sourceA + targetA * (1 - sourceA);
  if (outA <= 0) return;
  px[i] = Math.round((rgba[0] * sourceA + px[i] * targetA * (1 - sourceA)) / outA);
  px[i + 1] = Math.round((rgba[1] * sourceA + px[i + 1] * targetA * (1 - sourceA)) / outA);
  px[i + 2] = Math.round((rgba[2] * sourceA + px[i + 2] * targetA * (1 - sourceA)) / outA);
  px[i + 3] = Math.round(outA * 255);
}

function drawRoundedRect(px, size, left, top, right, bottom, radius, rgba) {
  for (let y = Math.floor(top); y <= Math.ceil(bottom); y++) {
    for (let x = Math.floor(left); x <= Math.ceil(right); x++) {
      if (roundedRectContains(x + 0.5, y + 0.5, left, top, right, bottom, radius))
        blendPixel(px, size, x, y, rgba);
    }
  }
}

function drawPolygon(px, size, points, from, to) {
  const minX = Math.floor(Math.min(...points.map((p) => p[0])));
  const maxX = Math.ceil(Math.max(...points.map((p) => p[0])));
  const minY = Math.floor(Math.min(...points.map((p) => p[1])));
  const maxY = Math.ceil(Math.max(...points.map((p) => p[1])));
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      if (!pointInPolygon(x + 0.5, y + 0.5, points)) continue;
      const t = Math.min(
        1,
        Math.max(0, (x - minX + (y - minY)) / Math.max(1, maxX - minX + (maxY - minY))),
      );
      blendPixel(px, size, x, y, lerpColor(from, to, t));
    }
  }
}

function drawCircle(px, size, cx, cy, radius, from, to = from) {
  const r = Math.ceil(radius);
  for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) {
    for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
      if (d > radius) continue;
      blendPixel(px, size, x, y, lerpColor(from, to, Math.min(1, d / radius)));
    }
  }
}

function drawLine(px, size, ax, ay, bx, by, width, rgba) {
  const minX = Math.floor(Math.min(ax, bx) - width);
  const maxX = Math.ceil(Math.max(ax, bx) + width);
  const minY = Math.floor(Math.min(ay, by) - width);
  const maxY = Math.ceil(Math.max(ay, by) + width);
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      if (distToSegment(x + 0.5, y + 0.5, ax, ay, bx, by) <= width / 2)
        blendPixel(px, size, x, y, rgba);
    }
  }
}

function downsample(source, sourceSize, targetSize, scale) {
  const target = Buffer.alloc(targetSize * targetSize * 4);
  for (let y = 0; y < targetSize; y++) {
    for (let x = 0; x < targetSize; x++) {
      const sums = [0, 0, 0, 0];
      for (let sy = 0; sy < scale; sy++) {
        for (let sx = 0; sx < scale; sx++) {
          const i = ((y * scale + sy) * sourceSize + (x * scale + sx)) * 4;
          sums[0] += source[i];
          sums[1] += source[i + 1];
          sums[2] += source[i + 2];
          sums[3] += source[i + 3];
        }
      }
      const area = scale * scale;
      const o = (y * targetSize + x) * 4;
      target[o] = Math.round(sums[0] / area);
      target[o + 1] = Math.round(sums[1] / area);
      target[o + 2] = Math.round(sums[2] / area);
      target[o + 3] = Math.round(sums[3] / area);
    }
  }
  return target;
}

function renderPixels(size) {
  const scale = 4;
  const workSize = size * scale;
  const px = Buffer.alloc(workSize * workSize * 4);
  const s = workSize / 96;
  const p = (x, y) => [x * s, y * s];
  const poly = (points) => points.map(([x, y]) => p(x, y));

  drawRoundedRect(px, workSize, 7 * s, 7 * s, 89 * s, 89 * s, 20 * s, [0, 42, 115, 30]);
  drawRoundedRect(px, workSize, 5 * s, 4 * s, 89 * s, 88 * s, 20 * s, [255, 255, 255, 245]);
  drawRoundedRect(px, workSize, 7 * s, 6 * s, 87 * s, 86 * s, 18 * s, [239, 247, 255, 70]);

  drawPolygon(
    px,
    workSize,
    poly([
      [48, 13],
      [83, 33],
      [61, 46],
      [48, 39],
      [35, 46],
      [13, 33],
    ]),
    [92, 228, 255, 255],
    [31, 55, 216, 255],
  );
  drawPolygon(
    px,
    workSize,
    poly([
      [11, 39],
      [33, 51],
      [33, 85],
      [11, 72],
    ]),
    [57, 201, 255, 255],
    [42, 95, 239, 255],
  );
  drawPolygon(
    px,
    workSize,
    poly([
      [85, 39],
      [63, 51],
      [63, 85],
      [85, 72],
    ]),
    [78, 165, 255, 255],
    [24, 40, 191, 255],
  );
  drawPolygon(
    px,
    workSize,
    poly([
      [36, 58],
      [48, 65],
      [60, 58],
      [60, 86],
      [48, 94],
      [36, 86],
    ]),
    [61, 134, 255, 245],
    [28, 49, 201, 245],
  );
  drawPolygon(
    px,
    workSize,
    poly([
      [48, 42],
      [60, 49],
      [60, 63],
      [48, 70],
      [36, 63],
      [36, 49],
    ]),
    [255, 255, 255, 245],
    [238, 248, 255, 235],
  );

  drawLine(px, workSize, 24 * s, 37 * s, 36 * s, 44 * s, 1.25 * s, [255, 255, 255, 90]);
  drawLine(px, workSize, 72 * s, 44 * s, 86 * s, 37 * s, 1.25 * s, [255, 255, 255, 90]);
  drawLine(px, workSize, 38 * s, 88 * s, 38 * s, 58 * s, 1.2 * s, [255, 255, 255, 80]);
  drawLine(px, workSize, 58 * s, 88 * s, 58 * s, 58 * s, 1.2 * s, [255, 255, 255, 80]);

  drawLine(px, workSize, 48 * s, 56 * s, 48 * s, 43 * s, 2 * s, [68, 196, 255, 95]);
  drawLine(px, workSize, 48 * s, 56 * s, 27 * s, 70 * s, 2 * s, [68, 196, 255, 95]);
  drawLine(px, workSize, 48 * s, 56 * s, 69 * s, 70 * s, 2 * s, [68, 196, 255, 95]);
  drawLine(px, workSize, 48 * s, 56 * s, 37 * s, 34 * s, 1.7 * s, [68, 196, 255, 80]);
  drawLine(px, workSize, 48 * s, 56 * s, 59 * s, 34 * s, 1.7 * s, [68, 196, 255, 80]);

  drawLine(px, workSize, 48 * s, 25 * s, 48 * s, 43 * s, 6.5 * s, [255, 255, 255, 250]);
  drawLine(px, workSize, 27 * s, 70 * s, 46 * s, 59 * s, 6.5 * s, [255, 255, 255, 250]);
  drawLine(px, workSize, 69 * s, 70 * s, 50 * s, 59 * s, 6.5 * s, [255, 255, 255, 250]);
  drawCircle(px, workSize, 48 * s, 25 * s, 7.4 * s, [255, 255, 255, 255]);
  drawCircle(px, workSize, 25 * s, 70 * s, 6.5 * s, [255, 255, 255, 255]);
  drawCircle(px, workSize, 71 * s, 70 * s, 6.5 * s, [255, 255, 255, 255]);
  drawCircle(px, workSize, 37 * s, 34 * s, 4.6 * s, [255, 255, 255, 230]);
  drawCircle(px, workSize, 59 * s, 34 * s, 4.6 * s, [255, 255, 255, 230]);

  drawCircle(px, workSize, 48 * s, 56 * s, 17 * s, [125, 235, 255, 115], [37, 99, 235, 0]);
  drawCircle(px, workSize, 48 * s, 56 * s, 12.2 * s, [245, 255, 255, 255], [25, 35, 167, 255]);
  drawCircle(px, workSize, 48 * s, 56 * s, 12.9 * s, [114, 235, 255, 90], [114, 235, 255, 0]);
  drawCircle(px, workSize, 44 * s, 52 * s, 3.8 * s, [255, 255, 255, 210]);

  return downsample(px, workSize, size, scale);
}

function buildPng(size) {
  const pixels = renderPixels(size);
  // Add filter byte (0) at the start of every scanline.
  const stride = size * 4;
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (stride + 1)] = 0;
    pixels.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });

  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function ensureDir(p) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
}

const targets = [
  { file: path.join(__dirname, '..', 'build', 'icon.png'), size: 256 },
  { file: path.join(__dirname, '..', 'electron', 'assets', 'tray-icon.png'), size: 32 },
];

for (const { file, size } of targets) {
  ensureDir(file);
  fs.writeFileSync(file, buildPng(size));
  console.log(`Generated ${path.relative(process.cwd(), file)} (${size}x${size})`);
}
