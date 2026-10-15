#!/usr/bin/env node
'use strict';
/*
 * アプリアイコン（PNG）を作るスクリプト。外部ライブラリ不要。
 *   node tools/make-icons.js
 * favicon.svg と同じ図柄（能力の六角形グラフ）を、4×4 のスーパーサンプリングで描きます。
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const OUT = path.join(__dirname, '..', 'icons');
fs.mkdirSync(OUT, { recursive: true });

const C1 = [0xc8, 0x24, 0x3a]; // scarlet
const C2 = [0x74, 0x33, 0xc4]; // violet

function segDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

function inPoly(px, py, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function draw(size, { maskable = false, rounded = true } = {}) {
  const scale = maskable ? 0.6 : 0.76;
  const cx = size / 2, cy = size / 2, R = (size * scale) / 2;
  const at = (d, r) => [cx + r * Math.cos((d * Math.PI) / 180), cy + r * Math.sin((d * Math.PI) / 180)];
  const DEG = [-90, -30, 30, 90, 150, 210];
  const outer = DEG.map((d) => at(d, R));
  const edges = outer.map((p, i) => [p, outer[(i + 1) % 6]]);
  // 能力のグラフ（6つの能力）の形
  const radar = DEG.map((d, i) => at(d, R * [0.78, 0.7, 0.62, 0.72, 0.6, 0.66][i]));
  const redges = radar.map((p, i) => [p, radar[(i + 1) % 6]]);
  const wOuter = size * 0.022, wRadar = size * 0.04, dot = size * scale * 0.07;
  const rad = rounded ? size * 0.22 : 0;

  const inBg = (x, y) => {
    if (!rad) return true;
    const qx = Math.max(rad - x, 0, x - (size - rad));
    const qy = Math.max(rad - y, 0, y - (size - rad));
    return qx * qx + qy * qy <= rad * rad;
  };

  const S = 4;
  const buf = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    buf[y * (size * 4 + 1)] = 0; // filter: none
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < S; sy++) for (let sx = 0; sx < S; sx++) {
        const px = x + (sx + 0.5) / S, py = y + (sy + 0.5) / S;
        if (!inBg(px, py)) continue;
        const t = (px + py) / (2 * size);
        let col = C1.map((c, i) => c + (C2[i] - c) * t);
        let white = 0;
        if (redges.some(([p, q]) => segDist(px, py, p[0], p[1], q[0], q[1]) <= wRadar / 2)) white = 1;
        else if (Math.hypot(px - cx, py - cy) <= dot) white = 1;
        else if (inPoly(px, py, radar)) white = 0.35;
        else if (edges.some(([p, q]) => segDist(px, py, p[0], p[1], q[0], q[1]) <= wOuter / 2)) white = 0.5;
        col = col.map((c) => c + (255 - c) * white);
        r += col[0]; g += col[1]; b += col[2]; a += 255;
      }
      const n = S * S, o = y * (size * 4 + 1) + 1 + x * 4;
      if (a) { buf[o] = Math.round(r / (a / 255)); buf[o + 1] = Math.round(g / (a / 255)); buf[o + 2] = Math.round(b / (a / 255)); }
      buf[o + 3] = Math.round(a / n);
    }
  }
  return png(size, size, buf);
}

function crc32(b) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < b.length; n++) {
    c = (crc ^ b[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(w, h, raw) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))
  ]);
}

const jobs = [
  ['icon-192.png', 192, {}],
  ['icon-512.png', 512, {}],
  ['icon-maskable-512.png', 512, { maskable: true, rounded: false }],
  ['apple-touch-icon.png', 180, { rounded: false }]
];
for (const [name, size, opt] of jobs) {
  fs.writeFileSync(path.join(OUT, name), draw(size, opt));
  console.log('icons/' + name);
}
