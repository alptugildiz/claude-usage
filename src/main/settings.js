'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { app } = require('electron');

/** Kullanici ayarlari. Sir icermez, duz JSON olarak saklanir. */

const DEFAULTS = {
  theme: 'claude',
  accent: null,          // null = temanin kendi vurgu rengi
  radius: 14,            // px
  opacity: 100,          // 40-100 (sadece #shell arka planinin alfa kanali)
  compact: false,
  mono: false,
  gaugeStyle: 'ring',    // 'ring' | 'bar'
  animations: true,
  minimizeToTray: true,
  startHidden: false,
  openAtLogin: false,
  notifyAt: [80, 95],    // esik bildirimleri
  showAnalytics: true,
  language: 'tr',        // 'tr' | 'en' -- ilk calistirmada sistem diline gore secilir
};

const LANGUAGES = ['tr', 'en'];

let cache = null;

function filePath() {
  return path.join(app.getPath('userData'), 'settings.json');
}

/** Ilk calistirmada sistem diline gore makul bir varsayilan sec. */
function detectDefaultLanguage() {
  try {
    const loc = String(app.getLocale() || '').toLowerCase();
    return loc.startsWith('tr') ? 'tr' : 'en';
  } catch {
    return DEFAULTS.language;
  }
}

function get() {
  if (cache) return cache;
  let stored = {};
  let firstRun = false;
  try {
    stored = JSON.parse(fs.readFileSync(filePath(), 'utf8'));
  } catch {
    stored = {};
    firstRun = true;
  }
  const base = firstRun
    ? Object.assign({}, DEFAULTS, { language: detectDefaultLanguage() })
    : DEFAULTS;
  cache = sanitize(Object.assign({}, base, stored));
  return cache;
}

function set(patch) {
  cache = sanitize(Object.assign({}, get(), patch));
  try {
    fs.mkdirSync(path.dirname(filePath()), { recursive: true });
    fs.writeFileSync(filePath(), JSON.stringify(cache, null, 2));
  } catch {
    /* ayar yazilamadi, bellekte devam */
  }
  return cache;
}

const THEMES = ['claude', 'claude-light', 'midnight', 'terminal', 'minimal'];

function sanitize(s) {
  const out = Object.assign({}, DEFAULTS, s);
  if (!THEMES.includes(out.theme)) out.theme = DEFAULTS.theme;
  out.radius = clamp(Number(out.radius), 0, 24, DEFAULTS.radius);
  // Sadece arka plan renginin alfa kanaline uygulaniyor (tum agaca degil),
  // bu yuzden dusuk degerlerde bile yazi/butonlar tam okunur kalir.
  out.opacity = clamp(Number(out.opacity), 40, 100, DEFAULTS.opacity);
  if (out.accent != null && !/^#[0-9a-fA-F]{6}$/.test(out.accent)) out.accent = null;
  if (!['ring', 'bar'].includes(out.gaugeStyle)) out.gaugeStyle = DEFAULTS.gaugeStyle;
  if (!LANGUAGES.includes(out.language)) out.language = DEFAULTS.language;
  if (!Array.isArray(out.notifyAt)) out.notifyAt = DEFAULTS.notifyAt;
  out.notifyAt = out.notifyAt
    .map((n) => clamp(Number(n), 1, 100, null))
    .filter((n) => n != null)
    .slice(0, 4);
  for (const k of ['compact', 'mono', 'animations', 'minimizeToTray', 'startHidden', 'openAtLogin', 'showAnalytics']) {
    out[k] = !!out[k];
  }
  return out;
}

function clamp(n, lo, hi, fallback) {
  if (!Number.isFinite(n)) return fallback;
  return Math.max(lo, Math.min(hi, n));
}

module.exports = { get, set, DEFAULTS, THEMES, LANGUAGES };
