'use strict';

const { API } = require('./config');
const net = require('./net');
const auth = require('./auth');

/**
 * Anthropic OAuth API istemcisi.
 * Bu modul token'i sadece Authorization basliginda kullanir; disariya sizdirmaz.
 */

async function call(pathname, { force = false } = {}) {
  const token = await auth.getAccessToken({ force });
  return net.request(API.BASE + pathname, {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'anthropic-beta': API.BETA_HEADER,
      'User-Agent': API.USER_AGENT,
    },
    timeoutMs: API.TIMEOUT_MS,
  });
}

/** 401 gelirse token'i bir kez zorla yenileyip tekrar dener. */
async function callWithRetry(pathname) {
  try {
    return await call(pathname);
  } catch (err) {
    if (err instanceof net.HttpError && err.status === 401) {
      return call(pathname, { force: true });
    }
    throw err;
  }
}

async function getUsage() {
  const res = await callWithRetry(API.USAGE);
  return res.data;
}

async function getProfile() {
  const res = await callWithRetry(API.PROFILE);
  return res.data;
}

/* --------------------------------------------------------------------------
 * Normalizasyon
 *
 * `limits[]` dizisi ileriye donuk kaynaktir: Anthropic yeni bir limit tipi
 * ekledigimde UI kod degismeden gosterebilsin diye generic isleriz.
 * Ust seviye five_hour / seven_day alanlari eski aynadir, fallback'tir.
 * ------------------------------------------------------------------------ */

const KIND_LABELS = {
  session: '5 saatlik oturum',
  five_hour: '5 saatlik oturum',
  weekly_all: 'Haftalik · tüm modeller',
  seven_day: 'Haftalik · tüm modeller',
  weekly_scoped: 'Haftalik',
  opus: 'Haftalik · Opus',
  sonnet: 'Haftalik · Sonnet',
};

function labelFor(entry) {
  if (entry.scope && entry.scope.model && entry.scope.model.display_name) {
    return `Haftalik · ${entry.scope.model.display_name}`;
  }
  if (entry.scope && entry.scope.surface && entry.scope.surface.display_name) {
    return `Haftalik · ${entry.scope.surface.display_name}`;
  }
  return KIND_LABELS[entry.kind] || humanize(entry.kind);
}

function humanize(kind) {
  if (!kind) return 'Limit';
  return String(kind).replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
}

/** Ust seviye alan adindan (five_hour, seven_day_opus...) etiket uretir. */
const LEGACY_LABELS = {
  five_hour: '5 saatlik oturum',
  seven_day: 'Haftalik · tüm modeller',
  seven_day_opus: 'Haftalik · Opus',
  seven_day_sonnet: 'Haftalik · Sonnet',
  seven_day_oauth_apps: 'Haftalik · OAuth uygulamalari',
  seven_day_cowork: 'Haftalik · Cowork',
};

/**
 * Ham /api/oauth/usage cevabini UI'in dogrudan cizebilecegi hale getirir.
 * Sadece sayilar ve etiketler doner -- hicbir sir icermez.
 */
function normalizeUsage(raw) {
  if (!raw || typeof raw !== 'object') return { limits: [], spend: null, raw: null };

  const limits = [];
  const seen = new Set();

  if (Array.isArray(raw.limits)) {
    for (const entry of raw.limits) {
      if (!entry || typeof entry.percent !== 'number') continue;
      const id = `${entry.kind}:${entry.scope?.model?.display_name || entry.group || ''}`;
      seen.add(id);
      limits.push({
        id,
        kind: entry.kind,
        group: entry.group || entry.kind,
        label: labelFor(entry),
        percent: clampPct(entry.percent),
        severity: entry.severity || null,
        resetsAt: entry.resets_at || null,
        isActive: entry.is_active !== false,
      });
    }
  }

  // limits[] bos ya da eksikse eski alanlardan tamamla.
  if (limits.length === 0) {
    for (const [key, label] of Object.entries(LEGACY_LABELS)) {
      const w = raw[key];
      if (!w || typeof w.utilization !== 'number') continue;
      limits.push({
        id: key,
        kind: key,
        group: key === 'five_hour' ? 'session' : 'weekly',
        label,
        percent: clampPct(w.utilization),
        severity: null,
        resetsAt: w.resets_at || null,
        isActive: key === 'five_hour',
      });
    }
  }

  // Oturum limitleri once, sonra haftaliklar; icinde yuzdeye gore azalan.
  limits.sort((a, b) => {
    const ga = a.group === 'session' ? 0 : 1;
    const gb = b.group === 'session' ? 0 : 1;
    if (ga !== gb) return ga - gb;
    return b.percent - a.percent;
  });

  return {
    limits,
    spend: normalizeSpend(raw),
    fetchedAt: Date.now(),
  };
}

function clampPct(n) {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, n));
}

function normalizeSpend(raw) {
  const extra = raw.extra_usage;
  const spend = raw.spend;
  if (!extra && !spend) return null;

  const used = spend && spend.used ? minorToMajor(spend.used) : Number(extra?.used_credits ?? 0);
  const currency = spend?.used?.currency || extra?.currency || 'USD';
  const limit =
    spend && spend.limit ? minorToMajor(spend.limit) : numOrNull(extra?.monthly_limit);

  return {
    enabled: extra ? extra.is_enabled !== false : spend?.enabled !== false,
    used,
    limit,
    currency,
    decimals: Number.isFinite(extra?.decimal_places) ? extra.decimal_places : 2,
    percent: Number.isFinite(spend?.percent) ? clampPct(spend.percent) : null,
    limitReached: !!extra?.spend_limit_reached,
    disabledReason: extra?.disabled_reason || spend?.disabled_reason || null,
    canPurchase: !!spend?.can_purchase_credits,
  };
}

function minorToMajor(m) {
  if (!m || !Number.isFinite(m.amount_minor)) return 0;
  const exp = Number.isFinite(m.exponent) ? m.exponent : 2;
  return m.amount_minor / Math.pow(10, exp);
}

function numOrNull(v) {
  return Number.isFinite(v) ? v : null;
}

/** Profil cevabindan sadece gosterilecek alanlari alir. */
function normalizeProfile(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const a = raw.account || {};
  const o = raw.organization || {};
  let plan = 'Free';
  if (a.has_claude_max) plan = 'Max';
  else if (a.has_claude_pro) plan = 'Pro';
  if (o.organization_type === 'claude_team') plan = 'Team';
  if (o.organization_type === 'claude_enterprise') plan = 'Enterprise';

  return {
    name: a.display_name || a.full_name || a.email || 'Claude',
    email: a.email || null,
    plan,
    orgName: o.name || null,
    extraUsageEnabled: !!o.has_extra_usage_enabled,
    subscriptionStatus: o.subscription_status || null,
  };
}

module.exports = { getUsage, getProfile, normalizeUsage, normalizeProfile };
