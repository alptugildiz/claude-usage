'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { app } = require('electron');
const { HISTORY } = require('./config');

/**
 * Son 24 saatlik yuzde gecmisi (sparkline ve "son 5 dk'da +%3" rozeti icin).
 * Sadece sayilar tutulur; sir icermez, disariya gonderilmez.
 */

let points = []; // { t: epochMs, v: { [limitId]: percent } }
let dirty = false;
let flushTimer = null;

function filePath() {
  return path.join(app.getPath('userData'), 'history.json');
}

function load() {
  try {
    const raw = JSON.parse(fs.readFileSync(filePath(), 'utf8'));
    if (Array.isArray(raw)) points = raw.filter((p) => p && Number.isFinite(p.t));
  } catch {
    points = [];
  }
  prune();
}

function prune() {
  const cutoff = Date.now() - HISTORY.MAX_AGE_MS;
  points = points.filter((p) => p.t >= cutoff);
  if (points.length > HISTORY.MAX_POINTS) {
    points = points.slice(points.length - HISTORY.MAX_POINTS);
  }
}

/** @param {Array<{id:string, percent:number}>} limits */
function record(limits) {
  if (!Array.isArray(limits) || limits.length === 0) return;
  const v = {};
  for (const l of limits) v[l.id] = l.percent;

  const last = points[points.length - 1];
  // Ayni degerler 60 sn icinde tekrar geldiyse yeni nokta ekleme.
  if (last && Date.now() - last.t < 55_000 && sameValues(last.v, v)) return;

  points.push({ t: Date.now(), v });
  prune();
  scheduleFlush();
}

function sameValues(a, b) {
  const ka = Object.keys(a);
  if (ka.length !== Object.keys(b).length) return false;
  return ka.every((k) => a[k] === b[k]);
}

function scheduleFlush() {
  dirty = true;
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    flush();
  }, 10_000);
}

function flush() {
  if (!dirty) return;
  dirty = false;
  try {
    fs.writeFileSync(filePath(), JSON.stringify(points));
  } catch {
    /* gecmis kritik degil, sessizce gec */
  }
}

/**
 * Bir limit icin sparkline serisi.
 * @returns {Array<{t:number, p:number}>}
 */
function seriesFor(limitId) {
  return points
    .filter((p) => p.v && Number.isFinite(p.v[limitId]))
    .map((p) => ({ t: p.t, p: p.v[limitId] }));
}

/** windowMs once ile simdi arasindaki yuzde farki (yoksa null). */
function deltaFor(limitId, windowMs) {
  const cutoff = Date.now() - windowMs;
  const s = seriesFor(limitId);
  if (s.length < 2) return null;
  const now = s[s.length - 1];
  // cutoff'a en yakin, ondan onceki nokta
  let base = null;
  for (const pt of s) {
    if (pt.t <= cutoff) base = pt;
    else break;
  }
  if (!base) base = s[0];
  if (now.t - base.t < windowMs * 0.3) return null; // yeterli gecmis yok
  const d = now.p - base.p;
  return Math.abs(d) < 0.5 ? null : d;
}

/** Renderer'a gonderilecek ozet: her limit icin seri + delta. */
function snapshotFor(limits) {
  const out = {};
  for (const l of limits) {
    out[l.id] = {
      series: seriesFor(l.id),
      delta5m: deltaFor(l.id, 5 * 60 * 1000),
      delta1h: deltaFor(l.id, 60 * 60 * 1000),
    };
  }
  return out;
}

module.exports = { load, record, flush, seriesFor, deltaFor, snapshotFor };
