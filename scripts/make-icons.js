'use strict';

/**
 * Uygulama ikonlarini uretir (build/icon.ico + build/icon.png).
 * Bagimliliksiz: PNG kodlayici src/main/icon-render.js icinde.
 *
 * Tasarim: Claude'un sicak kil rengi zemin uzerinde, %'ye gore dolu bir halka.
 */

const fs = require('node:fs');
const path = require('node:path');
const { Canvas, drawText, textWidth, encodePNG } = require('../src/main/icon-render');

const OUT = path.join(__dirname, '..', 'build');
const SIZES = [16, 24, 32, 48, 64, 128, 256];

const BG = [26, 23, 20];
const ACCENT = [201, 100, 66];
const TRACK = [201, 100, 66];

function renderApp(size) {
  const c = new Canvas(size, size);
  const s = size / 256;

  // Yuvarlak kosesiz dolu zemin (ico icin kare daha temiz durur)
  const r = size / 2 - 1;
  c.arc(size / 2, size / 2, r, 0, 0, 1, BG, 1);

  // Halka izi + %72'lik dolgu
  const rOuter = size * 0.395;
  const rInner = size * 0.285;
  c.arc(size / 2, size / 2, rOuter, rInner, 0, 1, TRACK, 0.22);
  c.arc(size / 2, size / 2, rOuter, rInner, 0, 0.72, ACCENT, 1);

  // Ortada nokta (kucuk boyutlarda rakam okunmaz)
  if (size >= 48) {
    const label = '72';
    const scale = Math.max(2, Math.round(6 * s));
    const w = textWidth(label, scale);
    const h = 5 * scale;
    drawText(
      c,
      label,
      Math.round(size / 2 - w / 2),
      Math.round(size / 2 - h / 2),
      scale,
      ACCENT,
      1
    );
  } else {
    c.arc(size / 2, size / 2, rInner * 0.55, 0, 0, 1, ACCENT, 1);
  }

  return c;
}

/** Verilen PNG tamponlarindan bir .ico dosyasi kurar. */
function buildIco(entries) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(entries.length, 4);

  const dir = Buffer.alloc(16 * entries.length);
  let offset = header.length + dir.length;

  entries.forEach((e, i) => {
    const o = i * 16;
    dir[o] = e.size >= 256 ? 0 : e.size; // width (0 = 256)
    dir[o + 1] = e.size >= 256 ? 0 : e.size; // height
    dir[o + 2] = 0; // palette
    dir[o + 3] = 0; // reserved
    dir.writeUInt16LE(1, o + 4); // color planes
    dir.writeUInt16LE(32, o + 6); // bpp
    dir.writeUInt32LE(e.png.length, o + 8);
    dir.writeUInt32LE(offset, o + 12);
    offset += e.png.length;
  });

  return Buffer.concat([header, dir, ...entries.map((e) => e.png)]);
}

function main() {
  fs.mkdirSync(OUT, { recursive: true });

  const entries = SIZES.map((size) => ({
    size,
    png: renderApp(size).toPNG(),
  }));

  fs.writeFileSync(path.join(OUT, 'icon.ico'), buildIco(entries));

  const big = entries.find((e) => e.size === 256);
  fs.writeFileSync(path.join(OUT, 'icon.png'), big.png);

  console.log(`ikonlar yazildi -> ${OUT} (${SIZES.join(', ')})`);
}

main();
