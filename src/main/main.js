'use strict';

const path = require('node:path');
const { app, BrowserWindow, ipcMain, shell, Notification, session, screen } = require('electron');

const { ALLOWED_HOSTS, SEVERITY } = require('./config');
const auth = require('./auth');
const api = require('./api');
const poller = require('./poller');
const history = require('./history');
const settings = require('./settings');
const autolaunch = require('./autolaunch');
const tray = require('./tray');
const analytics = require('./analytics');
const I18N = require('../i18n');

/* Tek ornek: ikinci calistirma mevcut pencereyi one getirir. */
if (!app.requestSingleInstanceLock()) {
  app.quit();
  return;
}

let win = null;
let quitting = false;
let manualSession = null;
let notified = new Set();

/* ------------------------------ mini widget ----------------------------- */

let isMini = false;
let restoreBounds = null;
const MINI_SIZE = { width: 236, height: 116 };
const NORMAL_MIN = { width: 380, height: 480 };

function setMiniMode(mini) {
  if (!win || mini === isMini) return;
  if (mini) {
    restoreBounds = win.getBounds();
    win.setResizable(false);
    win.setMinimumSize(MINI_SIZE.width, MINI_SIZE.height);
    win.setMaximumSize(MINI_SIZE.width, MINI_SIZE.height);
    const display = screen.getDisplayMatching(restoreBounds) || screen.getPrimaryDisplay();
    const wa = display.workArea;
    const margin = 16;
    win.setBounds({
      x: wa.x + wa.width - MINI_SIZE.width - margin,
      y: wa.y + wa.height - MINI_SIZE.height - margin,
      width: MINI_SIZE.width,
      height: MINI_SIZE.height,
    });
    win.setAlwaysOnTop(true, 'floating');
  } else {
    win.setAlwaysOnTop(false);
    win.setMaximumSize(0, 0); // 0 = sinirsiz
    win.setMinimumSize(NORMAL_MIN.width, NORMAL_MIN.height);
    win.setResizable(true);
    const s = settings.get();
    const fallback = { width: s.compact ? 420 : 940, height: s.compact ? 560 : 700 };
    win.setBounds(restoreBounds || fallback);
  }
  isMini = mini;
  poller.setWindowVisible(win.isVisible());
}

/* ------------------------------ pencere ------------------------------- */

function createWindow() {
  const s = settings.get();
  win = new BrowserWindow({
    width: s.compact ? 420 : 940,
    height: s.compact ? 560 : 700,
    minWidth: 380,
    minHeight: 480,
    show: false,
    frame: false,
    backgroundColor: '#00000000',
    // Her zaman sabit: yuvarlak koseler icin gerekli. Icerik saydamligi
    // (kullanicinin ayarladigi deger) CSS'te arka plan renginin alfa
    // kanaliyla yapilir -- butun agaca opacity uygulamak Chromium'da
    // saydam pencerelerde hayalet metin/kaybolan buton gibi render
    // hatalarina yol aciyordu.
    transparent: true,
    title: 'Claude Usage',
    icon: path.join(__dirname, '..', '..', 'build', 'icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webviewTag: false,
      devTools: process.argv.includes('--dev'),
      spellcheck: false,
    },
  });

  win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));

  win.once('ready-to-show', () => {
    if (!shouldStartHidden()) showWindow();
  });

  // Guvenlik: uygulama disina gezinme ve yeni pencere acma tamamen kapali.
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith('file://')) e.preventDefault();
  });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-attach-webview', (e) => e.preventDefault());

  win.on('close', (e) => {
    if (!quitting && settings.get().minimizeToTray) {
      e.preventDefault();
      win.hide();
      poller.setWindowVisible(false);
    }
  });
  win.on('hide', () => poller.setWindowVisible(false));
  win.on('show', () => poller.setWindowVisible(true));
  win.on('focus', () => poller.setWindowVisible(true));
}

function shouldStartHidden() {
  return autolaunch.launchedHidden() || settings.get().startHidden;
}

function showWindow() {
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
  poller.setWindowVisible(true);
}

/* --------------------------- guvenlik kilidi --------------------------- */

function hardenSession() {
  const ses = session.defaultSession;

  // Sadece allowlist'teki host'lara ve yerel dosyalara izin ver.
  ses.webRequest.onBeforeRequest((details, cb) => {
    const url = details.url;
    if (url.startsWith('file://') || url.startsWith('devtools://') || url.startsWith('blob:') || url.startsWith('data:')) {
      return cb({ cancel: false });
    }
    try {
      const host = new URL(url).hostname;
      cb({ cancel: !ALLOWED_HOSTS.has(host) });
    } catch {
      cb({ cancel: true });
    }
  });

  // Hicbir izin istegini kabul etme (kamera, bildirim, konum...).
  ses.setPermissionRequestHandler((_wc, _perm, cb) => cb(false));
  ses.setPermissionCheckHandler(() => false);
}

/* ------------------------------- IPC ---------------------------------- */

function registerIpc() {
  ipcMain.handle('usage:snapshot', () => poller.snapshot());
  ipcMain.handle('usage:refresh', async () => {
    await poller.refreshNow();
    return poller.snapshot();
  });

  ipcMain.handle('analytics:snapshot', () => analytics.snapshot());

  ipcMain.handle('auth:status', () => auth.status());
  ipcMain.handle('auth:login', async () => {
    const res = await auth.login();
    poller.refreshNow();
    return { ok: true, persisted: res && res.persisted !== false };
  });
  ipcMain.handle('auth:manual-begin', async () => {
    const { url, session: sess } = auth.beginManualLogin();
    manualSession = sess;
    await shell.openExternal(url);
    return { ok: true };
  });
  ipcMain.handle('auth:manual-complete', async (_e, code) => {
    if (!manualSession) {
      throw new Error(I18N.pick(settings.get().language).manual.notStarted);
    }
    const res = await auth.completeManualLogin(manualSession, code);
    manualSession = null;
    poller.refreshNow();
    return { ok: true, persisted: res && res.persisted !== false };
  });
  ipcMain.handle('auth:logout', () => {
    auth.logout();
    notified.clear();
    poller.refreshNow();
    return auth.status();
  });

  ipcMain.handle('settings:get', () => withRuntime(settings.get()));
  ipcMain.handle('settings:set', (_e, patch) => {
    const next = settings.set(patch || {});
    if (patch && 'openAtLogin' in patch) {
      autolaunch.setEnabled(next.openAtLogin);
      tray.rebuildMenu();
    }
    const payload = withRuntime(next);
    broadcast('settings:update', payload);
    return payload;
  });

  ipcMain.on('window:minimize', () => win && win.minimize());
  // Mini widget'taki gizle dugmesi: ayardan bagimsiz, her zaman tepsiye
  // gizler (mini modda "kapat" degil "gizle" davranisi beklenir).
  ipcMain.on('window:hide', () => win && win.hide());
  ipcMain.on('window:close', () => {
    if (!win) return;
    if (settings.get().minimizeToTray) win.hide();
    else quitApp();
  });
  ipcMain.handle('window:set-mini', (_e, mini) => {
    setMiniMode(!!mini);
    return isMini;
  });

  ipcMain.handle('shell:external', (_e, url) => {
    try {
      const u = new URL(String(url));
      if (u.protocol === 'https:' && ALLOWED_HOSTS.has(u.hostname)) {
        return shell.openExternal(u.toString());
      }
    } catch {
      /* gecersiz URL */
    }
    return false;
  });

  ipcMain.handle('app:info', () => ({
    version: app.getVersion(),
    platform: process.platform,
    encryptionAvailable: require('./secure-store').encryptionAvailable(),
  }));
}

function withRuntime(s) {
  return Object.assign({}, s, { openAtLogin: autolaunch.isEnabled() });
}

function broadcast(channel, payload) {
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
}

/* ----------------------------- bildirim -------------------------------- */

function checkThresholds(snap) {
  if (snap.status !== 'ok') return;
  const thresholds = settings.get().notifyAt;
  if (!thresholds.length || !Notification.isSupported()) return;

  const t = I18N.pick(settings.get().language);

  for (const limit of snap.usage?.limits || []) {
    for (const th of thresholds) {
      const key = `${limit.id}:${th}`;
      if (limit.percent >= th) {
        if (!notified.has(key)) {
          notified.add(key);
          const reset = limit.resetsAt ? formatReset(limit.resetsAt) : null;
          new Notification({
            title: t.notify.title(th),
            body: t.notify.body(I18N.limitLabel(limit, t), Math.round(limit.percent), reset),
            silent: false,
          }).show();
        }
      } else if (limit.percent < th - 5) {
        // Histerezis: %5 altina dusunce tekrar uyarabilir hale gel.
        notified.delete(key);
      }
    }
  }
}

function formatReset(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const locale = I18N.pick(settings.get().language).locale;
  return d.toLocaleString(locale, { hour: '2-digit', minute: '2-digit' });
}

/* ---------------------------- yasam dongusu ---------------------------- */

function quitApp() {
  quitting = true;
  history.flush();
  poller.stop();
  analytics.stop();
  tray.destroy();
  app.quit();
}

app.on('second-instance', () => showWindow());
app.on('window-all-closed', () => {
  // Tray'de yasamaya devam eder; cikis sadece menuden.
  if (!settings.get().minimizeToTray) quitApp();
});
app.on('before-quit', () => {
  quitting = true;
  history.flush();
});

app.whenReady().then(() => {
  app.setAppUserModelId('com.alptug.claude-usage');

  hardenSession();
  registerIpc();

  history.load();
  auth.init();

  createWindow();

  tray.create({
    onShow: showWindow,
    onRefresh: () => poller.refreshNow(),
    onSettings: () => {
      showWindow();
      broadcast('settings:open');
    },
    onQuit: quitApp,
    isAutoLaunchEnabled: () => autolaunch.isEnabled(),
    onToggleAutoLaunch: (v) => {
      settings.set({ openAtLogin: v });
      autolaunch.setEnabled(v);
      broadcast('settings:update', withRuntime(settings.get()));
    },
  });

  poller.on('update', (snap) => {
    tray.update(snap);
    broadcast('usage:update', snap);
    checkThresholds(snap);
  });
  poller.setWindowVisible(!shouldStartHidden());
  poller.start();

  analytics.on('update', (data) => broadcast('analytics:update', data));
  if (settings.get().showAnalytics) analytics.start();
});
