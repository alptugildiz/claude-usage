'use strict';

/**
 * Ceviri sozlugu. Iki bicimde de yuklenebilir:
 *  - main process'te CommonJS modulu olarak: require('../i18n')
 *  - renderer'da duz <script src="i18n.js"> ile: global `I18N` degiskeni
 *
 * Boylece tek bir dosya hem main hem renderer tarafindan okunur, tekrar
 * yazma gerekmez. Parametreli metinler fonksiyon olarak tanimlanir.
 */

const I18N = {
  tr: {
    locale: 'tr-TR',
    tokenUnits: { k: 'B', m: 'M', b: 'Mr' },
    decimalSep: ',',
    pctPrefix: true, // %84

    tabs: { dashboard: 'Limitler', analytics: 'Analiz', settings: 'Ayarlar' },

    titlebar: {
      refresh: 'Yenile',
      mini: 'Küçük görünüm',
      minimize: 'Küçült',
      close: 'Kapat',
    },

    mini: {
      hide: 'Gizle',
      expand: 'Genişlet',
      session: '5 saat',
      week: 'Hafta',
      loading: 'Yükleniyor…',
      loggedOut: 'Giriş yapılmadı',
      noData: 'Veri yok',
    },

    login: {
      title: 'Claude hesabınla giriş yap',
      sub: 'Kullanım limitlerini canlı görebilmek için tarayıcıda Claude hesabına giriş yap. Uygulama kendi oturumunu açar; Claude Code oturumuna dokunmaz.',
      button: 'Claude ile giriş yap',
      opening: 'Tarayıcı açılıyor…',
      altButton: 'Tarayıcı yönlendirmesi çalışmıyor mu?',
    },

    manual: {
      title: 'Kodu elle yapıştır',
      sub: 'Tarayıcıda açılan sayfada izin verdikten sonra gösterilen kodu buraya yapıştır.',
      placeholder: 'kod#state',
      verify: 'Doğrula',
      notStarted: 'Önce giriş akışını başlat',
    },

    dash: {
      errorTitle: 'Veri alınamadı',
      retry: 'Tekrar dene',
      noLimits: 'Bu hesap için gösterilecek limit bulunamadı.',
      stale: (ago) => ` — gösterilen veri ${ago}.`,
      resetLine: (clock, countdown) => `sıfırlanır ${clock} · ${countdown}`,
      updatedLine: (ago) => `Güncellendi ${ago}`,
      nextPoll: (countdown) => `sonraki kontrol ${countdown}`,
      deltaSuffix: '5dk',
    },

    spend: {
      title: 'Ekstra kullanım',
      enabled: 'açık',
      disabled: 'kapalı',
      perMonth: 'aylık',
      limitReached: 'Harcama limitine ulaşıldı.',
    },

    analytics: {
      noDataTitle: 'Yerel oturum verisi yok',
      noDataSub: 'Bu makinede ~/.claude/projects klasörü bulunamadı. Claude Code ile birkaç oturum açtıktan sonra burada analiz görünecek.',
      failed: 'Analiz çalıştırılamadı.',
      disclaimer: 'Yaklaşık — sadece bu makinedeki oturumlar. claude.ai ve diğer cihazlar dahil değil. Maliyet, API fiyatlarıyla yapılan bir tahmindir.',
      today: 'Son 24 saat',
      week: 'Son 7 gün',
      requests: 'İstek',
      sessionsSuffix: (n) => `${n} oturum`,
      tokens: 'Token',
      cacheReadSuffix: (n) => `${n} cache okuma`,
      estimated: 'Tahmini',
      apiPriced: 'API fiyatlarıyla',
      output: 'Çıktı',
      inputSuffix: (n) => `${n} girdi`,
      modelDist: 'Model dağılımı',
      projects: 'Projeler',
      skillsCmd: 'Skill / komut',
      subagent: 'Subagent',
      mcpServer: 'MCP sunucu',
      tool: 'Araç',
      whatsEating: 'Limitini ne yiyor? (7 gün)',
      dailyTokens: 'Günlük token',
      unknownModel: 'Bilinmeyen model',
      behaviors: {
        cache_miss: (pct) => `%${pct} kullanımın >100k token cache yazımı içeriyordu`,
        long_context: (pct) => `%${pct} kullanımın >150k context ile yapıldı`,
        subagent: (pct) => `%${pct} kullanımın subagent isteklerinden geldi`,
        subagent_heavy: (pct) => `%${pct} oturumların subagent yoğunluydu`,
        long_session: (pct) => `%${pct} oturumların 8+ saat sürdü`,
      },
    },

    settings: {
      appearance: 'Görünüm',
      theme: 'Tema',
      themeClaudeLight: 'Claude Açık',
      accent: 'Vurgu rengi',
      accentDesc: 'Temanın kendi rengi yerine kendi rengini kullan.',
      reset: 'Sıfırla',
      radius: 'Köşe yuvarlaklığı',
      radiusDesc: 'Kart köşelerinin yumuşaklığı.',
      opacity: 'Saydamlık',
      opacityDesc: 'Pencerenin arka planı ne kadar geçirgen olsun.',
      gauge: 'Gösterim',
      gaugeDesc: 'Yüzdeler halka mı bar mı olsun.',
      gaugeRing: 'Halka',
      gaugeBar: 'Bar',
      mono: 'Monospace yazı tipi',
      monoDesc: 'Tüm arayüzde eşit genişlikli yazı tipi kullan.',
      animations: 'Animasyonlar',
      animationsDesc: 'Geçiş ve hareket efektleri.',
      compact: 'Kompakt mod',
      compactDesc: 'Daha küçük pencere ve sıkı yerleşim.',
      language: 'Dil',
      languageDesc: 'Uygulama arayüz dili.',

      behavior: 'Davranış',
      openAtLogin: 'Bilgisayar açılınca başlat',
      openAtLoginDesc: 'Windows açılışında sessizce tepside başlar.',
      startHidden: 'Açılışta gizli başla',
      startHiddenDesc: 'Uygulama açıldığında pencere gösterilmez.',
      minimizeToTray: 'Kapatınca tepsiye gizle',
      minimizeToTrayDesc: 'X tuşu uygulamayı kapatmaz, tepsiye indirir.',
      showAnalytics: 'Yerel analiz',
      showAnalyticsDesc: 'Bu makinedeki oturum dosyalarını okuyup analiz sekmesini doldurur.',
      notifyAt: 'Eşik uyarıları',
      notifyAtDesc: 'Bu yüzdelere ulaşınca masaüstü bildirimi gönderir.',

      account: 'Hesap ve güvenlik',
      session: 'Oturum',
      sessionOn: 'Uygulamanın kendi OAuth oturumu açık. Claude Code oturumundan bağımsızdır.',
      sessionOff: 'Giriş yapılmadı.',
      login: 'Giriş yap',
      logout: 'Çıkış yap',
      encOn: 'Erişim anahtarı Windows DPAPI ile şifrelenerek saklanıyor. Düz metin olarak diske hiç yazılmaz.',
      encOff: 'İşletim sistemi şifreleme sağlamıyor — anahtar yalnızca bellekte tutuluyor, uygulamayı kapatınca tekrar giriş gerekecek.',

      dataSource: 'veri: api.anthropic.com/api/oauth/usage',
    },

    errors: {
      network: 'Bağlantı kurulamadı',
      auth403: 'Yetki reddedildi — tekrar giriş yapman gerekebilir',
      auth401: 'Oturum süresi doldu — tekrar giriş yap',
      rate: 'Çok fazla istek — bekleniyor',
      server: (status) => `Sunucu hatası (${status})`,
      needLogin: 'Tekrar giriş yapman gerekiyor',
    },

    time: {
      resetting: 'sıfırlanıyor',
      now: 'şimdi',
      secLeft: (n) => `${n} sn kaldı`,
      minLeft: (n) => `${n} dk kaldı`,
      hourMinLeft: (h, m) => (m ? `${h} sa ${m} dk kaldı` : `${h} sa kaldı`),
      dayHourLeft: (d, h) => `${d} gün ${h} sa kaldı`,
      justNow: 'az önce',
      secAgo: (n) => `${n} sn önce`,
      minAgo: (n) => `${n} dk önce`,
      hourAgo: (n) => `${n} sa önce`,
      shortMin: (n) => `${n} dk`,
      shortHour: (n) => `${n} sa`,
      shortDay: (n) => `${n} gün`,
    },

    tray: {
      tooltipBase: 'Claude Usage',
      loggedOut: 'Claude Usage — giriş yapılmadı',
      loading: 'Claude Usage — yükleniyor…',
      error: (msg) => `Claude Usage — ${msg}`,
      genericError: 'hata',
      stale: '(güncel değil)',
      show: 'Göster',
      refreshNow: 'Şimdi yenile',
      settings: 'Ayarlar',
      openAtLogin: 'Bilgisayar açılınca başlat',
      quit: 'Çıkış',
    },

    notify: {
      title: (th) => `Claude Usage — %${th} aşıldı`,
      body: (label, pct, reset) => `${label}: %${pct}${reset ? ` · sıfırlanır ${reset}` : ''}`,
    },

    limits: {
      session: '5 saatlik oturum',
      weeklyAll: 'Haftalık · tüm modeller',
      weeklyModel: (name) => `Haftalık · ${name}`,
      weeklySurface: (name) => `Haftalık · ${name}`,
      weeklyOpus: 'Haftalık · Opus',
      weeklySonnet: 'Haftalık · Sonnet',
      weeklyOauthApps: 'Haftalık · OAuth uygulamaları',
      weeklyCowork: 'Haftalık · Cowork',
    },
  },

  en: {
    locale: 'en-US',
    tokenUnits: { k: 'K', m: 'M', b: 'B' },
    decimalSep: '.',
    pctPrefix: false, // 84%

    tabs: { dashboard: 'Limits', analytics: 'Analytics', settings: 'Settings' },

    titlebar: {
      refresh: 'Refresh',
      mini: 'Compact view',
      minimize: 'Minimize',
      close: 'Close',
    },

    mini: {
      hide: 'Hide',
      expand: 'Expand',
      session: '5h',
      week: 'Week',
      loading: 'Loading…',
      loggedOut: 'Not logged in',
      noData: 'No data',
    },

    login: {
      title: 'Sign in with your Claude account',
      sub: 'Sign in to your Claude account in the browser to see live usage limits. The app opens its own session; it never touches your Claude Code login.',
      button: 'Sign in with Claude',
      opening: 'Opening browser…',
      altButton: "Browser redirect not working?",
    },

    manual: {
      title: 'Paste the code manually',
      sub: 'After approving on the page that opened in your browser, paste the code shown there.',
      placeholder: 'code#state',
      verify: 'Verify',
      notStarted: 'Start the sign-in flow first',
    },

    dash: {
      errorTitle: "Couldn't fetch data",
      retry: 'Try again',
      noLimits: 'No limits to show for this account.',
      stale: (ago) => ` — showing data from ${ago}.`,
      resetLine: (clock, countdown) => `resets ${clock} · ${countdown}`,
      updatedLine: (ago) => `Updated ${ago}`,
      nextPoll: (countdown) => `next check ${countdown}`,
      deltaSuffix: '5m',
    },

    spend: {
      title: 'Extra usage',
      enabled: 'on',
      disabled: 'off',
      perMonth: 'per month',
      limitReached: 'Spending limit reached.',
    },

    analytics: {
      noDataTitle: 'No local session data',
      noDataSub: 'No ~/.claude/projects folder found on this machine. Analytics will appear here after a few Claude Code sessions.',
      failed: 'Could not run analytics.',
      disclaimer: 'Approximate — local sessions on this machine only. Does not include claude.ai or other devices. Cost is an estimate based on API pricing.',
      today: 'Last 24 hours',
      week: 'Last 7 days',
      requests: 'Requests',
      sessionsSuffix: (n) => `${n} sessions`,
      tokens: 'Tokens',
      cacheReadSuffix: (n) => `${n} cache read`,
      estimated: 'Estimated',
      apiPriced: 'at API pricing',
      output: 'Output',
      inputSuffix: (n) => `${n} input`,
      modelDist: 'Model breakdown',
      projects: 'Projects',
      skillsCmd: 'Skill / command',
      subagent: 'Subagent',
      mcpServer: 'MCP server',
      tool: 'Tool',
      whatsEating: "What's eating your limit? (7d)",
      dailyTokens: 'Daily tokens',
      unknownModel: 'Unknown model',
      behaviors: {
        cache_miss: (pct) => `${pct}% of usage had a >100k token cache write`,
        long_context: (pct) => `${pct}% of usage ran with >150k context`,
        subagent: (pct) => `${pct}% of usage came from subagent requests`,
        subagent_heavy: (pct) => `${pct}% of sessions were subagent-heavy`,
        long_session: (pct) => `${pct}% of sessions ran 8+ hours`,
      },
    },

    settings: {
      appearance: 'Appearance',
      theme: 'Theme',
      themeClaudeLight: 'Claude Light',
      accent: 'Accent color',
      accentDesc: "Use a custom color instead of the theme's own.",
      reset: 'Reset',
      radius: 'Corner radius',
      radiusDesc: 'How rounded card corners are.',
      opacity: 'Transparency',
      opacityDesc: 'How see-through the window background is.',
      gauge: 'Gauge style',
      gaugeDesc: 'Show percentages as a ring or a bar.',
      gaugeRing: 'Ring',
      gaugeBar: 'Bar',
      mono: 'Monospace font',
      monoDesc: 'Use a fixed-width font throughout the UI.',
      animations: 'Animations',
      animationsDesc: 'Transition and motion effects.',
      compact: 'Compact mode',
      compactDesc: 'Smaller window with tighter spacing.',
      language: 'Language',
      languageDesc: 'App interface language.',

      behavior: 'Behavior',
      openAtLogin: 'Start when computer starts',
      openAtLoginDesc: 'Starts silently in the tray on Windows startup.',
      startHidden: 'Start hidden',
      startHiddenDesc: 'No window is shown when the app launches.',
      minimizeToTray: 'Minimize to tray on close',
      minimizeToTrayDesc: 'The close button hides the app to the tray instead of quitting.',
      showAnalytics: 'Local analytics',
      showAnalyticsDesc: 'Reads session files on this machine to populate the Analytics tab.',
      notifyAt: 'Threshold alerts',
      notifyAtDesc: 'Sends a desktop notification when usage reaches these percentages.',

      account: 'Account & security',
      session: 'Session',
      sessionOn: "The app has its own OAuth session, independent of your Claude Code login.",
      sessionOff: 'Not signed in.',
      login: 'Sign in',
      logout: 'Sign out',
      encOn: 'The access token is encrypted with Windows DPAPI and never written to disk in plain text.',
      encOff: "The OS doesn't provide encryption — the token is kept in memory only, so you'll need to sign in again after closing the app.",

      dataSource: 'data: api.anthropic.com/api/oauth/usage',
    },

    errors: {
      network: "Couldn't connect",
      auth403: 'Access denied — you may need to sign in again',
      auth401: 'Session expired — sign in again',
      rate: 'Too many requests — waiting',
      server: (status) => `Server error (${status})`,
      needLogin: 'You need to sign in again',
    },

    time: {
      resetting: 'resetting',
      now: 'now',
      secLeft: (n) => `${n}s left`,
      minLeft: (n) => `${n}m left`,
      hourMinLeft: (h, m) => (m ? `${h}h ${m}m left` : `${h}h left`),
      dayHourLeft: (d, h) => `${d}d ${h}h left`,
      justNow: 'just now',
      secAgo: (n) => `${n}s ago`,
      minAgo: (n) => `${n}m ago`,
      hourAgo: (n) => `${n}h ago`,
      shortMin: (n) => `${n}m`,
      shortHour: (n) => `${n}h`,
      shortDay: (n) => `${n}d`,
    },

    tray: {
      tooltipBase: 'Claude Usage',
      loggedOut: 'Claude Usage — not signed in',
      loading: 'Claude Usage — loading…',
      error: (msg) => `Claude Usage — ${msg}`,
      genericError: 'error',
      stale: '(stale)',
      show: 'Show',
      refreshNow: 'Refresh now',
      settings: 'Settings',
      openAtLogin: 'Start when computer starts',
      quit: 'Quit',
    },

    notify: {
      title: (th) => `Claude Usage — ${th}% reached`,
      body: (label, pct, reset) => `${label}: ${pct}%${reset ? ` · resets ${reset}` : ''}`,
    },

    limits: {
      session: '5-hour session',
      weeklyAll: 'Weekly · all models',
      weeklyModel: (name) => `Weekly · ${name}`,
      weeklySurface: (name) => `Weekly · ${name}`,
      weeklyOpus: 'Weekly · Opus',
      weeklySonnet: 'Weekly · Sonnet',
      weeklyOauthApps: 'Weekly · OAuth apps',
      weeklyCowork: 'Weekly · Cowork',
    },
  },
};

const DEFAULT_LANG = 'tr';

function pick(lang) {
  return I18N[lang] || I18N[DEFAULT_LANG];
}

/**
 * Limit karti/tooltip/bildirim icin goruntu etiketi.
 *
 * ONEMLI: main process bu metni ONCEDEN URETIP GONDERMEZ -- fetch aninda
 * dondurulmus bir dil, kullanici sonra dil degistirdiginde bir sonraki
 * API cagrisina kadar guncellenmiyordu (rate-limit sirasinda dakikalarca
 * suren bir gecikme olabiliyordu). Bunun yerine main process sadece HAM
 * veriyi (kind/scope) tasir, bu fonksiyon her render'da CAGRILDIGI ANDAKI
 * dille metni kurar -- boylece dil degisikligi tum ekranlarda aninda
 * yansir.
 */
function limitLabel(lim, t) {
  if (!lim) return '';
  if (lim.scopeModelName) return t.limits.weeklyModel(lim.scopeModelName);
  if (lim.scopeSurfaceName) return t.limits.weeklySurface(lim.scopeSurfaceName);
  const map = {
    session: t.limits.session,
    five_hour: t.limits.session,
    weekly_all: t.limits.weeklyAll,
    seven_day: t.limits.weeklyAll,
    weekly_scoped: t.limits.weeklyAll,
    opus: t.limits.weeklyOpus,
    seven_day_opus: t.limits.weeklyOpus,
    sonnet: t.limits.weeklySonnet,
    seven_day_sonnet: t.limits.weeklySonnet,
    seven_day_oauth_apps: t.limits.weeklyOauthApps,
    seven_day_cowork: t.limits.weeklyCowork,
  };
  return map[lim.kind] || humanizeKind(lim.kind);
}

/** API'nin henuz bilmedigimiz bir 'kind' gonderdigi nadir durum icin yedek. */
function humanizeKind(kind) {
  if (!kind) return 'Limit';
  return String(kind).replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
}

/**
 * Poller hata nesnesinden ({kind, status}) goruntu metni kurar. Ayni
 * sebeple (canli dil degisimi) main process bu metni onceden kurup
 * dondurmuyor -- ham {kind, status} tasinir.
 */
function errorMessage(err, t) {
  if (!err) return '';
  if (err.kind === 'auth') {
    if (err.status === 403) return t.errors.auth403;
    if (err.status === 401) return t.errors.auth401;
    return t.errors.needLogin;
  }
  if (err.kind === 'rate') return t.errors.rate;
  if (err.kind === 'server') return t.errors.server(err.status);
  return t.errors.network;
}

I18N.pick = pick;
I18N.DEFAULT_LANG = DEFAULT_LANG;
I18N.limitLabel = limitLabel;
I18N.humanizeKind = humanizeKind;
I18N.errorMessage = errorMessage;

if (typeof module !== 'undefined' && module.exports) {
  module.exports = I18N;
}
