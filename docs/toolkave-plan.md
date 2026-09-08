# Toolkave — Project Plan

**toolkave.com** — ad-supported, browser-only utility site. Nuxt 3, static, four languages, zero hosting cost.
Plus one Telegram bot: **@toolkavebot** (document photo → PDF).

Status (8 Sept 2026): name chosen, toolkave.com bought, @toolkavebot registered. Next: repo + skeleton + first page live.

---

## 1. Brand and domain

- **Name:** Toolkave ("tool cave"). Keeps the word *tool*, 8 letters, pronounceable in uz/ru/en (тулкейв), no brand collision.
- **Domain:** toolkave.com only. Skip .net/.org/.io/.app — nobody types them. Pick up .uz / .kz later only if the local brand takes off, and redirect to .com.
- **Handles:** Telegram bot @toolkavebot (@toolkave was taken). Channel: @toolkave_uz or @toolkavehq if needed. Register GitHub repo `toolkave`.
- **Domain settings:** WHOIS privacy on, auto-renew on, DNS on Cloudflare.

---

## 2. Business model and expectations

**Model:** free tools → search traffic → display ads → later premium tier and direct sponsors.

**How the money works**
- Revenue is per 1,000 page views (RPM). Roughly $0.50–2 for CIS visitors, $5–15 for US/EU.
- Same page views from Western users = 5–10x the money. English content and backlinks are worth more per hour than new tools.
- Direct sponsors (a bank on the currency converter, a fintech on the salary calculator) pay far more per view in Uzbekistan than programmatic ads.

**Scenarios** (page views per month → ad income; users ≈ views ÷ 2)

| | 6 months | 12 months | 24 months |
|---|---|---|---|
| Pessimistic | 5–15k, $5–20 | 20–40k, $30–80 | 50–80k, $80–200 |
| Realistic | 20–50k, $30–100 | 100–250k, $300–800 | 400k–1M, $1.5–4k |
| Optimistic | 80–150k, $150–400 | 500k–1M, $2–5k | 2–4M, $10–25k |

- Pessimistic = ship and forget; only uz/ru pages rank.
- Realistic = 3–4 h/week for a year on content and SEO; 50/50 traffic mix; Ezoic by month 12. Lands around the $2–4k/month target.
- Optimistic = one or two pages win big English queries, or the site becomes "the" Uzbek utility site and expands to KZ/KG; premium tier at $5/month.
- Solo tool sites typically plateau at $1–5k/month after 12–24 months. Category ceiling (iLovePDF, Smallpdf, PDF24, TinyPNG) is tens of millions of visits and tens of millions of euros/year — with teams and a decade.

**Where to find open data:** Similarweb/Ahrefs/SEMrush free traffic estimates for any tool site (multiply by RPM); Indie Hackers verified-revenue pages; Ezoic and Mediavine annual RPM benchmarks; Flippa / Acquire.com listings of tool sites with AdSense screenshots (most sit in the $200–3k/month band).

**Why not a speed test:** needs big-bandwidth servers near the user; hosting cost scales with popularity.

---

## 3. Chosen tools

### Website (17 tools)

| # | Tool | Category | Library / approach |
|---|------|----------|--------------------|
| 1 | PDF merge, split, compress, PDF ⇄ Word/JPG | PDF | `pdf-lib`, `pdf.js` (client-side) |
| 2 | Image compressor / resizer | Image | `browser-image-compression`, canvas |
| 3 | Image format converter (HEIC/WebP/PNG/JPG) | Image | canvas, `heic2any` |
| 5 | QR code generator | Generators | `qrcode` |
| 6 | Word / character counter | Text | plain JS |
| 7 | Password generator | Generators | Web Crypto API |
| 8 | YouTube thumbnail downloader | Generators | URL parsing (thumbnails are public URLs) |
| 9 | Unit converter (length, weight, temperature) | Converters | plain JS / `convert-units` |
| 10 | Currency converter (live rates) | Converters | CBU API + free rates API; cache at build/edge |
| 11 | Percentage / discount / VAT calculator | Calculators | plain JS |
| 12 | Age / date-difference calculator | Calculators | `dayjs` |
| 13 | BMI calculator | Calculators | plain JS |
| 14 | Loan / mortgage calculator | Calculators | plain JS |
| 15 | JSON formatter / validator | Dev | plain JS |
| 16 | Base64 / URL encoder-decoder | Dev | plain JS |
| 19 | Color picker / HEX ⇄ RGB / palette | Dev | plain JS |
| 20 | Timezone converter / meeting planner | Converters | `dayjs` + timezone plugin |

Skipped for now: background remover (paid AI API), lorem ipsum, case converter. Add later when search data says people want them.

### Telegram bot — @toolkavebot

- Document photo → PDF: user sends passport/ID/paper photos, bot returns a clean PDF; also compress and merge.
- Python (aiogram) + `img2pdf` / Pillow. Sponsor line at the bottom of each reply.

---

## 4. Site architecture

**Principles**
- Everything runs in the browser. No uploads → zero hosting cost, "files never leave your device", no data-localization issues.
- One page per tool per language, translated slugs.
- One tools registry drives homepage, nav, sitemap, related-tools blocks.
- Static output (`nuxt generate`), deployed to the edge.

**Folder structure**

```
toolkave/
├── nuxt.config.ts
├── app.vue
├── layouts/
│   └── default.vue          # header, footer, ad slots, lang switcher
├── pages/
│   ├── index.vue            # homepage: grid of tools by category
│   └── tools/
│       ├── pdf-merge.vue
│       ├── pdf-split.vue
│       ├── image-compress.vue
│       ├── qr-generator.vue
│       ├── word-counter.vue
│       └── ...one file per tool
├── components/
│   ├── tool/
│   │   ├── ToolShell.vue    # title, description, FAQ, related tools
│   │   ├── FileDropzone.vue
│   │   ├── ResultDownload.vue
│   │   └── ToolCard.vue
│   └── ads/
│       └── AdSlot.vue       # one component; placement + network as props
├── composables/
│   ├── usePdf.ts
│   ├── useImage.ts
│   ├── useQr.ts
│   └── useSeo.ts            # title / meta / JSON-LD per tool
├── data/
│   └── tools.ts             # registry: slug, category, icon, i18n keys, related
├── i18n/
│   ├── uz.json
│   ├── uz-cyrl.json
│   ├── ru.json
│   └── en.json
├── utils/
│   └── formatters.ts
└── public/
    ├── robots.txt
    └── og/                  # one OG image per tool
```

**Key decisions**
- **Registry (`data/tools.ts`)** — each tool: `slug`, `category`, i18n keys, `related`, JSON-LD type. New tool = one entry + one page file.
- **i18n** — `@nuxtjs/i18n`, prefix strategy with translated slugs: `/uz/pdf-birlashtirish`, `/ru/obedinit-pdf`, `/en/merge-pdf`. `hreflang` from the module.
- **SEO** — `useSeo(tool)` sets title, description, canonical, OG, `WebApplication` JSON-LD. Each page has 200–400 words of real text + 3–5 FAQs below the tool. That text ranks, not the tool.
- **Rendering** — prerender all routes; `@nuxtjs/sitemap`.
- **Ads** — one `AdSlot` component, placements `top`, `sidebar`, `below-result`, network chosen per slot (see §7). Load ad scripts once in the layout, lazily, after hydration. Never between upload and result. Max 3–4 units per page.
- **Layout** — two columns on desktop, single on mobile. Most traffic is mobile.
- **Categories** — PDF, Image, Generators, Text, Calculators, Converters, Dev.

---

## 5. Build order

1. **Skeleton (day 1):** layout, registry, i18n, word counter, sitemap, deploy to Cloudflare Pages, attach toolkave.com. Live over HTTPS.
2. **Traffic drivers:** PDF merge/split, image compress, QR.
3. **Calculators and converters** in a batch.
4. **Dev tools** (JSON, Base64, color) — quick, higher-RPM visitors.
5. **After launch:** 300-word content per page in four languages; submit sitemap to Google Search Console and Yandex Webmaster; apply for AdSense after ~15 content pages.
6. **@toolkavebot** in parallel — a day of work.

---

## 6. Hosting, DNS, services

- **Hosting:** Cloudflare Pages (free, unlimited bandwidth, fast in CIS, deploy on push). Vercel as fallback.
- **DNS/CDN:** Cloudflare, regardless of where the domain was bought.
- **Free services:** Google Search Console, Yandex Webmaster, Cloudflare Web Analytics or Umami (no cookie banner), Sentry free tier, GitHub Actions or built-in deploys.
- **Year-one cost:** the domain (~$10–11).

**Cloudflare SEO checklist** (neutral-to-positive when set right)
- SSL: Full (strict); Always Use HTTPS: on
- Security level: Medium; no custom WAF rules until needed (avoid CAPTCHA-ing Googlebot/Yandexbot)
- Rocket Loader: off (breaks Nuxt hydration); Auto Minify: off
- Cache: default; let Pages handle invalidation
- HTTP/3 + Brotli: on
- Post-launch: confirm Googlebot reaches pages via Search Console URL Inspection
- Shared IP has no SEO effect.

---

## 7. Ads

**Which networks run together**
- **AdSense + Yandex РСЯ: yes, at the same time.** Separate slots (e.g. AdSense top + below-result, Yandex sidebar). Ads must not be disguised as content or mimic each other. Later, geo-split: РСЯ for ru/uz visitors, AdSense for everyone else.
- **Ezoic / Mediavine / Raptive: instead of, not on top.** They take over Google inventory. Ezoic has no traffic minimum; Mediavine ~50k sessions/month, Raptive ~100k pageviews, exclusive, mostly US/EU audience.

**Ladder**
1. Launch: AdSense + РСЯ via own `AdSlot`.
2. ~10k+ sessions/month: Ezoic (keep РСЯ slots). Expect 1.5–2x AdSense RPM after ~30 days. Use Ezoic's Cloudflare/edge integration to avoid slowdowns.
3. 50k+ sessions with Western audience: Mediavine/Raptive, drop the rest.

**Avoid:** Adsterra, PropellerAds, Monetag — popunders/push hurt trust and SEO.

**Best local money:** direct sponsors on the currency and salary pages, invoiced in so'm.

**Measure Core Web Vitals before and after every ad change.**

---

## 8. Getting paid

- **AdSense:** Uzbekistan is a supported billing country. Fill the tax form (non-US individual; US withholding mainly affects YouTube, not display ads). Payout monthly ~21st once balance ≥ $100, by SWIFT wire only. **Destination: existing Payoneer account** (already used for Upwork) — use its US receiving details as the bank account in AdSense; withdraw to Uzbek card. Expect small transfer fees.
- **РСЯ:** bank transfer for foreign individuals after a threshold; check current options for Uzbekistan residents before relying on it.
- **Sponsors:** invoice locally in so'm — simplest.
- **Tax:** foreign income. Register as an individual entrepreneur (yakka tartibdagi tadbirkor) when the first $100 payout is near; confirm regime with an accountant.

---

## 9. Launch checklist

- [x] Name chosen: Toolkave
- [x] toolkave.com bought
- [x] @toolkavebot registered
- [ ] Domain on Cloudflare, SSL Full (strict), Rocket Loader off, WHOIS privacy + auto-renew on
- [ ] GitHub repo `toolkave`, Nuxt 3 skeleton, deployed to Cloudflare Pages
- [ ] Tools registry + i18n (uz, uz-cyrl, ru, en)
- [ ] Word counter live at toolkave.com
- [ ] PDF, image, QR tools live
- [ ] Calculators, converters, dev tools live
- [ ] 200–400 words + FAQ on every tool page, all languages
- [ ] Sitemap, robots.txt, OG images
- [ ] Search Console + Yandex Webmaster verified, sitemap submitted
- [ ] Analytics + Sentry
- [ ] AdSense applied (after ~15 content pages), Payoneer set as payout
- [ ] РСЯ applied
- [ ] @toolkavebot live with sponsor line
- [ ] First outreach to 2–3 local sponsors for currency/salary pages
- [ ] Revisit Ezoic at ~10k sessions/month
