'use strict';

const { Tray, Menu, nativeImage, app } = require('electron');
const { Canvas, drawText, textWidth } = require('./icon-render');
const { SEVERITY } = require('./config');
const settings = require('./settings');
const I18N = require('../i18n');

function t() {
  return I18N.pick(settings.get().language);
}

/**
 * Sistem tepsisi ikonu. Calisma aninda cizilir: yuzdeye gore dolan halka
 * + ortada rakam. Renk esige gore degisir.
 */

const SIZE = 32;
const COLORS = {
  ok: [126, 200, 140],
  warn: [232, 178, 74],
  danger: [214, 92, 72],
  idle: [140, 136, 128],
  track: [255, 255, 255],
};

/**
 * API kendi `severity` degerini gonderiyorsa o esastir; yoksa yuzde esikleri.
 * %95 ustu her durumda kirmizi.
 */
function severityColor(pct, status, severity) {
  if (status !== 'ok') return COLORS.idle;
  if (pct >= 95) return COLORS.danger;
  if (severity === 'critical' || severity === 'error' || severity === 'rejected') {
    return COLORS.danger;
  }
  if (severity === 'warning') return COLORS.warn;
  if (severity === 'normal') return COLORS.ok;
  if (pct >= SEVERITY.DANGER) return COLORS.danger;
  if (pct >= SEVERITY.WARN) return COLORS.warn;
  return COLORS.ok;
}

/**
 * Tray ikonu: buyuk yuzde rakami + altta ince ilerleme cubugu.
 *
 * Halka+rakam denendi ama 16px'e indiginde rakamlar halkaya girip
 * okunamaz hale geliyordu; bu duzen kucuk boyutta cok daha net.
 */
function renderIcon(pct, status, severity) {
  const c = new Canvas(SIZE, SIZE);
  const color = severityColor(pct, status, severity);

  let label;
  if (status === 'logged-out') label = '?';
  else if (status !== 'ok' && status !== 'loading') label = '!';
  else if (pct >= 100) label = '99';
  else label = String(Math.round(pct));

  // Rakamlar: iki hane 4x olcekte 28x20, tek hane ortalanir.
  const scale = label.length >= 2 ? 4 : 5;
  const w = textWidth(label, scale);
  const h = 5 * scale;
  const textY = Math.round((SIZE - 6 - h) / 2);
  drawText(c, label, Math.round((SIZE - w) / 2), textY, scale, color, 1);

  // Alt ilerleme cubugu
  const barY = SIZE - 5;
  const barH = 4;
  const barX = 2;
  const barW = SIZE - 4;
  c.rect(barX, barY, barW, barH, COLORS.track, 0.22);
  const frac = Math.max(0, Math.min(1, pct / 100));
  if (frac > 0 && status === 'ok') {
    c.rect(barX, barY, Math.max(2, Math.round(barW * frac)), barH, color, 1);
  }

  const img = nativeImage.createFromBuffer(c.toPNG(), { width: SIZE, height: SIZE });
  return img.resize({ width: 16, height: 16, quality: 'best' });
}

class TrayController {
  constructor() {
    this.tray = null;
    this.handlers = {};
    this.lastKey = null;
  }

  /**
   * @param {{onShow, onRefresh, onSettings, onQuit, onToggleAutoLaunch,
   *          isAutoLaunchEnabled}} handlers
   */
  create(handlers) {
    this.handlers = handlers;
    this.tray = new Tray(renderIcon(0, 'idle'));
    this.tray.setToolTip(t().tray.tooltipBase);
    this.tray.on('click', () => this.handlers.onShow && this.handlers.onShow());
    this.tray.on('double-click', () => this.handlers.onShow && this.handlers.onShow());
    this.rebuildMenu();
    return this.tray;
  }

  rebuildMenu() {
    if (!this.tray) return;
    const h = this.handlers;
    const tr = t().tray;
    this.tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: tr.show, click: () => h.onShow && h.onShow() },
        { label: tr.refreshNow, click: () => h.onRefresh && h.onRefresh() },
        { type: 'separator' },
        { label: tr.settings, click: () => h.onSettings && h.onSettings() },
        {
          label: tr.openAtLogin,
          type: 'checkbox',
          checked: h.isAutoLaunchEnabled ? h.isAutoLaunchEnabled() : false,
          click: (item) => {
            h.onToggleAutoLaunch && h.onToggleAutoLaunch(item.checked);
            this.rebuildMenu();
          },
        },
        { type: 'separator' },
        { label: tr.quit, click: () => h.onQuit && h.onQuit() },
      ])
    );
  }

  /** @param {ReturnType<import('./poller')['snapshot']>} snap */
  update(snap) {
    if (!this.tray) return;

    const limits = snap.usage?.limits || [];
    const primary =
      limits.find((l) => l.group === 'session') || limits[0] || null;
    const pct = primary ? primary.percent : 0;
    const severity = primary ? primary.severity : null;
    const status = snap.status;

    // Ayni ikon tekrar cizilmesin.
    const key = `${Math.round(pct)}|${status}|${severity || ''}`;
    if (key !== this.lastKey) {
      this.lastKey = key;
      this.tray.setImage(renderIcon(pct, status, severity));
    }

    this.tray.setToolTip(buildTooltip(snap));
  }

  destroy() {
    if (this.tray) this.tray.destroy();
    this.tray = null;
  }
}

function buildTooltip(snap) {
  const tr = t().tray;
  if (snap.status === 'logged-out') return tr.loggedOut;
  if (snap.status === 'loading' && !snap.usage) return tr.loading;
  if (snap.status === 'error' && !snap.usage) {
    return tr.error(snap.error?.message || tr.genericError);
  }

  const limits = snap.usage?.limits || [];
  if (limits.length === 0) return tr.tooltipBase;

  const lines = limits.slice(0, 4).map((l) => {
    const reset = l.resetsAt ? ` · ${shortReset(l.resetsAt)}` : '';
    return `${l.label}: %${Math.round(l.percent)}${reset}`;
  });
  if (snap.status === 'error') lines.push(tr.stale);
  return `${tr.tooltipBase}\n${lines.join('\n')}`;
}

function shortReset(iso) {
  const time = t().time;
  const ms = Date.parse(iso) - Date.now();
  if (!Number.isFinite(ms)) return '';
  if (ms <= 0) return time.resetting;
  const mins = Math.round(ms / 60000);
  if (mins < 60) return time.shortMin(mins);
  const hours = Math.round(mins / 60);
  if (hours < 48) return time.shortHour(hours);
  return time.shortDay(Math.round(hours / 24));
}

module.exports = new TrayController();
module.exports.renderIcon = renderIcon;
