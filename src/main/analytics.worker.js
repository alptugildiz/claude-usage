'use strict';

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { parentPort, workerData } = require('node:worker_threads');
const pricing = require('./pricing');

/**
 * Yerel kullanim analizi.
 *
 * ~/.claude/projects/**\/*.jsonl dosyalarini ARTIMLI okur: dosya basina
 * {size, mtime, offset} tutulur, sadece yeni eklenen baytlar islenir.
 *
 * GIZLILIK: Prompt/mesaj metni parse EDILMEZ ve saklanmaz. Sadece token
 * sayaclari, model adlari, arac adlari ve komut isaretcileri toplanir.
 * Hicbir sey diskten disari cikmaz.
 */

const WINDOW_MS = 7 * 24 * 60 * 60 * 1000; // 7 gun
const DAY_MS = 24 * 60 * 60 * 1000;

const cacheFile = workerData.cacheFile;
const claudeDir = workerData.claudeDir;

/** @type {Record<string, {size:number, mtimeMs:number, offset:number, events:any[]}>} */
let fileCache = {};

function loadCache() {
  try {
    const raw = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
    if (raw && typeof raw === 'object') fileCache = raw;
  } catch {
    fileCache = {};
  }
}

function saveCache() {
  try {
    fs.mkdirSync(path.dirname(cacheFile), { recursive: true });
    fs.writeFileSync(cacheFile, JSON.stringify(fileCache));
  } catch {
    /* cache kritik degil */
  }
}

function projectsDir() {
  return path.join(claudeDir, 'projects');
}

function listJsonl() {
  const root = projectsDir();
  const out = [];
  let dirs;
  try {
    dirs = fs.readdirSync(root, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const d of dirs) {
    if (!d.isDirectory()) continue;
    const sub = path.join(root, d.name);
    let files;
    try {
      files = fs.readdirSync(sub);
    } catch {
      continue;
    }
    for (const f of files) {
      if (f.endsWith('.jsonl')) out.push(path.join(sub, f));
    }
  }
  return out;
}

/* -------------------------- satir -> olay ---------------------------- */

/**
 * Bir JSONL satirindan hafif bir olay uretir.
 * Dondurulen nesne kucuktur; mesaj icerigi tasimaz.
 */
function toEvent(line) {
  let d;
  try {
    d = JSON.parse(line);
  } catch {
    return null;
  }
  if (!d || typeof d !== 'object') return null;

  const ts = Date.parse(d.timestamp);
  if (!Number.isFinite(ts)) return null;

  const msg = d.message;
  const ev = {
    t: ts,
    sid: d.sessionId || d.session_id || null,
    cwd: d.cwd || null,
    side: !!d.isSidechain,
  };

  // Asistan satiri: token sayaclari + model
  if (d.type === 'assistant' && msg && typeof msg === 'object' && msg.usage) {
    const u = msg.usage;
    const cc = u.cache_creation || {};
    ev.k = 'a';
    ev.model = msg.model || null;
    ev.rid = d.requestId || msg.id || null;
    ev.in = num(u.input_tokens);
    ev.out = num(u.output_tokens);
    ev.cr = num(u.cache_read_input_tokens);
    // 1h/5m ayrimi varsa kullan, yoksa hepsini 5m say.
    const c1h = num(cc.ephemeral_1h_input_tokens);
    const c5m = num(cc.ephemeral_5m_input_tokens);
    const ccTotal = num(u.cache_creation_input_tokens);
    if (c1h || c5m) {
      ev.cw1 = c1h;
      ev.cw5 = c5m;
    } else {
      ev.cw1 = 0;
      ev.cw5 = ccTotal;
    }
  }

  // Arac kullanimi: sadece ADLAR (girdi/cikti icerigi degil)
  const blocks = msg && Array.isArray(msg.content) ? msg.content : null;
  if (blocks) {
    const tools = [];
    for (const b of blocks) {
      if (b && b.type === 'tool_use' && typeof b.name === 'string') {
        const entry = { n: b.name };
        // Agent/Skill icin sadece tip adini al
        if (b.name === 'Agent' && b.input && typeof b.input.subagent_type === 'string') {
          entry.s = b.input.subagent_type;
        } else if (b.name === 'Skill' && b.input && typeof b.input.skill === 'string') {
          entry.s = b.input.skill;
        }
        tools.push(entry);
      }
    }
    if (tools.length) {
      ev.tools = tools;
      if (!ev.k) ev.k = 't';
    }
  }

  // Slash komutu isaretcisi (kullanici satirinda)
  if (d.type === 'user' && msg) {
    const text = typeof msg.content === 'string' ? msg.content : null;
    if (text && text.includes('<command-name>')) {
      const m = text.match(/<command-name>([^<]{1,60})<\/command-name>/);
      if (m) {
        ev.cmd = m[1].trim();
        if (!ev.k) ev.k = 'c';
      }
    }
  }

  return ev.k ? ev : null;
}

function num(v) {
  return Number.isFinite(v) ? v : 0;
}

/* --------------------------- tarama ---------------------------------- */

function scanFile(fp) {
  let st;
  try {
    st = fs.statSync(fp);
  } catch {
    delete fileCache[fp];
    return;
  }

  let entry = fileCache[fp];
  // Dosya kuculdu/dondu -> bastan oku.
  if (!entry || st.size < entry.offset) {
    entry = { size: 0, mtimeMs: 0, offset: 0, events: [] };
  }
  if (st.size === entry.offset && st.mtimeMs === entry.mtimeMs) {
    fileCache[fp] = entry;
    return; // degismemis
  }

  let fd;
  try {
    fd = fs.openSync(fp, 'r');
  } catch {
    return;
  }

  try {
    const len = st.size - entry.offset;
    if (len > 0) {
      const buf = Buffer.alloc(len);
      fs.readSync(fd, buf, 0, len, entry.offset);
      let text = buf.toString('utf8');

      // Son satir yarim kalmis olabilir -> onu bir sonraki tura birak.
      let consumed = len;
      const lastNl = text.lastIndexOf('\n');
      if (lastNl === -1) {
        consumed = 0;
        text = '';
      } else {
        consumed = Buffer.byteLength(text.slice(0, lastNl + 1), 'utf8');
        text = text.slice(0, lastNl);
      }

      if (text) {
        for (const line of text.split('\n')) {
          if (!line) continue;
          const ev = toEvent(line);
          if (ev) entry.events.push(ev);
        }
      }
      entry.offset += consumed;
    }
    entry.size = st.size;
    entry.mtimeMs = st.mtimeMs;

    // 7 gunden eski olaylari at.
    const cutoff = Date.now() - WINDOW_MS;
    if (entry.events.length && entry.events[0].t < cutoff) {
      entry.events = entry.events.filter((e) => e.t >= cutoff);
    }
    fileCache[fp] = entry;
  } finally {
    fs.closeSync(fd);
  }
}

/* ------------------------- toplulastirma ------------------------------ */

function aggregate() {
  const now = Date.now();
  const all = [];
  for (const fp of Object.keys(fileCache)) {
    const e = fileCache[fp];
    if (e && Array.isArray(e.events)) all.push(...e.events);
  }
  all.sort((a, b) => a.t - b.t);

  return {
    generatedAt: now,
    day: window(all, now - DAY_MS, now),
    week: window(all, now - WINDOW_MS, now),
    daily: dailySeries(all, now),
  };
}

function window(events, from, to) {
  const seenReq = new Set();
  const sessions = new Set();
  const models = new Map();
  const projects = new Map();
  const skills = new Map();
  const agents = new Map();
  const mcp = new Map();
  const tools = new Map();

  let requests = 0;
  let cost = 0;
  const tok = { input: 0, output: 0, cacheRead: 0, cacheWrite5m: 0, cacheWrite1h: 0 };

  // Davranis bayraklari icin sayaclar
  let bigCacheMiss = 0;
  let longContext = 0;
  let sidechainReq = 0;
  const sessionSpan = new Map(); // sid -> {first, last, side}

  for (const e of events) {
    if (e.t < from || e.t > to) continue;
    if (e.sid) sessions.add(e.sid);

    if (e.sid) {
      const s = sessionSpan.get(e.sid) || { first: e.t, last: e.t, side: 0, total: 0 };
      s.first = Math.min(s.first, e.t);
      s.last = Math.max(s.last, e.t);
      s.total += 1;
      if (e.side) s.side += 1;
      sessionSpan.set(e.sid, s);
    }

    if (e.tools) {
      for (const t of e.tools) {
        bump(tools, t.n);
        if (t.n.startsWith('mcp__')) {
          const server = t.n.split('__')[1];
          if (server) bump(mcp, server);
        } else if (t.n === 'Skill' && t.s) {
          bump(skills, t.s);
        } else if (t.n === 'Agent' && t.s) {
          bump(agents, t.s);
        }
      }
    }
    if (e.cmd) bump(skills, e.cmd.replace(/^\//, ''));

    if (e.k !== 'a') continue;

    // requestId ile tekrarlari ele
    if (e.rid) {
      if (seenReq.has(e.rid)) continue;
      seenReq.add(e.rid);
    }
    requests += 1;
    if (e.side) sidechainReq += 1;

    const t = {
      input: e.in || 0,
      output: e.out || 0,
      cacheRead: e.cr || 0,
      cacheWrite5m: e.cw5 || 0,
      cacheWrite1h: e.cw1 || 0,
    };
    tok.input += t.input;
    tok.output += t.output;
    tok.cacheRead += t.cacheRead;
    tok.cacheWrite5m += t.cacheWrite5m;
    tok.cacheWrite1h += t.cacheWrite1h;

    const c = pricing.costOf(e.model, t);
    cost += c;

    // Dilden bagimsiz sentinel -- renderer prettyModel() bunu I18N'deki
    // "Bilinmeyen model" / "Unknown model" metnine cevirir.
    const mKey = e.model || '__unknown__';
    const m = models.get(mKey) || { tokens: 0, cost: 0, requests: 0 };
    m.tokens += t.input + t.output + t.cacheRead + t.cacheWrite5m + t.cacheWrite1h;
    m.cost += c;
    m.requests += 1;
    models.set(mKey, m);

    if (e.cwd) {
      const pKey = path.basename(e.cwd);
      const p = projects.get(pKey) || { tokens: 0, cost: 0, requests: 0 };
      p.tokens += t.input + t.output + t.cacheRead + t.cacheWrite5m + t.cacheWrite1h;
      p.cost += c;
      p.requests += 1;
      projects.set(pKey, p);
    }

    // Davranis: >100k token cache yazimi (buyuk cache miss)
    if (t.cacheWrite5m + t.cacheWrite1h > 100_000) bigCacheMiss += 1;
    // Davranis: >150k context
    if (t.input + t.cacheRead + t.cacheWrite5m + t.cacheWrite1h > 150_000) longContext += 1;
  }

  // Uzun suren oturumlar (8+ saat)
  let longSessions = 0;
  let subagentHeavy = 0;
  for (const s of sessionSpan.values()) {
    if (s.last - s.first >= 8 * 60 * 60 * 1000) longSessions += 1;
    if (s.total > 0 && s.side / s.total > 0.3) subagentHeavy += 1;
  }

  // Sadece kod + yuzde donuyoruz; metni (dile gore) renderer I18N'den kurar.
  const behaviors = [];
  if (requests > 0) {
    pushBehavior(behaviors, 'cache_miss', bigCacheMiss / requests);
    pushBehavior(behaviors, 'long_context', longContext / requests);
    pushBehavior(behaviors, 'subagent', sidechainReq / requests);
  }
  if (sessions.size > 0) {
    pushBehavior(behaviors, 'subagent_heavy', subagentHeavy / sessions.size);
    pushBehavior(behaviors, 'long_session', longSessions / sessions.size);
  }

  return {
    requests,
    sessions: sessions.size,
    tokens: tok,
    totalTokens:
      tok.input + tok.output + tok.cacheRead + tok.cacheWrite5m + tok.cacheWrite1h,
    cost,
    models: topList(models, 8),
    projects: topList(projects, 8),
    skills: topCounts(skills, 6),
    agents: topCounts(agents, 6),
    mcp: topCounts(mcp, 6),
    tools: topCounts(tools, 8),
    behaviors,
  };
}

function pushBehavior(list, key, ratio) {
  const pct = Math.round(ratio * 100);
  if (pct >= 5) list.push({ key, pct });
}

function bump(map, key) {
  map.set(key, (map.get(key) || 0) + 1);
}

function topList(map, n) {
  return [...map.entries()]
    .map(([name, v]) => ({ name, ...v }))
    .sort((a, b) => b.cost - a.cost || b.tokens - a.tokens)
    .slice(0, n);
}

function topCounts(map, n) {
  const total = [...map.values()].reduce((s, v) => s + v, 0) || 1;
  return [...map.entries()]
    .map(([name, count]) => ({ name, count, pct: Math.round((count / total) * 100) }))
    .sort((a, b) => b.count - a.count)
    .slice(0, n);
}

/** Son 7 gun icin gunluk token/maliyet serisi. */
function dailySeries(events, now) {
  const buckets = new Map();
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now - i * DAY_MS);
    buckets.set(dayKey(d), { day: dayKey(d), tokens: 0, cost: 0, requests: 0 });
  }
  const seen = new Set();
  for (const e of events) {
    if (e.k !== 'a') continue;
    if (e.rid) {
      if (seen.has(e.rid)) continue;
      seen.add(e.rid);
    }
    const key = dayKey(new Date(e.t));
    const b = buckets.get(key);
    if (!b) continue;
    const t = {
      input: e.in || 0,
      output: e.out || 0,
      cacheRead: e.cr || 0,
      cacheWrite5m: e.cw5 || 0,
      cacheWrite1h: e.cw1 || 0,
    };
    b.tokens += t.input + t.output + t.cacheRead + t.cacheWrite5m + t.cacheWrite1h;
    b.cost += pricing.costOf(e.model, t);
    b.requests += 1;
  }
  return [...buckets.values()];
}

function dayKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate()
  ).padStart(2, '0')}`;
}

/* ---------------------------- surus ----------------------------------- */

function run() {
  const files = listJsonl();
  const present = new Set(files);
  for (const fp of Object.keys(fileCache)) {
    if (!present.has(fp)) delete fileCache[fp];
  }
  for (const fp of files) scanFile(fp);
  saveCache();
  return aggregate();
}

loadCache();

parentPort.on('message', (msg) => {
  if (msg && msg.type === 'scan') {
    try {
      parentPort.postMessage({ type: 'result', data: run() });
    } catch (err) {
      parentPort.postMessage({ type: 'error', message: String(err && err.message) });
    }
  }
});

// Baslangicta bir kez tara.
try {
  parentPort.postMessage({ type: 'result', data: run() });
} catch (err) {
  parentPort.postMessage({ type: 'error', message: String(err && err.message) });
}
