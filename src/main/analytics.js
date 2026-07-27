'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const { Worker } = require('node:worker_threads');
const { app } = require('electron');

/**
 * analytics.worker.js'i yonetir: dosya degisikliklerini izler, sonuclari
 * yayinlar. Tarama ayri bir thread'de kostugu icin UI donmaz.
 */

const DEBOUNCE_MS = 2000;
const PERIODIC_MS = 5 * 60 * 1000;

function claudeDir() {
  if (process.env.CLAUDE_CONFIG_DIR) return process.env.CLAUDE_CONFIG_DIR;
  return path.join(os.homedir(), '.claude');
}

class Analytics extends EventEmitter {
  constructor() {
    super();
    this.worker = null;
    this.watchers = [];
    this.timer = null;
    this.periodic = null;
    this.data = null;
    this.available = false;
  }

  start() {
    const dir = claudeDir();
    const projects = path.join(dir, 'projects');
    this.available = fs.existsSync(projects);
    if (!this.available) {
      this.emit('update', { available: false, reason: 'no-local-data' });
      return;
    }

    this.worker = new Worker(path.join(__dirname, 'analytics.worker.js'), {
      workerData: {
        claudeDir: dir,
        cacheFile: path.join(app.getPath('userData'), 'analytics-cache.json'),
      },
    });

    this.worker.on('message', (msg) => {
      if (msg.type === 'result') {
        this.data = msg.data;
        this.emit('update', this.snapshot());
      }
    });
    this.worker.on('error', () => {
      this.emit('update', { available: false, reason: 'worker-error' });
    });
    this.worker.unref();

    this.watch(projects);
    this.periodic = setInterval(() => this.scan(), PERIODIC_MS);
    if (this.periodic.unref) this.periodic.unref();
  }

  watch(projects) {
    try {
      const w = fs.watch(projects, { recursive: true }, () => this.schedule());
      w.on('error', () => {
        /* izleme basarisiz -> periyodik tarama devam eder */
      });
      this.watchers.push(w);
    } catch {
      /* recursive watch desteklenmiyorsa periyodik tarama yeter */
    }
  }

  schedule() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      this.scan();
    }, DEBOUNCE_MS);
  }

  scan() {
    if (this.worker) this.worker.postMessage({ type: 'scan' });
  }

  snapshot() {
    if (!this.available) return { available: false, reason: 'no-local-data' };
    if (!this.data) return { available: true, loading: true };
    return { available: true, loading: false, ...this.data };
  }

  stop() {
    if (this.timer) clearTimeout(this.timer);
    if (this.periodic) clearInterval(this.periodic);
    for (const w of this.watchers) {
      try {
        w.close();
      } catch {
        /* yok say */
      }
    }
    this.watchers = [];
    if (this.worker) {
      this.worker.terminate().catch(() => {});
      this.worker = null;
    }
  }
}

module.exports = new Analytics();
