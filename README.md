# Claude Usage

Claude kullanım limitlerini sistem tepsisinden anlık takip eden Windows masaüstü uygulaması.
`/usage` komutunun gösterdiği her şeye terminal açmadan erişirsin.

![tema: Midnight](build/icon.png)

## Ne yapar

- **Canlı limitler** — 5 saatlik oturum, haftalık (tüm modeller + model bazlı), ekstra kullanım.
  Yüzde, sıfırlanma saati, geri sayım, 24 saatlik sparkline ve "son 5 dk'da +%3" delta rozeti.
- **Tepsi ikonu** — yüzdeyi rakamla gösterir, renk eşiğe göre değişir (yeşil / kehribar / kırmızı).
- **Yerel analiz** — `~/.claude/projects/*.jsonl` dosyalarından son 24 saat / 7 gün için istek
  ve oturum sayısı, token dağılımı, tahmini maliyet, model & proje kırılımı, en çok kullanılan
  skill / subagent / MCP sunucu ve "limitini ne yiyor" davranış analizi.
- **5 tema** + vurgu rengi, köşe yuvarlaklığı, saydamlık, kompakt mod, monospace seçeneği.
- **Bilgisayar açılınca başlat** — sessizce tepside açılır.

## Kurulum

```
npm install
npm run dist
```

Çıktı: `dist/Claude Usage Setup <sürüm>.exe` — yönetici yetkisi istemez, kurulum dizini seçilebilir.

Geliştirme için: `npm start` (veya DevTools ile `npm run dev`).

## Güvenlik

Bu uygulama hesabına erişir, o yüzden tasarımı buna göre:

| Konu | Yaklaşım |
|---|---|
| Token saklama | Windows DPAPI (`safeStorage`) ile şifreli `auth.bin`. Şifreleme yoksa **diske hiç yazılmaz**, sadece bellekte tutulur. Düz metin fallback yok. |
| Claude Code oturumu | `~/.claude/.credentials.json` ne okunur ne yazılır. Uygulama kendi OAuth oturumunu açar; Claude Code'dan atılmazsın. |
| Renderer izolasyonu | `contextIsolation` + `sandbox` + `nodeIntegration:false`. Token renderer'a **hiç geçmez** — sadece hesaplanmış yüzde/tarih/isim gider. Tüm ağ çağrıları main process'te. |
| Giriş akışı | PKCE (S256) + `state` doğrulaması, harici tarayıcıda. Uygulama içi login penceresi yok. Loopback sunucu `127.0.0.1`'e bind, tek istek karşılar, 2 dk timeout. |
| Ağ | Sadece `api.anthropic.com`, `platform.claude.com`, `claude.com`. CSP `default-src 'self'`, CDN yok, harici gezinme reddedilir. |
| Telemetri | Yok. Yerel oturum verisi analiz edilir ama **hiçbir yere gönderilmez**; mesaj içeriği hiç parse edilmez. |
| Bağımlılık | Runtime bağımlılığı **sıfır** — grafikler ve PNG kodlayıcı dahil her şey elle yazıldı. Sadece `electron` + `electron-builder` devDependency. |

## Veri kaynağı

| Ne | Nereden |
|---|---|
| Limitler | `GET https://api.anthropic.com/api/oauth/usage` |
| Profil | `GET https://api.anthropic.com/api/oauth/profile` |
| Yerel analiz | `~/.claude/projects/**/*.jsonl` (artımlı okunur, `CLAUDE_CONFIG_DIR`'e saygı duyar) |

Renk seviyeleri API'nin kendi `severity` alanından gelir — yani `/usage` ile aynı değerlendirme.
Yoklama uyarlanabilir: pencere açıkken veya kullanım yüksekken 25 sn, arka planda 5 dk'ya kadar
yavaşlar, 429'da üstel backoff uygular, asla 15 sn'nin altına inmez.

Analiz sekmesindeki maliyet **tahmindir** — abonelikte token başına ödeme yapmazsın; bu sayı
"aynı işi API'den yapsaydın ne tutardı" karşılaştırmasıdır.
