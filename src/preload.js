'use strict';

const { contextBridge, ipcRenderer } = require('electron');

/**
 * Dar IPC yuzeyi.
 *
 * Guvenlik: renderer'a SADECE hesaplanmis degerler (yuzde, tarih, isim)
 * gecer. Access token, refresh token veya herhangi bir sir bu kopruden
 * gecmez -- tum ag cagrilari main process'te yapilir.
 */

const listeners = new Map();

function on(channel, cb) {
  const handler = (_e, payload) => cb(payload);
  ipcRenderer.on(channel, handler);
  listeners.set(cb, [channel, handler]);
  return () => {
    ipcRenderer.removeListener(channel, handler);
    listeners.delete(cb);
  };
}

contextBridge.exposeInMainWorld('usage', {
  /* --- veri --- */
  getSnapshot: () => ipcRenderer.invoke('usage:snapshot'),
  refresh: () => ipcRenderer.invoke('usage:refresh'),
  onUpdate: (cb) => on('usage:update', cb),

  getAnalytics: () => ipcRenderer.invoke('analytics:snapshot'),
  onAnalytics: (cb) => on('analytics:update', cb),

  /* --- oturum --- */
  authStatus: () => ipcRenderer.invoke('auth:status'),
  login: () => ipcRenderer.invoke('auth:login'),
  loginManualBegin: () => ipcRenderer.invoke('auth:manual-begin'),
  loginManualComplete: (code) => ipcRenderer.invoke('auth:manual-complete', code),
  logout: () => ipcRenderer.invoke('auth:logout'),

  /* --- ayarlar --- */
  getSettings: () => ipcRenderer.invoke('settings:get'),
  setSettings: (patch) => ipcRenderer.invoke('settings:set', patch),
  onSettings: (cb) => on('settings:update', cb),
  onOpenSettings: (cb) => on('settings:open', cb),

  /* --- pencere --- */
  minimize: () => ipcRenderer.send('window:minimize'),
  close: () => ipcRenderer.send('window:close'),
  hide: () => ipcRenderer.send('window:hide'),
  setMiniMode: (mini) => ipcRenderer.invoke('window:set-mini', mini),
  openExternal: (url) => ipcRenderer.invoke('shell:external', url),

  /* --- meta --- */
  appInfo: () => ipcRenderer.invoke('app:info'),
});
