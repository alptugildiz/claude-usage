'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { app } = require('electron');

/**
 * API'nin 429 (cok istek) yanitini uygulama yeniden baslatmalari arasinda
 * da hatirlar. Sebep: gelistirme sirasinda ust uste hizli yeniden baslatma
 * (veya bir cokme dongusu) her seferinde backoff hafizasi sifir yeni bir
 * surecle baslar ve API'yi tekrar tekrar yorabilir. Bu kucuk dosya, "su
 * zamana kadar tekrar istek atma" bilgisini diskte tasir.
 */

function file() {
  return path.join(app.getPath('userData'), 'rate-guard.json');
}

/** @returns {{nextAllowedAt:number}|null} */
function load() {
  try {
    const raw = JSON.parse(fs.readFileSync(file(), 'utf8'));
    if (raw && Number.isFinite(raw.nextAllowedAt)) return raw;
  } catch {
    /* yok veya bozuk -> yok say */
  }
  return null;
}

function save(nextAllowedAt) {
  try {
    fs.mkdirSync(path.dirname(file()), { recursive: true });
    fs.writeFileSync(file(), JSON.stringify({ nextAllowedAt }));
  } catch {
    /* kritik degil, sessizce gec */
  }
}

function clear() {
  try {
    fs.rmSync(file(), { force: true });
  } catch {
    /* yok say */
  }
}

module.exports = { load, save, clear };
