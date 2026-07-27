'use strict';

const zlib = require('node:zlib');

/**
 * Bagimliliksiz minik raster + PNG kodlayici.
 * Tray ikonunu calisma aninda cizmek icin kullanilir (yuzdeye gore dolan
 * halka + rakam). Harici grafik kutuphanesi yok.
 */

/* ------------------------------- raster ---------------------------------- */

class Canvas {
  constructor(w, h) {
    this.w = w;
    this.h = h;
    this.data = Buffer.alloc(w * h * 4); // RGBA, seffaf
  }

  /** Alpha blending ile tek piksel. a: 0..1 */
  blend(x, y, [r, g, b], a) {
    if (a <= 0) return;
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    if (xi < 0 || yi < 0 || xi >= this.w || yi >= this.h) return;
    const i = (yi * this.w + xi) * 4;
    const d = this.data;
    const sa = Math.min(1, a);
    const da = d[i + 3] / 255;
    const oa = sa + da * (1 - sa);
    if (oa <= 0) return;
    d[i] = Math.round((r * sa + d[i] * da * (1 - sa)) / oa);
    d[i + 1] = Math.round((g * sa + d[i + 1] * da * (1 - sa)) / oa);
    d[i + 2] = Math.round((b * sa + d[i + 2] * da * (1 - sa)) / oa);
    d[i + 3] = Math.round(oa * 255);
  }

  /**
   * Kenar yumusatmali halka dilimi.
   * Aci -PI/2'den (saat 12) saat yonunde ilerler.
   */
  arc(cx, cy, rOuter, rInner, startFrac, endFrac, color, alpha = 1) {
    if (endFrac <= startFrac) return;
    const a0 = startFrac * Math.PI * 2 - Math.PI / 2;
    const a1 = endFrac * Math.PI * 2 - Math.PI / 2;
    const SS = 3; // supersampling
    const x0 = Math.max(0, Math.floor(cx - rOuter - 1));
    const x1 = Math.min(this.w - 1, Math.ceil(cx + rOuter + 1));
    const y0 = Math.max(0, Math.floor(cy - rOuter - 1));
    const y1 = Math.min(this.h - 1, Math.ceil(cy + rOuter + 1));

    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        let hits = 0;
        for (let sy = 0; sy < SS; sy++) {
          for (let sx = 0; sx < SS; sx++) {
            const px = x + (sx + 0.5) / SS;
            const py = y + (sy + 0.5) / SS;
            const dx = px - cx;
            const dy = py - cy;
            const dist = Math.hypot(dx, dy);
            if (dist < rInner || dist > rOuter) continue;
            let ang = Math.atan2(dy, dx);
            // a0'dan itibaren normalize et
            let rel = ang - a0;
            while (rel < 0) rel += Math.PI * 2;
            if (rel <= a1 - a0) hits++;
          }
        }
        if (hits) this.blend(x, y, color, (hits / (SS * SS)) * alpha);
      }
    }
  }

  rect(x, y, w, h, color, alpha = 1) {
    for (let yy = y; yy < y + h; yy++) {
      for (let xx = x; xx < x + w; xx++) this.blend(xx, yy, color, alpha);
    }
  }

  toPNG() {
    return encodePNG(this.w, this.h, this.data);
  }
}

/* ------------------------------ 3x5 font --------------------------------- */

const FONT = {
  0: [0b111, 0b101, 0b101, 0b101, 0b111],
  1: [0b010, 0b110, 0b010, 0b010, 0b111],
  2: [0b111, 0b001, 0b111, 0b100, 0b111],
  3: [0b111, 0b001, 0b111, 0b001, 0b111],
  4: [0b101, 0b101, 0b111, 0b001, 0b001],
  5: [0b111, 0b100, 0b111, 0b001, 0b111],
  6: [0b111, 0b100, 0b111, 0b101, 0b111],
  7: [0b111, 0b001, 0b001, 0b001, 0b001],
  8: [0b111, 0b101, 0b111, 0b101, 0b111],
  9: [0b111, 0b101, 0b111, 0b001, 0b111],
  '!': [0b010, 0b010, 0b010, 0b000, 0b010],
  '?': [0b111, 0b001, 0b011, 0b000, 0b010],
  '-': [0b000, 0b000, 0b111, 0b000, 0b000],
};

/** Metni sol-ust koseden, scale katiyla cizer. Genisligi dondurur. */
function drawText(canvas, text, x, y, scale, color, alpha = 1) {
  let cursor = x;
  for (const ch of String(text)) {
    const glyph = FONT[ch];
    if (!glyph) {
      cursor += 2 * scale;
      continue;
    }
    for (let row = 0; row < 5; row++) {
      for (let col = 0; col < 3; col++) {
        if (glyph[row] & (1 << (2 - col))) {
          canvas.rect(cursor + col * scale, y + row * scale, scale, scale, color, alpha);
        }
      }
    }
    cursor += 4 * scale; // 3 px glif + 1 px bosluk
  }
  return cursor - x - scale;
}

function textWidth(text, scale) {
  return String(text).length * 4 * scale - scale;
}

/* -------------------------------- PNG ------------------------------------ */

let CRC_TABLE = null;
function crcTable() {
  if (CRC_TABLE) return CRC_TABLE;
  CRC_TABLE = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    CRC_TABLE[n] = c;
  }
  return CRC_TABLE;
}

function crc32(buf) {
  const t = crcTable();
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = t[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function encodePNG(w, h, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  // Her satirin basina filtre baytu (0 = None).
  const raw = Buffer.alloc(h * (w * 4 + 1));
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  }

  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

module.exports = { Canvas, drawText, textWidth, encodePNG };
