'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { app, safeStorage } = require('electron');

/**
 * Token deposu.
 *
 * Guvenlik kurali: sirlar diske ASLA duz metin yazilmaz. safeStorage
 * (Windows'ta DPAPI, kullanici hesabina bagli) kullanilir. Sifreleme
 * kullanilamiyorsa diske hic yazilmaz -- sadece bellekte tutulur ve
 * kullaniciya durum bildirilir. Duz metin fallback'i yoktur.
 */

const FILE_NAME = 'auth.bin';

let memoryOnly = null; // sifreleme yoksa buradan servis edilir
let cache = null;

function filePath() {
  return path.join(app.getPath('userData'), FILE_NAME);
}

function encryptionAvailable() {
  try {
    return safeStorage.isEncryptionAvailable();
  } catch {
    return false;
  }
}

/** @returns {object|null} */
function load() {
  if (cache) return cache;
  if (memoryOnly) return memoryOnly;
  if (!encryptionAvailable()) return null;

  const p = filePath();
  let blob;
  try {
    blob = fs.readFileSync(p);
  } catch {
    return null; // yok veya okunamiyor
  }
  try {
    const json = safeStorage.decryptString(blob);
    cache = JSON.parse(json);
    return cache;
  } catch {
    // Baska bir kullanici hesabinda sifrelenmis ya da bozuk -> temizle.
    try {
      fs.rmSync(p, { force: true });
    } catch {
      /* yok say */
    }
    return null;
  }
}

/** @param {object} tokens */
function save(tokens) {
  cache = tokens;
  if (!encryptionAvailable()) {
    memoryOnly = tokens;
    return { persisted: false };
  }
  const p = filePath();
  const tmp = `${p}.${process.pid}.tmp`;
  const blob = safeStorage.encryptString(JSON.stringify(tokens));
  fs.mkdirSync(path.dirname(p), { recursive: true });
  // 0o600: sadece sahibi okuyabilsin (Windows'ta ACL'e birebir yansimasa da
  // POSIX katmanlarinda ve olasi tasimalarda dogru davranis).
  fs.writeFileSync(tmp, blob, { mode: 0o600 });
  fs.renameSync(tmp, p);
  memoryOnly = null;
  return { persisted: true };
}

function clear() {
  cache = null;
  memoryOnly = null;
  try {
    fs.rmSync(filePath(), { force: true });
  } catch {
    /* yok say */
  }
}

module.exports = { load, save, clear, encryptionAvailable, filePath };
