'use strict';

const crypto = require('node:crypto');
const http = require('node:http');
const { shell } = require('electron');
const { OAUTH } = require('./config');
const net = require('./net');
const store = require('./secure-store');

/**
 * OAuth 2.0 Authorization Code + PKCE (S256) akisi.
 *
 * Guvenlik notlari:
 *  - Giris harici tarayicida acilir; uygulama ici login penceresi YOKTUR.
 *  - Loopback sunucu 127.0.0.1'e bind edilir, ephemeral port kullanir,
 *    tek istek karsilar ve hemen kapanir.
 *  - `state` her zaman dogrulanir; uyusmazsa akis iptal edilir.
 *  - Bu modul Claude Code'un kimlik dosyasina (~/.claude/.credentials.json)
 *    ne okur ne yazar. Kendi token'imizi kendimiz aliriz.
 */

const CALLBACK_TIMEOUT_MS = 2 * 60 * 1000;
const REFRESH_SKEW_MS = 5 * 60 * 1000; // son 5 dk kala proaktif yenile

let tokens = null;      // { accessToken, refreshToken, expiresAt, scopes }
let refreshPromise = null;
let pendingFlow = null; // devam eden giris akisi

function b64url(buf) {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function makePkce() {
  const verifier = b64url(crypto.randomBytes(64));
  const challenge = b64url(crypto.createHash('sha256').update(verifier).digest());
  return { verifier, challenge };
}

function buildAuthorizeUrl({ challenge, state, redirectUri }) {
  const u = new URL(OAUTH.AUTHORIZE_URL);
  u.searchParams.set('code', 'true');
  u.searchParams.set('client_id', OAUTH.CLIENT_ID);
  u.searchParams.set('response_type', 'code');
  u.searchParams.set('redirect_uri', redirectUri);
  u.searchParams.set('scope', OAUTH.SCOPES.join(' '));
  u.searchParams.set('code_challenge', challenge);
  u.searchParams.set('code_challenge_method', 'S256');
  u.searchParams.set('state', state);
  return u.toString();
}

const DONE_PAGE = `<!doctype html><meta charset="utf-8">
<title>Claude Usage</title>
<style>
 html{color-scheme:dark light}
 body{font:16px/1.6 system-ui,-apple-system,Segoe UI,sans-serif;display:grid;
      place-items:center;min-height:100vh;margin:0;background:#1a1815;color:#e8e3db}
 .card{text-align:center;padding:40px 48px;border:1px solid #3a352e;border-radius:16px;
       background:#221f1b;max-width:420px}
 h1{font-size:20px;margin:0 0 8px;font-weight:600}
 p{margin:0;color:#a09889;font-size:14px}
 .tick{width:48px;height:48px;border-radius:50%;background:#c96442;display:grid;
       place-items:center;margin:0 auto 20px;color:#fff;font-size:24px}
</style>
<div class="card">
  <div class="tick">&check;</div>
  <h1>Giris basarili</h1>
  <p>Bu sekmeyi kapatip Claude Usage uygulamasina donebilirsin.</p>
</div>`;

const FAIL_PAGE = `<!doctype html><meta charset="utf-8">
<title>Claude Usage</title>
<style>body{font:16px/1.6 system-ui,sans-serif;display:grid;place-items:center;
min-height:100vh;margin:0;background:#1a1815;color:#e8e3db}</style>
<p>Giris tamamlanamadi. Uygulamaya donup tekrar dene.</p>`;

/**
 * Loopback callback sunucusunu ayaga kaldirir.
 * @returns {Promise<{port:number, waitForCode:Promise<string>, close:()=>void}>}
 */
function startCallbackServer(expectedState) {
  return new Promise((resolveServer, rejectServer) => {
    let settle;
    const waitForCode = new Promise((res, rej) => {
      settle = { res, rej };
    });

    const server = http.createServer((req, res) => {
      let url;
      try {
        url = new URL(req.url, 'http://127.0.0.1');
      } catch {
        res.writeHead(400).end();
        return;
      }
      if (url.pathname !== '/callback') {
        res.writeHead(404).end();
        return;
      }

      const code = url.searchParams.get('code');
      const state = url.searchParams.get('state');
      const error = url.searchParams.get('error');

      const ok = !error && code && state === expectedState;
      res.writeHead(ok ? 200 : 400, {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
      });
      res.end(ok ? DONE_PAGE : FAIL_PAGE);

      // Cevabi yazdiktan sonra kapat.
      setImmediate(() => close());

      if (error) settle.rej(new Error(`Yetkilendirme reddedildi: ${error}`));
      else if (state !== expectedState) settle.rej(new Error('state dogrulamasi basarisiz'));
      else if (!code) settle.rej(new Error('Sunucu kod dondurmedi'));
      else settle.res(code);
    });

    let closed = false;
    const timer = setTimeout(() => {
      settle.rej(new Error('Giris zaman asimina ugradi (2 dk)'));
      close();
    }, CALLBACK_TIMEOUT_MS);

    function close() {
      if (closed) return;
      closed = true;
      clearTimeout(timer);
      try {
        server.close();
      } catch {
        /* yok say */
      }
    }

    server.on('error', (err) => {
      close();
      rejectServer(err);
    });

    // Sadece loopback arayuzu -- disaridan erisilemez.
    server.listen(0, '127.0.0.1', () => {
      resolveServer({ port: server.address().port, waitForCode, close });
    });
  });
}

async function exchange(params) {
  const res = await net.request(OAUTH.TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
    timeoutMs: 20000,
  });
  const d = res.data || {};
  if (!d.access_token) throw new Error('Token cevabinda access_token yok');
  return {
    accessToken: d.access_token,
    refreshToken: d.refresh_token || null,
    expiresAt: Date.now() + (Number(d.expires_in) || 3600) * 1000,
    scopes: typeof d.scope === 'string' ? d.scope.split(' ') : OAUTH.SCOPES,
  };
}

/** Diskteki token'i belleğe yukler. */
function init() {
  const loaded = store.load();
  if (loaded && loaded.accessToken) tokens = loaded;
  return isLoggedIn();
}

function isLoggedIn() {
  return !!(tokens && tokens.accessToken);
}

/**
 * Tarayici uzerinden giris akisini calistirir.
 * @returns {Promise<void>}
 */
async function login() {
  if (pendingFlow) return pendingFlow;

  pendingFlow = (async () => {
    const { verifier, challenge } = makePkce();
    const state = b64url(crypto.randomBytes(32));

    const server = await startCallbackServer(state);
    const redirectUri = `http://localhost:${server.port}/callback`;

    try {
      await shell.openExternal(buildAuthorizeUrl({ challenge, state, redirectUri }));
      const code = await server.waitForCode;
      const t = await exchange({
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
        client_id: OAUTH.CLIENT_ID,
        code_verifier: verifier,
        state,
      });
      tokens = t;
      return store.save(t);
    } finally {
      server.close();
    }
  })();

  try {
    return await pendingFlow;
  } finally {
    pendingFlow = null;
  }
}

/**
 * Manuel akis: kullanici tarayicidan aldigi kodu yapistirir.
 * Loopback engellenirse kullanilir.
 */
function beginManualLogin() {
  const { verifier, challenge } = makePkce();
  const state = b64url(crypto.randomBytes(32));
  const url = buildAuthorizeUrl({
    challenge,
    state,
    redirectUri: OAUTH.MANUAL_REDIRECT_URL,
  });
  return { url, session: { verifier, state } };
}

async function completeManualLogin(session, pastedCode) {
  // Yapistirilan deger "kod#state" formatinda gelebilir.
  const [code, stateFromCode] = String(pastedCode).trim().split('#');
  if (!code) throw new Error('Kod bos');
  if (stateFromCode && stateFromCode !== session.state) {
    throw new Error('state dogrulamasi basarisiz');
  }
  const t = await exchange({
    grant_type: 'authorization_code',
    code,
    redirect_uri: OAUTH.MANUAL_REDIRECT_URL,
    client_id: OAUTH.CLIENT_ID,
    code_verifier: session.verifier,
    state: session.state,
  });
  tokens = t;
  return store.save(t);
}

async function doRefresh() {
  if (!tokens || !tokens.refreshToken) {
    throw new Error('Yenileme token\'i yok, tekrar giris gerekiyor');
  }
  const t = await exchange({
    grant_type: 'refresh_token',
    refresh_token: tokens.refreshToken,
    client_id: OAUTH.CLIENT_ID,
  });
  // Bazi sunucular refresh_token'i tekrar dondurmez -> eskisini koru.
  if (!t.refreshToken) t.refreshToken = tokens.refreshToken;
  tokens = t;
  store.save(t);
  return t;
}

/**
 * Gecerli bir access token dondurur; gerekiyorsa yeniler.
 * @param {{force?: boolean}} [opts]
 */
async function getAccessToken(opts = {}) {
  if (!tokens) throw new Error('Giris yapilmamis');

  const expiringSoon = tokens.expiresAt - Date.now() < REFRESH_SKEW_MS;
  if (!opts.force && !expiringSoon) return tokens.accessToken;

  if (!refreshPromise) {
    refreshPromise = doRefresh().finally(() => {
      refreshPromise = null;
    });
  }
  const t = await refreshPromise;
  return t.accessToken;
}

function logout() {
  tokens = null;
  store.clear();
}

/** Sir icermeyen durum ozeti (renderer'a gonderilebilir). */
function status() {
  return {
    loggedIn: isLoggedIn(),
    persisted: store.encryptionAvailable(),
    expiresAt: tokens ? tokens.expiresAt : null,
    scopes: tokens ? tokens.scopes : null,
  };
}

module.exports = {
  init,
  login,
  logout,
  isLoggedIn,
  getAccessToken,
  status,
  beginManualLogin,
  completeManualLogin,
};
