# Toolkave — Build Order & TODO

Working checklist. **This file supersedes the build orders in `toolkave-plan.md` §5 and
`toolkave-pdf-and-ui.md` §5** wherever they disagree, and records the decisions those two
documents predate.

Ordering principle: anything expensive to retrofit goes first; anything cheap to add goes last.

Last updated: 9 Sept 2026

---

## Locked decisions

These are settled. The older docs contradict some of them — this file wins.

| Topic | Decision | Supersedes |
| --- | --- | --- |
| Framework | Nuxt 4 (`app/` directory) | "Nuxt 3" + root-level `pages/` trees |
| Hosting | Cloudflare **Workers**, not Pages | plan §6, pdf-and-ui §3 |
| Rendering | Prerendered static assets, routes generated from the registry | "static Nuxt" (same intent, different mechanism) |
| Locales | `en` (unprefixed) · `ru` · `uz` | 4-locale plan incl. `uz-cyrl` |
| `uz-cyrl` | Deferred. Enable only on Search Console evidence, and generate by transliteration from `uz-latn` | plan §4 |
| European locales | Not now. Add one at a time, with paid human translation, only after a page proves it ranks | — |
| URLs | Category-nested **and** translated: `/pdf/merge`, `/ru/pdf/obedinit` | plan §4 flat slugs |
| Content | Prose written per tool per locale **on demand**, never as a bulk batch | plan §9 "all languages" |
| Locale coverage | Per-tool `locales` field. A tool with no content in a locale gets **no URL** there | — |
| Shipping | Per-tool `published` flag. Nothing reaches production until a human has tested it | — |
| Order | **All 48 tools first**, then content, then ads | plan §5, pdf-and-ui §5 |

**Why the content rule matters:** ~47 tools × 3 locales = ~141 pages. At the plan's 3–4 h/week
that is over budget before starting. Real capacity is ~100–120 pages in year one. Spend them
where traffic concentrates (pdf-and-ui §2 puts ~80% of PDF traffic in Tier 1), not uniformly.

**Never machine-translate the SEO prose.** In `ru`/`uz` it is written natively — that is the moat.

---

## Phase 0 — Foundation

- [x] Switch SSR → prerendering, routes generated from the registry
- [x] Track `wrangler.jsonc` in git
- [ ] **Cloudflare dashboard (manual — API token lacks zone write):**
  - [ ] Always Use HTTPS: **on**
  - [ ] SSL: **Full (strict)**
  - [ ] Rocket Loader: **off** — breaks Nuxt hydration, do before Phase 2 ships
  - [ ] Auto Minify: **off**

## Phase 1 — Skeleton + first vertical slice

- [x] `app/data/tools.ts` registry — single source for routing, nav, sitemap, hreflang, prerender
- [x] `@nuxtjs/i18n`, `prefix_except_default`, translated slugs at both levels
- [x] `app/pages/[category]/[tool].vue` + `[category]/index.vue` + home
- [x] Layout, nav, language switcher, footer
- [x] `ToolShell`, `HowTo`, `Faq`, `WhyBlocks`, `RelatedTools`, `ToolCard`
- [x] `AdSlot` (inert until Phase 6)
- [x] `useSeo` — canonical, OG, hreflang, `WebApplication` + `FAQPage` JSON-LD
- [x] Registry-driven `sitemap.xml` with per-entry hreflang, plus `robots.txt`
- [x] **Word counter live in all three locales**
- [ ] Native `ru`/`uz` pass over the word counter prose (currently a draft)

**Exit met:** 9 routes prerendered, all 200 on toolkave.com, cross-locale URLs correctly 404.

## Phase 2 — File pipeline

- [x] Pinia store `app/stores/files.ts` — current files, so tools chain without re-upload
- [x] `FileDropzone` — drag-drop, click, paste; accepted formats + size hint
- [x] `FileList` — drag-to-reorder, remove (file-level; page thumbnails deferred to Phase 3)
- [x] `ResultCard` — filename, size before/after, Download, Use as input, Start over
- [x] `usePdf.ts` with **lazy** `pdf-lib` import
- [x] **PDF Merge**
- [x] **PDF Split** (page ranges; visual page picker waits for pdf.js)
- [x] Registry entries + `en`/`ru`/`uz` content for both
- [ ] Native `ru`/`uz` pass over the merge/split prose (currently a draft)
- [ ] `OptionsPanel` — deferred; merge needs no options and split needs one field, so
      extracting a wrapper now would be guessing at its API. Build it with Rotate/Compress,
      which are the first tools with a real options set.

**Scope call:** Phase 2 stayed `pdf-lib`-only. Page thumbnails need pdf.js (~1 MB), which
arrives with the worker in Phase 3.

**Reordering:** drag, implemented with **Pointer Events** rather than HTML5 drag-and-drop —
HTML5 drag does not fire on touch, and most traffic will be mobile. One code path covers mouse,
touch and pen. The drag handle is also focusable and responds to arrow keys, so reordering
works without a pointer.

**Exit met:** 18 routes prerendered, all 200 live. pdf-lib sits in its own 419 KB chunk that no
page loads until a file is actually processed — the entry chunk (163 KB) does not contain it.
Merge → "Use as input" → Split chains without re-upload.

**Store ownership:** the file store is app-level, so it survives route changes. That is what
makes chaining work, but left unguarded it leaks — opening Split after Merge silently inherited
the merge inputs. Two defences:

1. `store.claim(toolId)` runs in `ToolShell` setup and drops anything owned by a different tool.
2. `onBeforeRouteLeave` prompts before discarding work, unless the destination is the *same*
   tool in another locale (a language switch is the same work at a different URL).

> **Not yet deployed:** drag-to-reorder and the store-leak fix are committed and typecheck, but
> the production build was deferred — a running `nuxt dev` holds `.output`. Run
> `npm run typecheck && npm run deploy` when the dev server is free.

## Phase 3 — Heavy pipeline

- [ ] `app/web-workers/pdf.worker.ts` + message protocol (avoid the name `workers/` — this
      project deploys to Cloudflare *Workers*)
- [ ] Page thumbnails via pdf.js, reused by Split / Reorder / Rotate / Delete
- [ ] **Compress** — ⚠ see risk below
- [ ] **PDF → JPG**
- [ ] Core Web Vitals measured before/after

> **Open risk — Compress.** pdf-and-ui §2 specifies "pdf.js render → JPEG re-encode → pdf-lib
> rebuild". That rasterises every page: text stops being selectable or searchable, and
> text-heavy files can come out *larger*. This is a Tier-1 tool where users compare directly
> against iLovePDF, which preserves text. Validate against a real text-heavy PDF before
> committing; `mupdf-wasm` / `pdfcpu-wasm` recompress images without destroying the text layer.

**Exit:** a 100-page PDF compresses without freezing the UI; CWV still green.

## Scope — the full tool set

| Group | Tools |
| --- | --- |
| PDF & docs — tier 1 | 7 |
| PDF & docs — tier 2 | 12 |
| PDF & docs — tier 3 | 12 |
| Image (compress, resize, convert) | 3 |
| Generators (QR, password, YouTube thumbnail) | 3 |
| Text (word counter) | 1 |
| Converters (unit, currency, timezone) | 3 |
| Calculators (percent/VAT, age/date, BMI, loan) | 4 |
| Dev (JSON, Base64/URL, colour) | 3 |
| **Free, browser-only total** | **48** |
| Server-backed premium (PDF→Word, edit text, PPT→PDF, repair, redaction) | 5 |
| **Everything** | **53** |
| + `@toolkavebot` | 1 |

**Pages, not tools, is what ranks.** iLovePDF lists "JPG to PDF", "PNG to PDF" and "HEIC to PDF"
as separate tools even though it is one function, because each is a separate query. Split the
converters the same way and 48 tools become **60–70 tool pages**; at three locales that is
**180–210 indexable pages**. That is the actual asset. In the registry this is several entries
sharing one `component` with a different `config` — never several components.

**Target pace:** ~20 tools live by end of month one (tier-1 PDF plus the simple ones), ~35 by
month three, all 48 by month six. Search data then says which tier-3 tools are worth finishing
and which to drop.

---

## Publishing gate

Every tool carries `published: boolean`. **Only human-tested tools get shipped.**

`published: false` means the tool exists in the codebase but has no URL in production: no route,
no sitemap entry, no nav or related-tools link, and a direct hit 404s. It stays fully reachable
in `nuxt dev`, with a "Draft" badge on the page, so it can be built and tested first.

Every registry lookup takes `includeDrafts` and **defaults to `false`**, so the failure mode is
hiding a tool rather than shipping an untested one.

Flip to `true` only after using the tool on real files.

---

## Phase 4 — Wave 1: finish tier 1 + the easy wins (~20 tools)

All built as **drafts** (`published: false`) — they need a human pass before shipping.

- [x] Rotate PDF · Remove PDF pages
- [x] JPG→PDF · PNG→PDF · WebP→PDF · HEIC→PDF (one component, four pages via `config`)
- [x] Image compress · resize
- [x] PNG→JPG · JPG→PNG · WebP→JPG · HEIC→JPG (one component, four pages via `config`)
- [x] QR generator · YouTube thumbnail · password generator
- [x] Base64 / URL encoder-decoder · JSON formatter · colour picker
- [x] **PDF→JPG and Compress moved to Phase 3** — both need pdf.js and the web worker, so
      they belong with the heavy pipeline rather than here

**Wave 1 complete: 18 tools in the registry, 15 drafts awaiting a human pass.**
54 pages across three locales, all returning 200 in dev.

Note the ratio: 18 tools, but only 8 distinct tool components. `ImagesToPdf` backs four pages
and `image/Convert` backs another four. That is the page-splitting strategy working — each
conversion pair is a separate query and a separate page, without a separate implementation.

HEIC support uses `heic2any`, dynamically imported only when a HEIC file is actually added, so
no other tool pays for it.

## Phase 5 — Wave 2: tier 2 PDF + the rest of the simple tools (~35 tools)

- [x] Page numbers · watermark · PDF info
- [x] Percent/VAT · age/date · BMI · loan calculators
- [x] Unit converter · time zone converter
- [ ] Header/footer · sign · fill forms · flatten · crop/resize
- [ ] **Currency converter** — the only tool here that needs live data. Everything else is
      offline; this one wants the CBU API plus a rates fallback, cached at the edge. It breaks
      the browser-only rule, so it needs its own decision before building.
- [ ] **Protect / unlock** — `pdf-lib` cannot encrypt. Needs `pdfcpu-wasm` or similar.
- [ ] **PDF→text** — needs pdf.js, so it belongs with Phase 3.

**27 tools in the registry, 24 drafts.** 81 pages across three locales, all 200 in dev.

> **Watermarks and page numbers are Latin-only.** The fonts built into the PDF format are
> WinAnsi-encoded, so Cyrillic cannot be drawn without embedding a TTF plus fontkit — a large
> download on every visit for a feature most visitors will not use. The tool says so plainly
> instead of producing a page full of empty boxes. Worth revisiting if `ru`/`uz` watermark
> traffic ever justifies the weight.

## Phase 6 — Wave 3: tier 3 differentiators (48 tools)

- [ ] **OCR uz/ru/en** and **broken Cyrillic → UTF-8** — the two nobody else builds
- [ ] DOCX→PDF · Excel/CSV→PDF · grayscale · compare · annotate/redact
- [ ] DOCX→text/HTML/MD · CSV⇄JSON⇄Excel · word count for PDF/DOCX · Markdown⇄HTML
- [ ] Scanned photos → PDF (web version of the bot)

## Phase 7 — Content + indexing

- [ ] 200–400 words + FAQ per tool, allocated by traffic (top ~15 in 3 locales; long tail 1–2)
- [ ] Google Search Console + Yandex Webmaster verified, sitemap submitted
- [ ] Confirm Googlebot reaches pages via URL Inspection

## Phase 8 — Ads

- [ ] `AdSlot` switched on; AdSense + Yandex РСЯ on separate slots
- [ ] Scripts loaded once in the layout, lazily, after hydration
- [ ] Never between input and result; max 3–4 units per page
- [ ] CWV measured before and after

## Phase 9 — Beyond the free site

- [ ] `@toolkavebot`
- [ ] Server-backed premium tier (5 tools, separate FastAPI service)
- [ ] Revisit Ezoic at ~10k sessions/month
- [ ] Revisit a European locale once a page proves it ranks

---

## Standing engineering rules

1. **Registry drives everything.** A new tool is one registry entry + one component. Adding a
   locale is one array entry + one JSON file + slugs — never a page change.
2. **Lazy-import every heavy library** inside the tool component, never in the layout.
   `import.meta.glob` in `[tool].vue` already code-splits each tool into its own chunk.
3. **Resolve tool components through the glob, not `resolveComponent`.** Nuxt's auto-import is a
   build-time template transform; a runtime-computed name renders as an unknown element.
4. **Locale alternates come from the registry, not `useSetI18nParams`/`switchLocalePath`.** On
   dynamic routes those fall back to the current route's params and emit cross-locale URLs like
   `/ru/text/word-counter`, which 404.
5. **Prerender everything.** Static asset requests on Workers are free and unlimited; Worker
   invocations are capped at 100k/day on the free plan.
6. **Deploys are CLI-driven** (`npm run deploy`). No Git integration — pushing does not deploy.
7. **Adding a new tool component needs a dev-server restart.** `[tool].vue` resolves components
   through `import.meta.glob`, and Vite does not re-evaluate the glob when a file appears. The
   symptom is a 500 saying "Tool component missing" for a file that plainly exists. Touching
   `[tool].vue` also forces it.
8. **Run `npm run typecheck` before deploying.** `nuxt build` does not typecheck; the separate
   pass caught an invalid i18n config key that was being silently ignored, plus two unsound
   types. Note that a running `nuxt dev` holds `.output` through its workerd child and will
   make `nuxt build` fail with `EBUSY` — stop it first.
