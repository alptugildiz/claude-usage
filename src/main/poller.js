'use strict';

const { EventEmitter } = require('node:events');
const { POLL } = require('./config');
const api = require('./api');
const auth = require('./auth');
const net = require('./net');
const history = require('./history');
const rateGuard = require('./rate-guard');

/**
 * Sabit yoklama: dakikada bir istek.
 *  - 429/5xx -> ustel backoff (60s -> 2dk -> 5dk -> 10dk tavan).
 *  - Backoff aktifken (pencere acilisi, manuel yenile, mini-mod gecisi gibi)
 *    zorlama istekler engellenir -- zamanlanan yeniden deneme beklenir.
 *  - Bu bekleme uygulama yeniden baslatmalari arasinda da hatirlanir
 *    (rate-guard.js), boylece art arda hizli baslatmalar API'yi yormaz.
 */

class Poller extends EventEmitter {
  constructor() {
    super();
    this.timer = null;
    this.running = false;
    this.inFlight = false;
    this.backoffIndex = -1;
    this.windowVisible = true;
    this.state = {
      status: 'idle', // idle | loading | ok | error | logged-out
      usage: null,
      profile: null,
      history: {},
      error: null,
      lastOkAt: null,
    };
  }

  start() {
    if (this.running) return;
    this.running = true;

    // Onceki surecte 429 nedeniyle bekleme sureci varsa hatirla ve
    // hemen istek atmak yerine o zamana kadar bekle.
    const gate = rateGuard.load();
    const now = Date.now();
    if (gate && gate.nextAllowedAt > now + 1000) {
      this.backoffIndex = 0;
      this.reschedule(gate.nextAllowedAt - now);
      return;
    }
    this.tick(true);
  }

  stop() {
    this.running = false;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  setWindowVisible(v) {
    const was = this.windowVisible;
    this.windowVisible = !!v;
    // Pencere yeni acildiysa hemen tazele (dusuk hizin kendisi degismez).
    if (!was && this.windowVisible && this.running) this.tick(true);
  }

  /** Kullanicinin "simdi yenile" istegi. */
  refreshNow() {
    return this.tick(true);
  }

  /** Sabit araligi hesaplar: hata yoksa dakikada bir, hatada ustel backoff. */
  intervalMs() {
    if (this.backoffIndex >= 0) {
      const i = Math.min(this.backoffIndex, POLL.BACKOFF_MS.length - 1);
      return POLL.BACKOFF_MS[i];
    }
    return POLL.BASE_MS;
  }

  reschedule(overrideMs) {
    if (!this.running) return;
    if (this.timer) clearTimeout(this.timer);
    const ms = overrideMs != null ? Math.max(POLL.MIN_MS, overrideMs) : this.intervalMs();
    this.timer = setTimeout(() => this.tick(), ms);
    this.state.nextPollAt = Date.now() + ms;
  }

  async tick(immediate = false) {
    if (!this.running && !immediate) return;
    if (this.inFlight) return;

    // Aktif backoff sirasinda (pencere acilisi, manuel yenile, mini-mod
    // gecisi gibi) zorlama istekler API'yi tekrar yormasin -- zamanlanan
    // yeniden deneme zaten yaklasiyor.
    if (immediate && this.backoffIndex >= 0 && this.state.nextPollAt && Date.now() < this.state.nextPollAt) {
      return;
    }

    if (!auth.isLoggedIn()) {
      this.update({ status: 'logged-out', usage: null, profile: null, error: null });
      this.reschedule();
      return;
    }

    this.inFlight = true;
    if (!this.state.usage) this.update({ status: 'loading' });

    try {
      const [usageRaw, profileRaw] = await Promise.all([
        api.getUsage(),
        this.state.profile ? Promise.resolve(null) : api.getProfile(),
      ]);

      const usage = api.normalizeUsage(usageRaw);
      history.record(usage.limits);

      this.backoffIndex = -1;
      this.update({
        status: 'ok',
        usage,
        profile: profileRaw ? api.normalizeProfile(profileRaw) : this.state.profile,
        history: history.snapshotFor(usage.limits),
        error: null,
        lastOkAt: Date.now(),
      });
    } catch (err) {
      this.handleError(err);
    } finally {
      this.inFlight = false;
      if (this.running) this.reschedule(this.retryAfterMs);
      this.retryAfterMs = undefined;

      // Backoff aktifse bekleme zamanini diske yaz (yeniden baslatmalar
      // arasinda hatirlanir); degilse eski kaydi temizle.
      if (this.backoffIndex >= 0 && this.state.nextPollAt) {
        rateGuard.save(this.state.nextPollAt);
      } else {
        rateGuard.clear();
      }
    }
  }

  /**
   * Hata durumunu {kind, status} olarak saklar -- goruntu metnini BURADA
   * kurup dondurmuyoruz. Renderer/tray bu ham veriden her render'da
   * I18N.errorMessage() ile GUNCEL dilde metni kurar. Aksi halde kullanici
   * dil degistirdiginde, bir sonraki API cagrisina (rate-limit sirasinda
   * dakikalarca surebilir) kadar eski dildeki metin ekranda kalirdi.
   */
  handleError(err) {
    let kind = 'network';
    let status;

    if (err instanceof net.HttpError) {
      if (err.status === 401 || err.status === 403) {
        kind = 'auth';
        status = err.status;
      } else if (err.status === 429) {
        kind = 'rate';
        this.retryAfterMs = err.retryAfterMs || undefined;
      } else {
        kind = 'server';
        status = err.status;
      }
    } else if (/giris yapilmamis|Yenileme token/i.test(err.message || '')) {
      kind = 'auth';
    }

    if (kind !== 'auth') this.backoffIndex += 1;

    this.update({
      status: 'error',
      error: { kind, status },
    });
  }

  update(patch) {
    Object.assign(this.state, patch);
    this.emit('update', this.snapshot());
  }

  /** Renderer'a gonderilebilir, sir icermeyen anlik goruntu. */
  snapshot() {
    return {
      status: this.state.status,
      usage: this.state.usage,
      profile: this.state.profile,
      history: this.state.history,
      error: this.state.error,
      lastOkAt: this.state.lastOkAt,
      nextPollAt: this.state.nextPollAt || null,
    };
  }
}

module.exports = new Poller();
