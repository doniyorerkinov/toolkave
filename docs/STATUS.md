# Toolkave — Status

**As of 15 September 2026.** A snapshot of where the project actually stands,
written so that someone picking it up cold does not have to re-derive any of it.
The forward-looking list lives in [ORDER.md](ORDER.md).

## What it is

A browser-only utility site: every tool runs on the user's machine, no file is
ever uploaded. Nuxt 4 prerendered to static pages, served from Cloudflare
Workers at toolkave.com, in English, Russian and Uzbek with per-locale slugs.
Revenue model is ads; there are no accounts and no server-side storage.

## Where it is today

| | |
|---|---|
| Tools published | **83** |
| Tools built, awaiting your test | **37** — 24 media, 8 dev, 5 colour |
| URLs in the sitemap | **288** |
| Locales | en (default, unprefixed), ru, uz |
| Last deploy | version `0d98d55f-df78-40b8-bb09-f9a61614a10e` |
| Cloudflare | Workers **Paid** since 14 Sept — the bot's PDF build needs more CPU than the free ceiling allows |

Every tool in the registry is live. This is the first day that has been true.

Dark mode arrived 15 Sept and covers every page in both themes, verified by a
contrast audit rather than by eye. See "Themes" below.

### ffmpeg did not work until 15 September

Worth knowing, because nothing about it was visible. The nine media tools built
in the first wave had never successfully run: `@ffmpeg/ffmpeg` always starts its
worker with `type: "module"`, a module worker has no `importScripts`, so the
worker falls through to `await import(coreURL)` and takes `.default` from it.
We were shipping the **UMD** core, which has no default export, so every single
load threw `failed to import ffmpeg-core.js` before a frame was decoded.

`scripts/copy-ffmpeg.mjs` now copies from `dist/esm`. Do not change it back; the
two builds are not interchangeable and the failure is total, silent and
identical on every browser.

A second fault was hiding behind the first: none of the media components
rendered `ShellResultCard` or `store.error`, so even with a working engine there
was no download button and failures said nothing. Both are fixed.

The lesson is cheap to state and was expensive to find: **`published: false`
means built, not working.** It kept all nine off the live site, which is exactly
what it is for — but it also meant a dead engine sat unnoticed for a fortnight.

### Tools by category

| Category | Live | Path (en / ru / uz) |
|---|---|---|
| PDF | 30 | `/pdf` · `/ru/pdf` · `/uz/pdf` |
| Image | 21 | `/image` · `/ru/izobrazheniya` · `/uz/rasm` |
| Converters | 14 | `/converters` · `/ru/konvertery` · `/uz/konvertorlar` |
| Colour | 4 | `/color` · `/ru/cveta` · `/uz/ranglar` |
| Calculators | 4 | `/calculators` · `/ru/kalkulyatory` · `/uz/kalkulyatorlar` |
| Dev | 4 | `/dev` · `/ru/dev` · `/uz/dev` |
| Generators | 3 | `/generators` · `/ru/generatory` · `/uz/generatorlar` |
| Text | 3 | `/text` · `/ru/tekst` · `/uz/matn` |

## The registry is the single source of truth

`app/data/tools.ts` drives routing, the sitemap, hreflang, prerendering, the
category pages and the "related tools" links. Adding a tool means adding an
entry there; nothing else needs to know about it.

`published: false` is a gate, not a to-do marker. It means *built but no human
has used it yet*. Flipping it to `true` is a deliberate act that happens after
Doniyor tests the tool and says so — never automatically, never as a side
effect of the code being finished.

## Themes

Light and dark, switched entirely by redefining about twenty `--color-*`
variables under `prefers-color-scheme: dark`. Every Tailwind v4 colour utility
resolves through one of those, so the whole site turns over without touching
any of the 88 components that use them.

Two rules that are easy to break:

- **A surface that is dark in both modes uses `ink` / `on-ink` / `on-ink-dim`,
  never the stone ramp.** The header, footer, lightbox, modal scrim and code
  block are dark by design; a ramp value that reads as muted-light on a dark
  bar in one mode is muted-dark on the same bar in the other.
- **The ramp is turned over, but contrast is chosen, not mirrored.** `stone-400`
  measured 3.07:1 against a dark card when simply mirrored, so it sits at 63%.

Canvases and page previews keep a white background: a scan shown inverted would
misrepresent the file being saved.

## Stack

- **Nuxt 4** (`app/` directory), **Tailwind v4**, **Pinia** for the shared file store
- **@nuxtjs/i18n** in `prefix_except_default` mode, one slug set per locale
- **Cloudflare Workers** (`cloudflare_module` preset) via wrangler; `public/_headers` carries HSTS and the year-long cache for fonts, the ONNX runtime and the background-removal model
- Heavy lifting in the browser: `@cantoo/pdf-lib`, `pdfjs-dist`, `pdfmake`, `mammoth`, `xlsx`, `libheif-js`, `onnxruntime-web` + u2netp, `jszip`, `qrcode`, `jsqr`

## Tests

`npm test` runs Node's own test runner over `tests/*.test.mjs` with
`--experimental-strip-types`. **106 tests, 105 pass, 1 todo.**

The one that earns its keep every time is `tests/locales.test.mjs`: a single
translation containing HTML or a bare `@` makes `unplugin-vue-i18n` reject the
whole locale file, and then *every string on the site* renders as its own key —
while server rendering still looks perfect, so nothing you would normally check
catches it. Run it after any locale edit.

## Deploying

Two traps, both of which have already shipped a stale build once:

1. **Kill every project process, not the port.** `npm run dev` spawns four
   processes and `wrangler` leaves a `workerd.exe` behind; stopping only the one
   listening on :3000 leaves parents holding `.output`, and the build dies with
   `EBUSY`.

       Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*D:\PROJECTS\toolkave*' -and ($_.Name -eq 'node.exe' -or $_.Name -eq 'workerd.exe') } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }

2. **Never chain the build into the deploy through a pipe.**
   `npm run build | tail -4 && wrangler deploy` checks *tail's* exit code, so a
   failed build still deploys whatever `.output` happens to hold. Redirect to a
   file and check `$?`:

       npm run build > build.log 2>&1; echo "exit: $?"

Then confirm the build is new (`.output/server/index.mjs` timestamp, or the
sitemap count) before deploying.

**After deploying, the edge serves stale 404s for up to a minute.** A URL that
404s immediately after a deploy is not evidence of failure — re-check it with a
`?cb=random` cache-buster before diagnosing anything. This has now happened
twice and wasted time both times.

## Core Web Vitals

Measured by Cloudflare Web Analytics, 24 Aug – 14 Sept 2026:

| Metric | P75 | Google's "good" | |
|---|---|---|---|
| LCP | **356 ms** | ≤ 2,500 ms | 88% good |
| INP | — | ≤ 200 ms | **100% good** |
| CLS | — | ≤ 0.1 | **100% good** |

P50 LCP is 238 ms. **Performance is not a problem and needs no work.**

Two caveats worth keeping straight:

- **P90 and P99 are both 8,224 ms — the same number.** Identical values at two
  percentiles means a single sample in the tail, not a slow page: roughly one
  view in eight. Checked against the build, and it is not structural — the
  homepage ships 62 KB of HTML and ~363 KB of JS uncompressed, everything is
  served brotli-encoded with `CF-Cache-Status: HIT`, and the genuinely heavy
  chunks (the 1.9 MB ONNX runtime, the 424 KB PDF worker) are lazy-loaded and
  never touch the homepage. One visitor on a bad connection.
- **The sample is tiny.** Cloudflare's own chart caps at "5 items" and a count
  axis of 40. One visit moves a percentile by 13 points. These numbers are
  excellent and they describe almost nothing yet.

## Search engines

### Google — healthy, just young

Verified live on 14 Sept and all correct: `robots.txt` allows everything and
declares the sitemap; `sitemap.xml` is valid with hreflang alternates inside
each entry; pages carry canonical + `hreflang` for en/ru/uz + `x-default`;
breadcrumb JSON-LD validates with zero errors.

The Page indexing report says "Processing data" because the property is days
old, not because anything is wrong. **There is no technical work outstanding on
the Google side.**

"Request indexing" is capped at roughly 10–12 per day. The plan is to spend it
on hub pages rather than leaves — the homepage and eight category pages expose
between 20 and 56 internal links each, so one request does discovery work for
dozens of pages.

### Yandex — mid-migration, expected to look wrong for a while

The Webmaster property is registered as the **`http://`** host. That is why
full `https://…` URLs were rejected, and why every row in the reindex table
reads `http://`: Yandex prefixes bare paths with its own registered host.

The site move (Индексирование → Переезд сайта, "Добавить HTTPS" ticked, WWW
correctly left unticked) was **submitted on 14 Sept** and is queued. It takes
weeks. Until it lands:

- Hand over Yandex URLs as **paths only** (`/ru/pdf/obedinit`), never prefixed.
- Seeing `http://` in Yandex reports is expected state, not a redirect bug.
- The ~109 URLs already submitted do not need resubmitting; the mirror transfer
  carries them.

## Open items that are not code

- ~~Create `hello@toolkave.com`~~ — **dropped 15 Sept.** The address was
  advertised on the contact, privacy and terms pages while the domain had no MX
  records at all, so every message to it had bounced since launch. Removed from
  all three pages in all three languages rather than set up.
- Finish the Bing Webmaster import
- Set the Yandex region
- Rotate the Telegram bot token and webhook secret **if** they were ever pasted
  outside the repo. Checked on 14 Sept: all 103 commits and the working tree are
  clean of the token pattern, and no `.env` / `.dev.vars` is tracked. Secrets go
  in with `wrangler secret put` and are never committed.

## The honest bottleneck

Nothing technical is blocking growth. Indexing is configured correctly, the
tools work, and the registry is fully published. What the site does not have is
**anyone linking to it**. No amount of sitemap or index-request work substitutes
for that, and it is the thing worth attention next.
