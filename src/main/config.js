'use strict';

/**
 * Sabitler. Bu degerler Claude Code'un kendi OAuth istemci yapilandirmasindan
 * alinmistir ve canli olarak dogrulanmistir (bkz. plan dosyasi).
 */

const OAUTH = {
  CLIENT_ID: '9d1c250a-e61b-44d9-88ed-5944d1962f5e',
  AUTHORIZE_URL: 'https://claude.com/cai/oauth/authorize',
  TOKEN_URL: 'https://platform.claude.com/v1/oauth/token',
  MANUAL_REDIRECT_URL: 'https://platform.claude.com/oauth/code/callback',
  // Minimum scope ile basla; /api/oauth/usage 403 verirse genisletilir.
  SCOPES: ['user:profile', 'user:inference'],
};

const API = {
  BASE: 'https://api.anthropic.com',
  USAGE: '/api/oauth/usage',
  PROFILE: '/api/oauth/profile',
  BETA_HEADER: 'oauth-2025-04-20',
  USER_AGENT: 'claude-usage-desktop/1.0.0',
  TIMEOUT_MS: 10000,
};

/**
 * Ag allowlist. main/net.js disindaki hicbir host'a istek yapilmaz.
 */
const ALLOWED_HOSTS = new Set([
  'api.anthropic.com',
  'platform.claude.com',
  'claude.com',
]);

const POLL = {
  /** Sabit yoklama araligi: dakikada bir istek. */
  BASE_MS: 60_000,
  MIN_MS: 15_000,
  BACKOFF_MS: [60_000, 120_000, 300_000, 600_000],
};

/** Yuzde -> durum esikleri (tray rengi ve UI vurgu rengi icin). */
const SEVERITY = {
  WARN: 50,
  DANGER: 80,
};

/** Gecmis halka tamponu: 24 saat, 60 sn cozunurluk. */
const HISTORY = {
  MAX_POINTS: 1440,
  MAX_AGE_MS: 24 * 60 * 60 * 1000,
};

module.exports = { OAUTH, API, ALLOWED_HOSTS, POLL, SEVERITY, HISTORY };
