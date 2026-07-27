'use strict';

const https = require('node:https');
const { URL } = require('node:url');
const { ALLOWED_HOSTS } = require('./config');

/**
 * Tek cikis noktasi olan HTTPS istemcisi.
 *
 * Guvenlik: allowlist disindaki hicbir host'a istek yapilmaz, http'ye izin
 * verilmez, yonlendirmeler takip edilmez (token sizintisini onlemek icin).
 */

class HttpError extends Error {
  constructor(status, body, headers) {
    super(`HTTP ${status}`);
    this.name = 'HttpError';
    this.status = status;
    this.body = body;
    this.headers = headers || {};
  }

  /** Retry-After basligini milisaniye olarak dondurur (yoksa null). */
  get retryAfterMs() {
    const raw = this.headers['retry-after'];
    if (!raw) return null;
    const secs = Number(raw);
    if (Number.isFinite(secs)) return Math.max(0, secs * 1000);
    const at = Date.parse(raw);
    return Number.isFinite(at) ? Math.max(0, at - Date.now()) : null;
  }
}

class NetworkError extends Error {
  constructor(cause) {
    super(cause && cause.message ? cause.message : 'network error');
    this.name = 'NetworkError';
    this.cause = cause;
  }
}

function assertAllowed(urlString) {
  let url;
  try {
    url = new URL(urlString);
  } catch {
    throw new Error('Gecersiz URL');
  }
  if (url.protocol !== 'https:') {
    throw new Error(`Sadece https destekleniyor: ${url.protocol}`);
  }
  if (!ALLOWED_HOSTS.has(url.hostname)) {
    throw new Error(`Izin verilmeyen host: ${url.hostname}`);
  }
  return url;
}

/**
 * @param {string} urlString
 * @param {{ method?: string, headers?: Record<string,string>, body?: string,
 *           timeoutMs?: number, json?: boolean }} [opts]
 */
function request(urlString, opts = {}) {
  const url = assertAllowed(urlString);
  const method = opts.method || 'GET';
  const timeoutMs = opts.timeoutMs || 10000;

  return new Promise((resolve, reject) => {
    const headers = Object.assign({ Accept: 'application/json' }, opts.headers);
    if (opts.body != null) {
      headers['Content-Length'] = Buffer.byteLength(opts.body);
    }

    const req = https.request(
      {
        protocol: url.protocol,
        hostname: url.hostname,
        port: url.port || 443,
        path: url.pathname + url.search,
        method,
        headers,
      },
      (res) => {
        const chunks = [];
        let size = 0;
        res.on('data', (c) => {
          size += c.length;
          // 8 MB ustu cevabi kesip at (bellek korumasi).
          if (size > 8 * 1024 * 1024) {
            req.destroy(new Error('Cevap cok buyuk'));
            return;
          }
          chunks.push(c);
        });
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          let parsed = null;
          if (text) {
            try {
              parsed = JSON.parse(text);
            } catch {
              parsed = null;
            }
          }
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve({ status: res.statusCode, data: parsed, text, headers: res.headers });
          } else {
            reject(new HttpError(res.statusCode, parsed ?? text, res.headers));
          }
        });
      }
    );

    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error(`Zaman asimi (${timeoutMs}ms)`));
    });
    req.on('error', (err) => {
      reject(err instanceof HttpError ? err : new NetworkError(err));
    });

    if (opts.body != null) req.write(opts.body);
    req.end();
  });
}

module.exports = { request, assertAllowed, HttpError, NetworkError };
