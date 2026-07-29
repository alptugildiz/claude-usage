'use strict';

const { app } = require('electron');

/**
 * Bilgisayar acilisinda calistirma.
 * Windows'ta setLoginItemSettings, HKCU\...\Run anahtarina yazar --
 * yonetici yetkisi gerektirmez, servis kurmaz.
 */

const HIDDEN_FLAG = '--hidden';

/**
 * Paketlenmemis (dev) modda process.execPath dogrudan electron.exe'yi
 * gosterir; bu durumda Electron'a hangi uygulamayi calistiracagini
 * soylemek icin app path'i de ilk argument olarak vermek gerekir,
 * yoksa Windows acilisinda electron.exe "path-to-app surukle" ekranini
 * acar. Paketli (kurulmus) surumde bu gerekmez, execPath zaten dogru .exe.
 */
function loginArgs() {
  return app.isPackaged ? [HIDDEN_FLAG] : [app.getAppPath(), HIDDEN_FLAG];
}

function isEnabled() {
  try {
    return app.getLoginItemSettings({ args: loginArgs() }).openAtLogin;
  } catch {
    return false;
  }
}

function setEnabled(enabled) {
  try {
    app.setLoginItemSettings({
      openAtLogin: !!enabled,
      path: process.execPath,
      args: loginArgs(),
    });
  } catch {
    /* desteklenmiyorsa sessizce gec */
  }
  return isEnabled();
}

/** Uygulama gizli mi baslatildi (otomatik acilis veya ayar geregi)? */
function launchedHidden() {
  return process.argv.includes(HIDDEN_FLAG);
}

module.exports = { isEnabled, setEnabled, launchedHidden, HIDDEN_FLAG };
