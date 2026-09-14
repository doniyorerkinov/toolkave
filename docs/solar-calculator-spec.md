# Solar Calculator (Uzbekistan) — Project Spec

Lead-generation site for home solar in Uzbekistan. A free calculator estimates system size, cost and payback; users are pushed into a Telegram bot; installers later pay a flat sponsorship fee for exclusive access to that audience.

## 1. Goals and constraints

**Goal:** a small SEO/Telegram-driven site that produces a re-contactable audience of homeowners interested in solar, which can be sold as an exclusive sponsorship to 1–2 installers.

**Hard constraints (do not violate):**
- No payment processing of any kind. Sponsors pay the owner offline; the site never touches money.
- No server for the website itself — static Nuxt on Cloudflare Pages. The only backend is a tiny Cloudflare Worker for the Telegram bot.
- No phone-number collection on the site. Users are captured through Telegram (chat_id) only.
- Separate brand from toolkave.com: its own domain, its own Telegram bot, its own analytics. Shared code is fine.
- Languages: Uzbek (Latin) as default, Russian as second locale. Each locale has its own URLs.

## 2. Architecture

```
[Nuxt 3/4 static site]  --deep link-->  [Telegram bot]
Cloudflare Pages                         Cloudflare Worker (webhook)
uz / ru, i18n                            Cloudflare KV or D1 (users)
AdSense + sponsor slot                   broadcast route (admin-only)
```

- **Site:** Nuxt, `nuxt generate`, deployed to Cloudflare Pages. Reuse layout/components from toolkave if convenient (monorepo or shared package), but a separate deploy target and separate config.
- **Bot backend:** one Cloudflare Worker, TypeScript, receives Telegram webhook updates. Storage: KV (simplest) or D1 (if querying by region is wanted later).
- **No API between site and Worker.** The site links to `https://t.me/<BotName>?start=<payload>`; the payload carries the calculator result.

## 3. Domain and hosting

- Preferred: a `.uz` domain (registered via an accredited Uzbek registrar, DNS on Cloudflare). Fallback: `.com` with uz/ru content and Uzbekistan geo-targeting.
- Register the site in Google Search Console and Yandex Webmaster; set geo-target = Uzbekistan.
- Cloudflare Pages free tier for the site; Cloudflare Workers free tier for the bot.

## 4. Pages (SEO cluster)

Build as a small hub so pages link to each other and rank as a topic:

| Page | uz slug (example) | Purpose |
|---|---|---|
| Solar calculator (main) | `/quyosh-paneli-kalkulyatori` | Core lead tool |
| Electricity bill calculator | `/elektr-hisoblagich` | Bill by tariff tier; SEO traffic; links to solar |
| Generator / UPS sizing | `/generator-kalkulyatori` | Blackout-season traffic |
| Battery runtime calculator | `/akkumulyator-kalkulyatori` | "How long will X run on Y Ah"; feeds battery leads |
| FAQ / guide articles | `/maqolalar/...` | 5–10 short articles targeting long-tail queries |

Each tool page: H1 with target keyword, short intro, calculator, result, CTA to bot, FAQ block (schema.org FAQPage), links to the other tools. Russian mirror for every page (`/ru/...`).

Every calculator page shows **"Last updated: <date>"** and the tariff source link. Tariffs and net-metering rules change; stale numbers destroy credibility.

## 5. Solar calculator — functional spec

### 5.1 Inputs (max 6 visible at once)

Two entry paths, user picks one:

**Quick path**
1. Monthly electricity bill (so'm) — or monthly kWh if known
2. Region (dropdown, all 12 regions + Tashkent city + Karakalpakstan)
3. Roof type/orientation: flat / south / east-west / north (affects yield factor)
4. Available roof area (m²) — optional; used to cap system size
5. Blackouts: none / sometimes / often (drives battery recommendation)
6. Goal: reduce bill / full independence / backup during blackouts

**Detailed path** (replaces input 1)
- Appliance picker with default wattage and default hours/day, editable. Defaults:

| Appliance | W | h/day |
|---|---|---|
| Refrigerator | 150 (avg, compressor duty) | 24 |
| TV | 100 | 5 |
| Lighting (LED, whole home) | 60 | 6 |
| Air conditioner (per unit) | 1200 | 6 (summer) |
| Washing machine | 500 | 1 |
| Electric kettle | 2000 | 0.3 |
| Microwave | 1000 | 0.3 |
| Electric oven | 2000 | 0.5 |
| Water heater (boiler) | 1500 | 2 |
| Electric heater (winter) | 2000 | 6 |
| PC / laptop | 150 | 6 |
| Phone charging, router, misc | 30 | 24 |
| Water pump | 750 | 1 |

Daily kWh = Σ (W × h) / 1000. Monthly kWh = daily × 30.

### 5.2 Configurable constants (put in one `config/solar.ts` file)

All values below are **placeholders to be verified** before launch; keep them in config, not in components.

```ts
export const TARIFF = {
  // so'm per kWh, residential. VERIFY current values and social-norm tiers.
  tier1_kwh: 200,        // monthly kWh within social norm
  tier1_price: 600,      // placeholder
  tier2_price: 900,      // placeholder for above-norm consumption
  netMeteringPrice: 400, // placeholder — price paid for exported kWh, VERIFY
  updatedAt: '2026-09-13',
  sourceUrl: '',
}

export const REGION_SUN_HOURS: Record<string, number> = {
  // average peak-sun-hours per day, annual. Placeholders, refine per region.
  tashkent: 4.6, samarqand: 4.8, buxoro: 5.0, surxondaryo: 5.2,
  qashqadaryo: 5.0, navoiy: 5.1, xorazm: 4.8, qoraqalpogiston: 4.7,
  fargona: 4.4, andijon: 4.4, namangan: 4.4, jizzax: 4.7, sirdaryo: 4.7,
}

export const ORIENTATION_FACTOR = { south: 1.0, flat: 0.92, eastwest: 0.82, north: 0.6 }

export const SYSTEM = {
  panelWatt: 550,            // typical panel
  panelAreaM2: 2.6,
  performanceRatio: 0.78,    // inverter, wiring, dust, temperature losses
  costPerKwOnGrid: 0,        // so'm per kW installed, VERIFY with installers
  costPerKwHybrid: 0,        // with battery-ready hybrid inverter
  batteryCostPerKwh: 0,      // so'm per kWh of storage
  degradationPerYear: 0.006,
  lifetimeYears: 25,
}
```

### 5.3 Formulas

```
monthlyKwh        = from appliances, or derived from bill:
                    if bill <= tier1_kwh*tier1_price: bill / tier1_price
                    else: tier1_kwh + (bill - tier1_kwh*tier1_price) / tier2_price

dailyKwh          = monthlyKwh / 30
sunHours          = REGION_SUN_HOURS[region] * ORIENTATION_FACTOR[orientation]
requiredKw        = dailyKwh / (sunHours * performanceRatio)
                    (goal = "full independence": multiply by 1.2 safety margin)
panelCount        = ceil(requiredKw * 1000 / panelWatt)
roofNeededM2      = panelCount * panelAreaM2
if roofAreaM2 given and roofNeededM2 > roofAreaM2:
    cap panelCount = floor(roofAreaM2 / panelAreaM2), recompute kW, flag "roof limits you"

yearlyKwh         = requiredKw * sunHours * performanceRatio * 365
selfUsedShare     = 0.6 default (0.85 if battery)         // rest is exported
yearlySavings     = yearlyKwh*selfUsedShare*avgTariff + yearlyKwh*(1-selfUsedShare)*netMeteringPrice
                    (avgTariff = blended tariff at user's consumption level)
systemCost        = requiredKw * costPerKw (+ batteryKwh * batteryCostPerKwh)
paybackYears      = systemCost / yearlySavings
lifetimeSavings   = Σ over 25 years of yearlySavings*(1-degradation)^year - systemCost

batteryKwh        (if blackouts != none):
                  = dailyKwh * 0.5 (sometimes) or dailyKwh * 1.0 (often), rounded to 5 kWh steps
```

Show cost as a **range** (±15%) — never a single number, since installers will quote differently.

### 5.4 Outputs

- Recommended system size (kW), panel count, roof area needed
- Estimated cost range (so'm and USD)
- Monthly savings, yearly savings, payback (years)
- Battery recommendation (kWh) if blackouts selected
- A one-line explanation of assumptions with "last updated" and source
- **Primary CTA:** "Natijani Telegramga yuborish / Отправить результат в Telegram" → deep link
- Secondary: copy result, share link (result encoded in URL query so pages are shareable)

## 6. Site → Telegram handoff (deep link)

Button href:

```
https://t.me/<BotName>?start=<payload>
```

Payload rules: ≤ 64 chars, only `A-Z a-z 0-9 _ -`. Encode compactly, e.g.

```
v1_tas_k5-2_b420_bat10_o-s_g2
 v1     version
 tas    region code (3 letters)
 k5-2   5.2 kW (dot encoded as '-')
 b420   monthly bill in thousands so'm (420 000)
 bat10  battery kWh (0 if none)
 o-s    orientation south
 g2     goal id
```

Provide `encodePayload(result)` on the site and `decodePayload(str)` in the Worker; both live in a shared `packages/solar-core` module together with the formulas, so site and bot compute identically. Payload is visible in the URL — never put anything sensitive in it.

## 7. Telegram bot — Worker spec

**Setup:** create bot via BotFather, store token as Worker secret, call `setWebhook` to the Worker URL with a secret token header check.

**Handlers:**
1. `/start <payload>` → decode → save user → reply with formatted result (uz or ru based on `from.language_code`, default uz) + inline keyboard: "Installer takliflarini olish? ✅ Ha / ❌ Yo'q".
2. `/start` without payload → short intro + link to the site.
3. Callback `offers_yes` / `offers_no` → update `wantsOffers`, confirm.
4. `/lang` → switch uz/ru. `/stop` → `wantsOffers=false`.
5. Anything else → link to site.

**Storage schema (KV key = `user:<chat_id>`):**

```json
{
  "chatId": 123,
  "lang": "uz",
  "region": "tas",
  "kw": 5.2,
  "billK": 420,
  "batteryKwh": 10,
  "wantsOffers": true,
  "createdAt": "2026-09-13T10:00:00Z",
  "lastBroadcastAt": null
}
```

Also keep a KV index `users:all` (array of chat_ids) or use D1 if per-region queries are needed.

**Admin/broadcast route:** `POST /broadcast` protected by a secret header. Body: `{ text, lang?, region?, onlyWantsOffers: true }`. Loops users, `sendMessage` with ~25 msg/s throttle, records failures (blocked bot → mark user inactive). Optional: `/stats` endpoint returning counts by region and by wantsOffers — this is what gets shown to installers.

**Size target:** ~150 lines TS. No framework needed; plain `fetch` to `https://api.telegram.org/bot<token>/...`.

## 8. Ads, sponsor slot, analytics

- AdSense units on article/secondary tool pages as usual.
- On the solar calculator page, reserve **one sponsor slot** component (`<SponsorSlot />`) above the result: logo, one line, "Get a quote" link to the sponsor's site/Telegram. Config-driven; empty → renders nothing (or a generic AdSense unit until a sponsor exists).
- Keep sponsor clicks and bot deep-link clicks as separate analytics events from ad clicks. Events to track (Plausible/Umami/GA4, any one): `calc_completed`, `bot_deeplink_click`, `sponsor_click`, `share_click`.
- The installer pitch uses: calculations/month, bot users/month, wantsOffers count, breakdown by region.

## 9. Installer plan (non-code, for context)

1. Launch with empty sponsor slot; run 4–8 weeks to gather numbers.
2. Approach installers via their Instagram/Telegram (not in person). Show `/stats`.
3. First month free for 1–2 installers: broadcast their offer to `wantsOffers` users.
4. Then a flat monthly exclusive-sponsor fee (slot + broadcasts). No per-lead billing, no payments through the site.

## 10. Build plan

**Phase 1 (2–3 days):** domain + Cloudflare Pages, Nuxt skeleton with i18n, `solar-core` package (formulas, config, payload encode/decode) with unit tests, solar calculator page (quick + detailed path), result view, deep-link CTA, share URL, SEO basics (meta, sitemap, FAQ schema), "last updated" block.

**Phase 2 (1–2 days):** Telegram Worker bot: webhook, `/start` decode, storage, yes/no keyboard, `/stats`, `/broadcast`.

**Phase 3 (2–3 days):** electricity bill calculator, generator/UPS sizing, battery runtime calculator, 5 articles, internal linking, Search Console + Yandex Webmaster submission.

**Phase 4 (ongoing):** sponsor slot config, analytics review, tariff updates.

## 11. Open items for the owner (before launch)

- [ ] Verify current residential tariff tiers and net-metering export price; fill `TARIFF` and its source URL.
- [ ] Get 2–3 real installed-cost quotes (so'm per kW, on-grid and hybrid; so'm per kWh battery) to fill `SYSTEM` costs.
- [ ] Decide domain name (`.uz` preferred) and bot username.
- [ ] Choose KV vs D1 (KV is enough for < 10k users).
- [ ] Choose analytics tool.
