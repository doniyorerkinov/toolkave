# Toolkave — Order of Work

**Live checklist. Updated 14 September 2026.**

This is the current, forward-looking order. It supersedes the phase list in
[toolkave-build-order.md](toolkave-build-order.md), which stays as the record of
locked decisions, standing engineering rules and how each earlier wave was
chosen — all still binding, none of it repeated here.

Companion: [STATUS.md](STATUS.md) for where things stand right now.

---

## Done

### Foundation and pipeline
- [x] **Phase 0–3** — Nuxt 4 skeleton, i18n with per-locale slugs, the registry
      as single source of truth, the Pinia file store, the file pipeline and the
      heavy (worker-backed) pipeline
- [x] Cloudflare Workers deploy, `_headers`, HSTS, long-lived caches for fonts,
      the ONNX runtime and the background-removal model

### Tool waves
- [x] **Wave 0–1** — the first live tools and the five-minute wins (17)
- [x] **Wave 2** — tier-1 PDF, the traffic core (8)
- [x] **Wave 3** — images, six pages off one component (6)
- [x] **Second image wave** (14) — including background removal with u2netp,
      the uneven/collage grid in Join images, and the passport-photo tool
- [x] **Wave 4** — the uz/ru moat (2)
- [x] **Wave 5** — document converters (12)
- [x] **Wave 6** — tier-2 PDF edits (10)
- [x] **Wave 7** — trust-sensitive tools, verified in a real viewer (4)
- [x] **Wave 8** — layout re-creation and niche (4)

### Sections added after the original plan
- [x] **Colour** (4) — the OKLab/OKLCH engine in `shared/colour.ts`, palette
      generator, picker, picker-from-image, matching colours. Gamut clipping
      solved by binary-search chroma reduction, so five shades of one blue no
      longer come back as four blues and a teal.
- [x] **Dev** (4) — JSON validator on a hand-written scanner (V8 stopped
      reporting positions), JSON diff, base64, JSON formatter
- [x] **Calculators** (4) — percentage, age, BMI with sex-specific charts, loan
- [x] **Generators** (3) — QR with logo and captions, YouTube thumbnail, password
- [x] **Text** (3) — word counter, mojibake repair, .docx word count

### Shell and UX
- [x] Condensed navbar and compact language switcher
- [x] `ShellNumberInput` — money-formatted fields, caret restored by counting
      digits rather than characters
- [x] `ShellDateInput` — a date picker of our own; replaced every `type="date"`
- [x] `ShellSelect` — searchable listbox with hidden word-start matching
- [x] `ShellDevStatus` + `/indexing` — localhost-only indexing workbench

### Publishing and indexing
- [x] **All 83 tools published, 0 drafts** (14 Sept)
- [x] Sitemap at 288 URLs, breadcrumb JSON-LD validating with zero errors
- [x] Google: robots, sitemap, canonical, hreflang, x-default — all verified
- [x] Yandex: http→https site move submitted

---

## Next

Ordered by what earns most per unit of work. The publishing gate applies to
every item: build it, Doniyor uses it, he says the word, *then* `published: true`.

### 1. Audio / video tools — the biggest opening

Huge search volume, and almost nobody does it in the browser. The tool list and
per-tool notes already exist in
[toolkave-roadmap-and-bot.md §3](toolkave-roadmap-and-bot.md); build in the
order given there:

> compress video · trim video · video → MP3 · convert to MP4 · video → GIF ·
> convert audio · trim audio · OGG → MP3

**Decide this before writing any code — it is not reversible cheaply:**

`ffmpeg.wasm` comes in two builds. The multithreaded one is far faster but needs
`SharedArrayBuffer`, which needs `Cross-Origin-Opener-Policy: same-origin` and
`Cross-Origin-Embedder-Policy: require-corp` on the response. **Those headers
break third-party embeds — including AdSense.** On an ad-supported site that is
a direct conflict, and `public/_headers` currently sets neither.

Three ways out, in order of preference:

1. **Single-threaded build, site-wide, no COOP/COEP.** Slower encodes, ads keep
   working everywhere. Start here.
2. **Scope the headers to the `/video` and `/audio` paths only** via `_headers`,
   and accept that those pages carry no ads. Fast encodes where they matter,
   ads everywhere else.
3. Multithreaded everywhere and drop AdSense. Not worth it today.

Other constraints already known: ~30 MB first download (cache it — the
`/models/*` immutable-cache pattern in `_headers` is the precedent), must run in
a Web Worker with a real progress bar, practical ceiling around 500 MB input.

### 2. SVG → 3D (three.js)

Upload or paste an SVG, extrude the paths into a mesh, orbit it, export it.
`SVGLoader` + `ExtrudeGeometry` do the core work; controls for depth, bevel,
scale and material. Export **STL** (3D printing), **GLB** (web and AR) and
**OBJ**, plus a PNG render of the current view.

Genuinely useful — logo to 3D print, laser-cut prep, a spinning logo for a
site — and nothing about it needs a server. three.js is ~600 KB minified, which
is fine as a lazy import on one page and unacceptable in the shared bundle, so
keep it behind a dynamic `import()` the way `jsqr` and `onnxruntime-web` are.

Watch for: SVGs with strokes but no fills (nothing to extrude — say so rather
than rendering nothing), text elements (need converting to paths first), and
files with thousands of paths (cap it and warn).

### 3. Solar — a section on toolkave.com, not a second site

**Decided 14 Sept 2026.** `docs/solar-calculator-spec.md` was written around a
standalone site with its own domain, bot and analytics. That is superseded on
one point, and it is the point everything else hangs off: **solar lives on
toolkave.com, as its own section, sharing this domain's SEO.**

The reason is that we would otherwise be throwing away everything already
built. toolkave.com has verified properties in both Google Search Console and
Yandex Webmaster, a sitemap Google is already crawling, working hreflang across
three locales, breadcrumb JSON-LD validating with zero errors, and a publishing
gate that has now shipped 83 tools without an untested page reaching
production. A new domain starts at zero on every one of those and would need the
same months of indexing work repeated. The solar spec's product thinking stands;
its hosting section does not.

**Shape:** a new category alongside PDF, Image and Colour — not a single
calculator. The spec's page cluster becomes tools in the registry:

| Tool | Purpose |
|---|---|
| Solar calculator | system size, cost, payback from bill or kWh + region + roof |
| Electricity bill calculator | by tariff tier; its own search traffic, links to solar |
| Generator / UPS sizing | blackout-season traffic |
| Battery runtime | "how long will X run on Y Ah"; feeds battery leads |

**What this section needs that the site has never had:**

- **Two locales, not three.** Uzbek and Russian only — English has no audience
  for Uzbek electricity tariffs. `ToolDef.locales` already supports this, but
  **every tool so far has been all three**, so the two-locale path is untested:
  verify hreflang, `x-default`, the sitemap entries and the category page all
  behave when a locale is absent, before building the second tool on top of it.
- **Article pages.** The spec wants FAQ and guide content, and the site has only
  ever had tool pages and category pages. That is a genuinely new page type with
  its own JSON-LD (`Article`, `FAQPage`) and its own place in the registry or
  beside it. Decide that shape before writing the first article.
- **A "last updated" stamp and a tariff source link** on every calculator, per
  the spec. Tariffs and net-metering rules change; stale numbers are worse than
  no numbers here in a way they are not for a PDF merger.

**Lead capture reuses what exists.** `server/telegram/` and the `BOT_DB` D1
binding are already deployed and working — do not stand up a second bot. The
deep-link payload carrying a calculator result, and the users table behind it,
extend the current bot rather than replacing it.

**Two consequences to accept openly:**

1. **No domain-level geo-targeting.** The spec wanted the site geo-targeted to
   Uzbekistan; that is not available for a section of a global three-language
   site without hurting the other 83 tools. Uzbek and Russian content plus
   correct hreflang has to carry it instead. This is a real cost of the
   decision, and the right trade.
2. **The sponsor pitch changes.** It is no longer "a dedicated solar site" but
   "the solar section of a tools site with existing traffic". Arguably an easier
   sell once there is traffic to point at, but it is a different conversation
   and worth knowing before talking to an installer.


### 4. Remaining colour tools

Contrast checker · gradient generator · hex↔RGB as its own page · shades and
tints · mixer · colour-blindness simulator · Tailwind scale · CSS-filter-from-hex.

The engine in `shared/colour.ts` already covers every one of these — Machado
matrices, WCAG contrast, OKLCH scales, mixing. These are pages over an existing
library, not new science, so they are cheap.

### 5. Remaining dev tools

Text diff · JWT decoder · hash generator · UUID · epoch converter · regex
tester · case converter · URL encode/decode · number base converter ·
YAML↔JSON · cron parser.

High-RPM audience per [toolkave-roadmap-and-bot.md §2](toolkave-roadmap-and-bot.md).
Most are an afternoon each.

### 6. Product features, once the tool count stops growing

PWA · tool chaining through the Pinia store · batch mode · presets · recent and
favourites · embeddable widgets. Full list in
[toolkave-roadmap-and-bot.md §4](toolkave-roadmap-and-bot.md).

---

## Not a build task, but the real constraint

The site is technically healthy and fully indexed-ready. What it lacks is
inbound links. Every item above adds surface area; none of them fixes
distribution. Worth deciding how much effort goes to building tool 84 versus
getting the first fifty people to link to tools 1–83.
