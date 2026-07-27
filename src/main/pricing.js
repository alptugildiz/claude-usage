'use strict';

/**
 * Yerel maliyet tahmini icin fiyat tablosu (milyon token basina USD).
 * Kaynak: Anthropic model/fiyat tablosu (bkz. claude-api skill, 2026-06 snapshot).
 *
 * Cache carpanlari:
 *   - Cache okuma ................ 0.10x girdi fiyati
 *   - Cache yazma (5 dk TTL) ..... 1.25x girdi fiyati
 *   - Cache yazma (1 saat TTL) ... 2.00x girdi fiyati
 *
 * Bu SADECE yerel bir tahmindir; faturalandirmayi temsil etmez. Abonelik
 * planlarinda zaten token basina odeme yapilmaz -- bu sayi "API'den alsaydin
 * ne tutardi" karsilastirmasidir ve UI'da oyle etiketlenir.
 */

const CACHE_READ_MULTIPLIER = 0.1;
const CACHE_WRITE_5M_MULTIPLIER = 1.25;
const CACHE_WRITE_1H_MULTIPLIER = 2.0;

/** [girdi, cikti] — milyon token basina USD */
const PRICES = {
  'claude-fable-5': [10, 50],
  'claude-mythos-5': [10, 50],
  'claude-opus-5': [5, 25],
  'claude-opus-4-8': [5, 25],
  'claude-opus-4-7': [5, 25],
  'claude-opus-4-6': [5, 25],
  'claude-opus-4-5': [5, 25],
  'claude-opus-4-1': [15, 75],
  'claude-opus-4-0': [15, 75],
  'claude-sonnet-5': [3, 15],
  'claude-sonnet-4-6': [3, 15],
  'claude-sonnet-4-5': [3, 15],
  'claude-sonnet-4-0': [3, 15],
  'claude-haiku-4-5': [1, 5],
};

/** Bilinmeyen model adlari icin aile bazli yedek. */
const FAMILY_FALLBACK = [
  [/fable|mythos/i, [10, 50]],
  [/opus/i, [5, 25]],
  [/sonnet/i, [3, 15]],
  [/haiku/i, [1, 5]],
];

function ratesFor(model) {
  if (!model) return null;
  // Tarihli surumleri kirp: claude-haiku-4-5-20251001 -> claude-haiku-4-5
  const base = String(model).replace(/-\d{8}$/, '');
  if (PRICES[base]) return PRICES[base];
  for (const [re, rates] of FAMILY_FALLBACK) {
    if (re.test(base)) return rates;
  }
  return null;
}

/**
 * Bir istegin tahmini maliyeti (USD).
 * @param {string} model
 * @param {{input:number, output:number, cacheRead:number,
 *          cacheWrite5m:number, cacheWrite1h:number}} t
 */
function costOf(model, t) {
  const rates = ratesFor(model);
  if (!rates) return 0;
  const [inRate, outRate] = rates;
  const M = 1_000_000;
  return (
    (t.input * inRate) / M +
    (t.output * outRate) / M +
    (t.cacheRead * inRate * CACHE_READ_MULTIPLIER) / M +
    (t.cacheWrite5m * inRate * CACHE_WRITE_5M_MULTIPLIER) / M +
    (t.cacheWrite1h * inRate * CACHE_WRITE_1H_MULTIPLIER) / M
  );
}

/** Model kimliginden okunabilir ad. */
function displayName(model) {
  if (!model) return 'bilinmeyen';
  return String(model)
    .replace(/^claude-/, '')
    .replace(/-\d{8}$/, '')
    .replace(/-/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

module.exports = {
  costOf,
  ratesFor,
  displayName,
  isKnown: (m) => ratesFor(m) !== null,
  CACHE_READ_MULTIPLIER,
  CACHE_WRITE_5M_MULTIPLIER,
  CACHE_WRITE_1H_MULTIPLIER,
};
