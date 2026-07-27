'use strict';

const { app } = require('electron');

/**
 * Bilgisayar acilisinda calistirma.
 * Windows'ta setLoginItemSettings, HKCU\...\Run anahtarina yazar --
 * yonetici yetkisi gerektirmez, servis kurmaz.
 */

const HIDDEN_FLAG = '--hidden';

function isEnabled() {
  try {
    return app.getLoginItemSettings({ args: [HIDDEN_FLAG] }).openAtLogin;
  } catch {
    return false;
  }
}

function setEnabled(enabled) {
  try {
    app.setLoginItemSettings({
      openAtLogin: !!enabled,
      path: process.execPath,
      args: [HIDDEN_FLAG],
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
