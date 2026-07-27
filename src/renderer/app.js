'use strict';

/* Renderer. Sir bilmez, ag cagrisi yapmaz -- yalnizca main'den gelen
   hesaplanmis degerleri cizer. */

const $ = (sel, root = document) => root.querySelector(sel);
const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
};

const state = {
  usage: null,
  analytics: null,
  settings: null,
  auth: null,
  view: 'dashboard',
  manualPending: false,
  mini: false,
};

/* ------------------------------ biçimleme ------------------------------ */

const nf = new Intl.NumberFormat('tr-TR');

function fmtInt(n) {
  return nf.format(Math.round(n || 0));
}

function fmtTokens(n) {
  n = n || 0;
  if (n >= 1e9) return (n / 1e9).toFixed(1).replace('.', ',') + ' Mr';
  if (n >= 1e6) return (n / 1e6).toFixed(1).replace('.', ',') + ' M';
  if (n >= 1e3) return (n / 1e3).toFixed(1).replace('.', ',') + ' B';
  return fmtInt(n);
}

function fmtMoney(v, currency = 'USD', decimals = 2) {
  try {
    return new Intl.NumberFormat('tr-TR', {
      style: 'currency',
      currency,
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(v || 0);
  } catch {
    return `${(v || 0).toFixed(decimals)} ${currency}`;
  }
}

function fmtClock(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  const time = d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
  if (sameDay) return time;
  const day = d.toLocaleDateString('tr-TR', { weekday: 'short' });
  return `${day} ${time}`;
}

function fmtCountdown(iso, zeroLabel = 'sıfırlanıyor') {
  const ms = Date.parse(iso) - Date.now();
  if (!Number.isFinite(ms)) return '';
  if (ms <= 0) return zeroLabel;
  if (ms < 60000) return `${Math.ceil(ms / 1000)} sn kaldı`;
  const mins = Math.floor(ms / 60000);
  if (mins < 60) return `${mins} dk kaldı`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h < 24) return m ? `${h} sa ${m} dk kaldı` : `${h} sa kaldı`;
  const d = Math.floor(h / 24);
  return `${d} gün ${h % 24} sa kaldı`;
}

function fmtAgo(ts) {
  if (!ts) return '';
  const s = Math.round((Date.now() - ts) / 1000);
  if (s < 10) return 'az önce';
  if (s < 60) return `${s} sn önce`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} dk önce`;
  return `${Math.round(m / 60)} sa önce`;
}

/**
 * Renk seviyesi. API kendi `severity` degerini gonderiyorsa o esastir
 * (/usage komutuyla ayni degerlendirme); yoksa yuzdeye duseriz.
 * %95 ustunde severity ne derse desin kirmizi gosteririz.
 */
function levelVar(pct, severity) {
  if (pct >= 95) return 'var(--danger)';
  if (severity) {
    if (severity === 'critical' || severity === 'error' || severity === 'rejected') {
      return 'var(--danger)';
    }
    if (severity === 'warning') return 'var(--warn)';
    if (severity === 'normal') return 'var(--ok)';
  }
  if (pct >= 80) return 'var(--danger)';
  if (pct >= 50) return 'var(--warn)';
  return 'var(--ok)';
}

/* ------------------------------- ikonlar ------------------------------- */

function icon(paths) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  for (const d of paths) {
    const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    p.setAttribute('d', d);
    svg.appendChild(p);
  }
  return svg;
}

const ICONS = {
  lock: ['M6 11V8a6 6 0 0 1 12 0v3', 'M5 11h14v10H5z'],
  plug: ['M12 22v-5', 'M9 2v6', 'M15 2v6', 'M6 8h12v3a6 6 0 0 1-12 0z'],
  chart: ['M4 20V9', 'M10 20V4', 'M16 20v-7', 'M22 20H2'],
};

/* -------------------------------- halka -------------------------------- */

function ring(pct, level) {
  const wrap = el('div', 'ring');
  wrap.style.setProperty('--lvl', level);
  const R = 32;
  const C = 2 * Math.PI * R;
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 76 76');

  for (const cls of ['track', 'fill']) {
    const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    c.setAttribute('class', cls);
    c.setAttribute('cx', '38');
    c.setAttribute('cy', '38');
    c.setAttribute('r', String(R));
    if (cls === 'fill') {
      c.setAttribute('stroke-dasharray', String(C));
      c.setAttribute('stroke-dashoffset', String(C * (1 - Math.min(1, pct / 100))));
    }
    svg.appendChild(c);
  }
  wrap.appendChild(svg);

  const v = el('div', 'value');
  // Sayi ve % ayni satir kutusunda kalsin diye tek bir ic span'a sarilir --
  // .value'nun TEK cocugu bu olunca disaridan tam ortalanabiliyor. Ikisini
  // dogrudan .value'ya eklemek (eski hali) onlari ayri flex/grid ogesi
  // yapiyor ve % sayinin altina duesuyordu.
  const row = el('span', 'num-row');
  row.append(String(Math.round(pct)));
  row.appendChild(el('small', null, '%'));
  v.appendChild(row);
  wrap.appendChild(v);
  return wrap;
}

function bar(pct, level) {
  const b = el('div', 'bar');
  const i = el('i');
  i.style.width = `${Math.min(100, pct)}%`;
  i.style.background = level;
  b.appendChild(i);
  requestAnimationFrame(() => {
    i.style.width = `${Math.min(100, pct)}%`;
  });
  return b;
}

/* ------------------------------ sparkline ------------------------------ */

function sparkline(series, level) {
  if (!series || series.length < 4) return null;
  const W = 260;
  const H = 26;
  const t0 = series[0].t;
  const t1 = series[series.length - 1].t;
  const span = Math.max(1, t1 - t0);

  // Sabit 0..100 yerine serinin kendi araligini kullan; kucuk degisimler
  // boylece gorunur olur. En az 4 puanlik bir pencere birak ki duz cizgiler
  // ortada kalsin, kenara yapismasin.
  const vals = series.map((p) => p.p);
  let lo = Math.min(...vals);
  let hi = Math.max(...vals);
  if (hi - lo < 4) {
    const mid = (hi + lo) / 2;
    lo = mid - 2;
    hi = mid + 2;
  }
  const range = hi - lo;

  const pts = series.map((p) => [
    ((p.t - t0) / span) * W,
    H - ((p.p - lo) / range) * (H - 4) - 2,
  ]);

  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ');
  const area = `${line} L${W} ${H} L0 ${H} Z`;

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'spark');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.setAttribute('preserveAspectRatio', 'none');
  svg.style.setProperty('--lvl', level);

  const a = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  a.setAttribute('class', 'area');
  a.setAttribute('d', area);
  const l = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  l.setAttribute('class', 'line');
  l.setAttribute('d', line);
  svg.append(a, l);
  return svg;
}

/* ------------------------------ dashboard ------------------------------ */

function renderDashboard() {
  const root = $('#view-dashboard');
  root.textContent = '';
  const snap = state.usage;

  if (!snap || (snap.status === 'loading' && !snap.usage)) {
    for (let i = 0; i < 2; i++) root.appendChild(el('div', 'skeleton'));
    return;
  }

  if (snap.status === 'logged-out') {
    root.appendChild(loginState());
    return;
  }

  if (snap.error && snap.error.kind === 'auth' && !snap.usage) {
    root.appendChild(loginState(snap.error.message));
    return;
  }

  if (!snap.usage && snap.error) {
    root.appendChild(errorState(snap.error.message));
    return;
  }

  // Profil
  if (snap.profile) root.appendChild(profileRow(snap.profile));

  // Bayat veri uyarısı
  if (snap.error) {
    const n = el('div', `notice ${snap.error.kind === 'rate' ? 'warn' : 'error'}`);
    n.append(
      el('span', null, '!'),
      el(
        'span',
        null,
        `${snap.error.message}${
          snap.lastOkAt ? ` — gösterilen veri ${fmtAgo(snap.lastOkAt)}.` : ''
        }`
      )
    );
    n.style.marginBottom = '12px';
    root.appendChild(n);
  }

  const limits = (snap.usage && snap.usage.limits) || [];
  if (!limits.length) {
    root.appendChild(errorState('Bu hesap için gösterilecek limit bulunamadı.'));
    return;
  }

  const style = state.settings?.gaugeStyle || 'ring';
  for (const lim of limits) {
    root.appendChild(limitCard(lim, snap.history?.[lim.id], style));
  }

  if (snap.usage.spend) root.appendChild(spendCard(snap.usage.spend));

  const foot = el('div', 'row between');
  foot.style.marginTop = '12px';
  const updated = el('span', 'faint', `Güncellendi ${fmtAgo(snap.lastOkAt)}`);
  updated.dataset.ago = String(snap.lastOkAt || '');
  const next = el('span', 'faint');
  if (snap.nextPollAt) {
    next.dataset.next = new Date(snap.nextPollAt).toISOString();
    next.textContent = `sonraki kontrol ${fmtCountdown(next.dataset.next, 'şimdi')}`;
  }
  foot.append(updated, next);
  foot.style.fontSize = '11.5px';
  root.appendChild(foot);
}

function profileRow(p) {
  const wrap = el('div', null);
  wrap.id = 'profile';
  const av = el('div', 'avatar', (p.name || '?').trim().charAt(0).toUpperCase());
  const info = el('div');
  const top = el('div', 'row');
  top.style.gap = '8px';
  const name = el('div', null, p.name);
  name.style.fontWeight = '600';
  top.append(name, el('span', 'badge', p.plan));
  info.append(top);
  if (p.email) {
    const sub = el('div', 'faint', p.email);
    sub.style.fontSize = '12px';
    info.append(sub);
  }
  wrap.append(av, info);
  return wrap;
}

function limitCard(lim, hist, style) {
  const card = el('div', 'card');
  if (!lim.isActive && lim.percent === 0) card.classList.add('dim');

  const level = levelVar(lim.percent, lim.severity);
  const body = el('div', `limit${style === 'bar' ? ' bar-style' : ''}`);

  if (style === 'ring') body.appendChild(ring(lim.percent, level));

  const meta = el('div', 'meta');
  const label = el('div', 'label');
  label.append(document.createTextNode(lim.label));

  const d = hist && (hist.delta5m ?? null);
  if (d != null) {
    const badge = el(
      'span',
      `delta ${d > 0 ? 'up' : 'down'}`,
      `${d > 0 ? '+' : ''}${d.toFixed(0)}% · 5dk`
    );
    label.appendChild(badge);
  }
  meta.appendChild(label);

  if (style === 'bar') {
    const line = el('div');
    line.style.margin = '8px 0 6px';
    const nums = el('div', 'row between');
    nums.style.marginBottom = '6px';
    const pctEl = el('span', 'mono', `%${Math.round(lim.percent)}`);
    pctEl.style.fontWeight = '700';
    nums.append(pctEl);
    line.append(nums, bar(lim.percent, level));
    meta.appendChild(line);
  }

  if (lim.resetsAt) {
    const sub = el(
      'div',
      'sub',
      `sıfırlanır ${fmtClock(lim.resetsAt)} · ${fmtCountdown(lim.resetsAt)}`
    );
    sub.dataset.reset = lim.resetsAt;
    meta.appendChild(sub);
  }

  const spark = hist && sparkline(hist.series, level);
  if (spark) meta.appendChild(spark);

  body.appendChild(meta);
  card.appendChild(body);
  return card;
}

function spendCard(s) {
  const card = el('div', 'card');
  if (!s.enabled) card.classList.add('dim');

  const head = el('div', 'row between');
  head.append(
    el('div', 'section-title', 'Ekstra kullanım'),
    el('span', s.enabled ? 'badge neutral' : 'badge neutral', s.enabled ? 'açık' : 'kapalı')
  );
  head.querySelector('.section-title').style.margin = '0';
  card.appendChild(head);

  const row = el('div', 'row between');
  row.style.marginTop = '6px';
  const amount = el('div', 'mono', fmtMoney(s.used, s.currency, s.decimals));
  amount.style.fontSize = '22px';
  amount.style.fontWeight = '700';
  amount.style.letterSpacing = '-0.025em';
  row.appendChild(amount);
  if (s.limit != null) {
    row.appendChild(
      el('span', 'muted', `/ ${fmtMoney(s.limit, s.currency, s.decimals)} aylık`)
    );
  }
  card.appendChild(row);

  if (s.percent != null && s.limit != null) {
    const b = bar(s.percent, levelVar(s.percent));
    b.style.marginTop = '10px';
    card.appendChild(b);
  }

  if (s.limitReached) {
    const n = el('div', 'notice warn');
    n.style.marginTop = '10px';
    n.append(el('span', null, '!'), el('span', null, 'Harcama limitine ulaşıldı.'));
    card.appendChild(n);
  }
  return card;
}

function loginState(message) {
  const s = el('div', 'state');
  const ic = el('div', 'icon');
  ic.appendChild(icon(ICONS.lock));
  s.appendChild(ic);
  s.appendChild(el('div', 'big', 'Claude hesabınla giriş yap'));
  s.appendChild(
    el(
      'div',
      'sub',
      message ||
        'Kullanım limitlerini canlı görebilmek için tarayıcıda Claude hesabına giriş yap. Uygulama kendi oturumunu açar; Claude Code oturumuna dokunmaz.'
    )
  );

  const btn = el('button', 'btn primary', 'Claude ile giriş yap');
  btn.addEventListener('click', async () => {
    btn.disabled = true;
    btn.textContent = 'Tarayıcı açılıyor…';
    try {
      await window.usage.login();
    } catch (err) {
      btn.disabled = false;
      btn.textContent = 'Claude ile giriş yap';
      showInline(s, String(err.message || err));
    }
  });
  s.appendChild(btn);

  const alt = el('button', 'btn ghost small', 'Tarayıcı yönlendirmesi çalışmıyor mu?');
  alt.style.marginTop = '10px';
  alt.style.display = 'block';
  alt.style.marginLeft = 'auto';
  alt.style.marginRight = 'auto';
  alt.addEventListener('click', () => renderManualLogin(s));
  s.appendChild(alt);

  return s;
}

async function renderManualLogin(container) {
  container.textContent = '';
  container.appendChild(el('div', 'big', 'Kodu elle yapıştır'));
  container.appendChild(
    el(
      'div',
      'sub',
      'Tarayıcıda açılan sayfada izin verdikten sonra gösterilen kodu buraya yapıştır.'
    )
  );
  const input = document.createElement('input');
  input.type = 'text';
  input.placeholder = 'kod#state';
  input.style.width = '280px';
  input.style.textAlign = 'center';
  const submit = el('button', 'btn primary', 'Doğrula');
  submit.style.marginLeft = '8px';

  const row = el('div', 'row');
  row.style.justifyContent = 'center';
  row.append(input, submit);
  container.appendChild(row);

  submit.addEventListener('click', async () => {
    submit.disabled = true;
    try {
      await window.usage.loginManualComplete(input.value);
    } catch (err) {
      submit.disabled = false;
      showInline(container, String(err.message || err));
    }
  });

  try {
    await window.usage.loginManualBegin();
  } catch (err) {
    showInline(container, String(err.message || err));
  }
}

function errorState(message) {
  const s = el('div', 'state');
  const ic = el('div', 'icon');
  ic.appendChild(icon(ICONS.plug));
  s.appendChild(ic);
  s.appendChild(el('div', 'big', 'Veri alınamadı'));
  s.appendChild(el('div', 'sub', message));
  const btn = el('button', 'btn', 'Tekrar dene');
  btn.addEventListener('click', () => window.usage.refresh());
  s.appendChild(btn);
  return s;
}

function showInline(container, message) {
  let n = container.querySelector('.notice.error');
  if (!n) {
    n = el('div', 'notice error');
    n.style.marginTop = '12px';
    container.appendChild(n);
  }
  n.textContent = message;
}

/* ------------------------------- analiz -------------------------------- */

function renderAnalytics() {
  const root = $('#view-analytics');
  root.textContent = '';
  const a = state.analytics;

  if (!a || (a.available && a.loading)) {
    for (let i = 0; i < 2; i++) root.appendChild(el('div', 'skeleton'));
    return;
  }

  if (!a.available) {
    const s = el('div', 'state');
    const ic = el('div', 'icon');
    ic.appendChild(icon(ICONS.chart));
    s.appendChild(ic);
    s.appendChild(el('div', 'big', 'Yerel oturum verisi yok'));
    s.appendChild(
      el(
        'div',
        'sub',
        a.reason === 'no-local-data'
          ? 'Bu makinede ~/.claude/projects klasörü bulunamadı. Claude Code ile birkaç oturum açtıktan sonra burada analiz görünecek.'
          : 'Analiz çalıştırılamadı.'
      )
    );
    root.appendChild(s);
    return;
  }

  const note = el('div', 'notice');
  note.append(
    el('span', null, '!'),
    el(
      'span',
      null,
      'Yaklaşık — sadece bu makinedeki oturumlar. claude.ai ve diğer cihazlar dahil değil. Maliyet, API fiyatlarıyla yapılan bir tahmindir.'
    )
  );
  note.style.marginBottom = '12px';
  root.appendChild(note);

  root.appendChild(windowBlock('Son 24 saat', a.day));
  root.appendChild(windowBlock('Son 7 gün', a.week));
  root.appendChild(breakdownSections(a.week));

  if (a.daily && a.daily.length) root.appendChild(dailyCard(a.daily));
}

/** Sadece sayi kutulari (Istek/Token/Tahmini/Cikti) -- her iki pencere icin cagirilir. */
function windowBlock(title, w) {
  const wrap = el('div');
  wrap.style.marginBottom = '18px';
  wrap.appendChild(el('div', 'section-title', title));

  const grid = el('div', 'stat-grid');
  grid.append(
    stat('İstek', fmtInt(w.requests), `${fmtInt(w.sessions)} oturum`),
    stat('Token', fmtTokens(w.totalTokens), `${fmtTokens(w.tokens.cacheRead)} cache okuma`),
    stat('Tahmini', fmtMoney(w.cost), 'API fiyatlarıyla'),
    stat('Çıktı', fmtTokens(w.tokens.output), `${fmtTokens(w.tokens.input)} girdi`)
  );
  wrap.appendChild(grid);
  return wrap;
}

/**
 * Model/proje/skill/davranis kirilimlari -- sadece BIR kez, 7 gunluk
 * (daha temsili) veriyle render edilir. 24 saatlik pencerede ayrica
 * gostermek neredeyse hep ayni listeleri tekrarliyordu.
 */
function breakdownSections(w) {
  const wrap = el('div');

  if (w.models.length) {
    const c = el('div', 'card');
    c.appendChild(el('div', 'section-title', 'Model dağılımı'));
    c.appendChild(barList(w.models.map((m) => ({ name: prettyModel(m.name), value: m.cost, note: fmtMoney(m.cost) }))));
    wrap.appendChild(c);
  }

  if (w.projects.length) {
    const c = el('div', 'card');
    c.appendChild(el('div', 'section-title', 'Projeler'));
    c.appendChild(
      barList(
        w.projects.map((p) => ({ name: p.name, value: p.tokens, note: fmtTokens(p.tokens) }))
      )
    );
    wrap.appendChild(c);
  }

  const chipGroups = [
    ['Skill / komut', w.skills],
    ['Subagent', w.agents],
    ['MCP sunucu', w.mcp],
    ['Araç', w.tools],
  ].filter(([, list]) => list && list.length);

  if (chipGroups.length) {
    const c = el('div', 'card');
    for (const [name, list] of chipGroups) {
      c.appendChild(el('div', 'section-title', name));
      const chips = el('div', 'chips');
      chips.style.marginBottom = '12px';
      for (const it of list) {
        const chip = el('span', 'chip', it.name);
        chip.appendChild(el('b', null, `${it.pct}%`));
        chips.appendChild(chip);
      }
      c.appendChild(chips);
    }
    c.lastChild.style.marginBottom = '0';
    wrap.appendChild(c);
  }

  if (w.behaviors && w.behaviors.length) {
    const c = el('div', 'card');
    c.appendChild(el('div', 'section-title', 'Limitini ne yiyor? (7 gün)'));
    const list = el('div', 'blist');
    for (const b of w.behaviors) {
      list.appendChild(barItem(`%${b.pct} ${b.label}`, b.pct, 100, ''));
    }
    c.appendChild(list);
    wrap.appendChild(c);
  }

  return wrap;
}

/** claude-opus-4-8 -> "Opus 4.8" · claude-haiku-4-5-20251001 -> "Haiku 4.5" */
function prettyModel(id) {
  return String(id)
    .replace(/^claude-/, '')
    .replace(/-\d{8}$/, '')
    // Surum parcalarini nokta ile birlestir: opus-4-8 -> opus 4.8
    .replace(/-(\d+)(?:-(\d+))?$/, (_, a, b) => ` ${a}${b ? `.${b}` : ''}`)
    .replace(/-/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function stat(k, v, n) {
  const s = el('div', 'stat');
  s.append(el('div', 'k', k), el('div', 'v', v));
  if (n) s.append(el('div', 'n', n));
  return s;
}

function barList(items) {
  const max = Math.max(...items.map((i) => i.value), 1);
  const list = el('div', 'blist');
  for (const it of items) list.appendChild(barItem(it.name, it.value, max, it.note));
  return list;
}

function barItem(name, value, max, note) {
  const item = el('div', 'item');
  const top = el('div', 'top');
  top.append(el('span', 'name', name), el('span', 'amt', note || ''));
  const track = el('div', 'track');
  const fill = el('i');
  fill.style.width = `${Math.max(2, (value / max) * 100)}%`;
  track.appendChild(fill);
  item.append(top, track);
  return item;
}

function dailyCard(daily) {
  const c = el('div', 'card');
  c.appendChild(el('div', 'section-title', 'Günlük token'));
  const max = Math.max(...daily.map((d) => d.tokens), 1);
  const bars = el('div', 'bars');
  for (const d of daily) {
    const col = el('div', 'col');
    const fill = el('div', 'fill');
    fill.style.height = `${Math.max(3, (d.tokens / max) * 70)}px`;
    fill.title = `${d.day}: ${fmtTokens(d.tokens)} token · ${fmtMoney(d.cost)}`;
    const lbl = el('div', 'lbl', d.day.slice(5).replace('-', '/'));
    col.append(fill, lbl);
    bars.appendChild(col);
  }
  c.appendChild(bars);
  return c;
}

/* ------------------------------- ayarlar ------------------------------- */

function renderSettings() {
  const root = $('#view-settings');
  root.textContent = '';
  const s = state.settings;
  if (!s) return;

  /* --- görünüm --- */
  const look = el('div', 'card');
  look.appendChild(el('div', 'section-title', 'Tema'));
  const themes = el('div', 'themes');
  for (const t of THEMES) {
    const b = el('button', 'theme-opt');
    b.setAttribute('aria-pressed', String(s.theme === t.id));
    const sw = el('div', 'swatch');
    for (const c of t.colors) {
      const i = el('i');
      i.style.background = c;
      sw.appendChild(i);
    }
    b.append(sw, document.createTextNode(t.name));
    b.addEventListener('click', () => save({ theme: t.id }));
    themes.appendChild(b);
  }
  look.appendChild(themes);

  look.appendChild(settingRow(
    'Vurgu rengi',
    'Temanın kendi rengi yerine kendi rengini kullan.',
    (() => {
      const wrap = el('div', 'row');
      const color = document.createElement('input');
      color.type = 'color';
      color.value = s.accent || currentAccentHex();
      color.addEventListener('change', () => save({ accent: color.value }));
      const reset = el('button', 'btn ghost small', 'Sıfırla');
      reset.addEventListener('click', () => save({ accent: null }));
      wrap.append(color, reset);
      return wrap;
    })()
  ));

  look.appendChild(rangeRow('Köşe yuvarlaklığı', 'Kart köşelerinin yumuşaklığı.', 'radius', s.radius, 0, 24, 1, (v) => `${v}px`));
  look.appendChild(rangeRow('Saydamlık', 'Pencerenin arka planı ne kadar geçirgen olsun.', 'opacity', s.opacity, 40, 100, 1, (v) => `%${v}`));
  look.appendChild(selectRow('Gösterim', 'Yüzdeler halka mı bar mı olsun.', 'gaugeStyle', s.gaugeStyle, [
    ['ring', 'Halka'],
    ['bar', 'Bar'],
  ]));
  look.appendChild(toggleRow('Monospace yazı tipi', 'Tüm arayüzde eşit genişlikli yazı tipi kullan.', 'mono', s.mono));
  look.appendChild(toggleRow('Animasyonlar', 'Geçiş ve hareket efektleri.', 'animations', s.animations));
  look.appendChild(toggleRow('Kompakt mod', 'Daha küçük pencere ve sıkı yerleşim.', 'compact', s.compact));
  root.appendChild(look);

  /* --- davranış --- */
  const behave = el('div', 'card');
  behave.appendChild(el('div', 'section-title', 'Davranış'));
  behave.appendChild(toggleRow('Bilgisayar açılınca başlat', 'Windows açılışında sessizce tepside başlar.', 'openAtLogin', s.openAtLogin));
  behave.appendChild(toggleRow('Açılışta gizli başla', 'Uygulama açıldığında pencere gösterilmez.', 'startHidden', s.startHidden));
  behave.appendChild(toggleRow('Kapatınca tepsiye gizle', 'X tuşu uygulamayı kapatmaz, tepsiye indirir.', 'minimizeToTray', s.minimizeToTray));
  behave.appendChild(toggleRow('Yerel analiz', 'Bu makinedeki oturum dosyalarını okuyup analiz sekmesini doldurur.', 'showAnalytics', s.showAnalytics));
  behave.appendChild(settingRow(
    'Eşik uyarıları',
    'Bu yüzdelere ulaşınca masaüstü bildirimi gönderir.',
    (() => {
      const wrap = el('div', 'row');
      for (const th of [70, 80, 90, 95]) {
        const b = el('button', 'btn small', `%${th}`);
        const on = (s.notifyAt || []).includes(th);
        b.setAttribute('aria-pressed', String(on));
        if (on) {
          b.style.borderColor = 'var(--accent)';
          b.style.color = 'var(--accent)';
        }
        b.addEventListener('click', () => {
          const set = new Set(s.notifyAt || []);
          if (set.has(th)) set.delete(th);
          else set.add(th);
          save({ notifyAt: [...set].sort((a, b2) => a - b2) });
        });
        wrap.appendChild(b);
      }
      return wrap;
    })()
  ));
  root.appendChild(behave);

  /* --- hesap --- */
  const acct = el('div', 'card');
  acct.appendChild(el('div', 'section-title', 'Hesap ve güvenlik'));

  const st = state.auth || {};
  acct.appendChild(settingRow(
    'Oturum',
    st.loggedIn
      ? 'Uygulamanın kendi OAuth oturumu açık. Claude Code oturumundan bağımsızdır.'
      : 'Giriş yapılmadı.',
    (() => {
      if (!st.loggedIn) {
        const b = el('button', 'btn primary small', 'Giriş yap');
        b.addEventListener('click', () => window.usage.login().catch(() => {}));
        return b;
      }
      const b = el('button', 'btn small', 'Çıkış yap');
      b.addEventListener('click', async () => {
        state.auth = await window.usage.logout();
        renderSettings();
      });
      return b;
    })()
  ));

  const encNote = el('div', 'notice');
  encNote.style.marginTop = '10px';
  encNote.append(
    el('span', null, st.persisted ? '✓' : '!'),
    el(
      'span',
      null,
      st.persisted
        ? 'Erişim anahtarı Windows DPAPI ile şifrelenerek saklanıyor. Düz metin olarak diske hiç yazılmaz.'
        : 'İşletim sistemi şifreleme sağlamıyor — anahtar yalnızca bellekte tutuluyor, uygulamayı kapatınca tekrar giriş gerekecek.'
    )
  );
  if (!st.persisted) encNote.classList.add('warn');
  acct.appendChild(encNote);
  root.appendChild(acct);

  /* --- hakkında --- */
  const about = el('div', 'card flat');
  const line = el('div', 'row between');
  line.append(
    el('span', 'faint', `Claude Usage v${state.appInfo?.version || '1.0.0'}`),
    el('span', 'faint', 'veri: api.anthropic.com/api/oauth/usage')
  );
  line.style.fontSize = '11.5px';
  about.appendChild(line);
  root.appendChild(about);
}

function settingRow(title, desc, control) {
  const row = el('div', 'setting');
  const info = el('div', 'info');
  info.append(el('div', 't', title), el('div', 'd', desc));
  const ctl = el('div', 'ctl');
  ctl.appendChild(control);
  row.append(info, ctl);
  return row;
}

function toggleRow(title, desc, key, value) {
  const label = el('label', 'switch');
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.checked = !!value;
  input.addEventListener('change', () => save({ [key]: input.checked }));
  label.append(input, el('span'));
  return settingRow(title, desc, label);
}

function rangeRow(title, desc, key, value, min, max, step, fmt) {
  const wrap = el('div', 'row');
  const input = document.createElement('input');
  input.type = 'range';
  input.min = String(min);
  input.max = String(max);
  input.step = String(step);
  input.value = String(value);
  const out = el('span', 'mono faint', fmt(value));
  out.style.minWidth = '42px';
  input.addEventListener('input', () => {
    out.textContent = fmt(input.value);
    applyLive({ [key]: Number(input.value) });
  });
  input.addEventListener('change', () => save({ [key]: Number(input.value) }));
  wrap.append(input, out);
  return settingRow(title, desc, wrap);
}

function selectRow(title, desc, key, value, options) {
  const sel = document.createElement('select');
  for (const [v, label] of options) {
    const o = document.createElement('option');
    o.value = v;
    o.textContent = label;
    if (v === value) o.selected = true;
    sel.appendChild(o);
  }
  sel.addEventListener('change', () => save({ [key]: sel.value }));
  return settingRow(title, desc, sel);
}

/* ------------------------------ tema uygula ---------------------------- */

const THEMES = [
  { id: 'claude', name: 'Claude', colors: ['#1a1714', '#c96442', '#ece6dc'] },
  { id: 'claude-light', name: 'Claude Açık', colors: ['#f7f4ee', '#b4522f', '#2b2620'] },
  { id: 'midnight', name: 'Midnight', colors: ['#0e1020', '#7c8cf8', '#e4e7f7'] },
  { id: 'terminal', name: 'Terminal', colors: ['#060806', '#3ff23f', '#b9f5b9'] },
  { id: 'minimal', name: 'Minimal', colors: ['#141414', '#ededed', '#9a9a9a'] },
];

function applyTheme(s) {
  const r = document.documentElement;
  r.dataset.theme = s.theme;
  r.dataset.mono = s.mono ? 'on' : 'off';
  r.dataset.animations = s.animations ? 'on' : 'off';
  r.style.setProperty('--radius', `${s.radius}px`);

  // Saydamlik SADECE #shell'in arka plan renginin alfa kanaline uygulanir
  // (butun agaca degil) -- yazi/buton her zaman tam opak kalir, Chromium'un
  // saydam pencerelerde tum-agac opacity'siyle yasadigi hayalet metin /
  // kaybolan buton hatasina hic girilmez.
  const themeBg = (THEMES.find((t) => t.id === s.theme) || THEMES[0]).colors[0];
  r.style.setProperty('--bg-alpha', hexToRgba(themeBg, s.opacity / 100));

  if (s.accent) {
    r.style.setProperty('--accent', s.accent);
    r.style.setProperty('--accent-soft', hexToSoft(s.accent));
  } else {
    r.style.removeProperty('--accent');
    r.style.removeProperty('--accent-soft');
  }
}

function applyLive(patch) {
  applyTheme(Object.assign({}, state.settings, patch));
}

function hexToRgba(hex, alpha) {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return `rgba(20,20,20,${alpha})`;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

function hexToSoft(hex) {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return 'rgba(128,128,128,0.15)';
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, 0.16)`;
}

function currentAccentHex() {
  const v = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();
  return /^#[0-9a-f]{6}$/i.test(v) ? v : '#c96442';
}

async function save(patch) {
  applyLive(patch);
  state.settings = await window.usage.setSettings(patch);
  applyTheme(state.settings);
  renderSettings();
  if (state.view === 'dashboard') renderDashboard();
}

/* ------------------------------ mini widget ----------------------------- */

function miniRow(label, lim) {
  const level = levelVar(lim.percent, lim.severity);
  const row = el('div', 'mini-row');
  row.appendChild(el('span', 'mini-label', label));

  const barWrap = el('div', 'mini-bar');
  const fill = el('i');
  fill.style.width = `${Math.min(100, lim.percent)}%`;
  fill.style.background = level;
  barWrap.appendChild(fill);
  row.appendChild(barWrap);

  const pct = el('span', 'mini-pct', `%${Math.round(lim.percent)}`);
  pct.style.color = level;
  row.appendChild(pct);
  return row;
}

function renderMini() {
  const root = $('#mini-rows');
  if (!root) return;
  root.textContent = '';

  const snap = state.usage;
  const limits = (snap && snap.usage && snap.usage.limits) || [];

  if (!limits.length) {
    let msg = 'Veri yok';
    if (!snap || snap.status === 'loading') msg = 'Yükleniyor…';
    else if (snap.status === 'logged-out') msg = 'Giriş yapılmadı';
    root.appendChild(el('div', 'mini-empty', msg));
    return;
  }

  const session = limits.find((l) => l.group === 'session') || limits[0];
  const weekly = limits.find((l) => l.group === 'weekly') || limits[1];
  if (session) root.appendChild(miniRow('5 saat', session));
  if (weekly) root.appendChild(miniRow('Hafta', weekly));
}

async function setMiniMode(mini) {
  state.mini = mini;
  document.body.dataset.mode = mini ? 'mini' : 'full';
  if (mini) renderMini();
  try {
    await window.usage.setMiniMode(mini);
  } catch {
    /* pencere durumu degismese de arayuz gecisi kalir */
  }
}

/* -------------------------------- kabuk -------------------------------- */

function switchView(name) {
  state.view = name;
  for (const tab of document.querySelectorAll('.tab')) {
    tab.setAttribute('aria-selected', String(tab.dataset.view === name));
  }
  for (const v of document.querySelectorAll('.view')) {
    v.classList.toggle('active', v.id === `view-${name}`);
  }
  if (name === 'analytics') renderAnalytics();
  if (name === 'settings') renderSettings();
  if (name === 'dashboard') renderDashboard();
}

function wireShell() {
  $('#btn-min').addEventListener('click', () => window.usage.minimize());
  $('#btn-close').addEventListener('click', () => window.usage.close());
  $('#btn-mini').addEventListener('click', () => setMiniMode(true));
  $('#btn-expand').addEventListener('click', () => setMiniMode(false));
  $('#btn-mini-hide').addEventListener('click', () => window.usage.hide());
  $('#btn-refresh').addEventListener('click', async (e) => {
    const b = e.currentTarget;
    b.style.transform = 'rotate(360deg)';
    b.style.transition = 'transform 500ms ease';
    setTimeout(() => {
      b.style.transition = '';
      b.style.transform = '';
    }, 520);
    await window.usage.refresh();
  });
  for (const tab of document.querySelectorAll('.tab')) {
    tab.addEventListener('click', () => switchView(tab.dataset.view));
  }
}

/** Geri sayımları her saniye yerel olarak tazele (ekstra istek yok). */
function tickCountdowns() {
  for (const node of document.querySelectorAll('[data-reset]')) {
    const iso = node.dataset.reset;
    node.textContent = `sıfırlanır ${fmtClock(iso)} · ${fmtCountdown(iso)}`;
  }
  for (const node of document.querySelectorAll('[data-next]')) {
    node.textContent = `sonraki kontrol ${fmtCountdown(node.dataset.next, 'şimdi')}`;
  }
  for (const node of document.querySelectorAll('[data-ago]')) {
    const ts = Number(node.dataset.ago);
    if (ts) node.textContent = `Güncellendi ${fmtAgo(ts)}`;
  }
}

async function init() {
  wireShell();

  state.settings = await window.usage.getSettings();
  applyTheme(state.settings);

  state.appInfo = await window.usage.appInfo();
  state.auth = await window.usage.authStatus();
  state.usage = await window.usage.getSnapshot();
  state.analytics = await window.usage.getAnalytics();

  renderDashboard();

  window.usage.onUpdate(async (snap) => {
    state.usage = snap;
    const wasLoggedOut = state.auth && !state.auth.loggedIn;
    if (wasLoggedOut !== (snap.status === 'logged-out')) {
      state.auth = await window.usage.authStatus();
      if (state.view === 'settings') renderSettings();
    }
    if (state.mini) renderMini();
    else if (state.view === 'dashboard') renderDashboard();
  });

  window.usage.onAnalytics((data) => {
    state.analytics = data;
    if (state.view === 'analytics') renderAnalytics();
  });

  window.usage.onSettings((s) => {
    state.settings = s;
    applyTheme(s);
    if (state.view === 'settings') renderSettings();
  });

  window.usage.onOpenSettings(() => switchView('settings'));

  setInterval(tickCountdowns, 1000);
}

init();
