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

- [x] `app/web-workers/pdf.worker.ts` + message protocol (avoid the name `workers/` — this
      project deploys to Cloudflare *Workers*)
- [x] Page thumbnails via pdf.js, reused by Rotate / Delete. **Split intentionally not touched —
      see below.**
- [x] **Compress** — built the way the risk note below called for: recompresses embedded
      images only, text/vectors untouched. No new dependency.
- [x] **PDF → JPG**
- [x] **PDF → text** (was deferred here from Wave 2)
- [ ] Core Web Vitals measured before/after — needs a real browser session, not done yet

**Architecture.** One worker (`pdf.worker.ts`) does both parsing and rendering, using
`OffscreenCanvas` for the render step. pdf.js is still told where its own worker script is
(`GlobalWorkerOptions.workerSrc`, via Vite's `?url` import of `pdf.worker.min.mjs`); it spawns
that as a *nested* worker for parsing, which every evergreen browser supports and is pdf.js's own
documented pattern for running inside a worker. The alternative — leaving `workerSrc` unset so
pdf.js quietly falls back to running synchronously in the calling thread — is an internal fallback
pdf.js itself documents only as a last resort, so it was not relied on here.

`usePdfWorker.ts` wraps it: one `Worker` per composable instance, created lazily on first call and
terminated automatically on `onScopeDispose` — a tool page that never touches a multi-page PDF
never constructs it, and one that does gets it cleaned up on navigation without the calling
component having to remember to.

**`ShellPagePicker.vue`** is the reusable page picker the docs called for: a range-text field
(unchanged from before — still the fastest path for anyone who already knows the page numbers)
sitting above a thumbnail grid that stays in sync with it in both directions. Selection is
zero-based indices throughout, matching what `parsePageRanges` already produced and what
`rotatePdf` / `removePdfPages` / `extractPages` already expect, so it drops in without a
conversion at the boundary. Thumbnails are skipped past 300 pages — the text field still works,
uninterrupted by page count.

**Verification.** No browser automation is available in this environment, so verification split
two ways: the actual pdf.js render path (viewport scaling, `page.render`, real pixel output, JPEG
encoding, `getTextContent` with `hasEOL` line breaks) was run in Node against real generated PDFs
using `@napi-rs/canvas` standing in for `OffscreenCanvas` — 25 cases, all against genuine
multi-page and landscape fixtures, not mocks. Every route (now 201 across three locales) was
checked live against the dev server for actual render failures, not just HTTP 200. What this
*cannot* verify is the literal `new Worker(new URL(...))` construction and the nested pdf.js
worker spawn succeeding in a real browser tab — that needs an actual click, which is exactly what
the `published: false` gate on these tools is already for. Nothing here bypasses that gate.

**Split was deliberately left untouched.** It is the one *published, live* PDF tool with real
traffic. Rotate and Remove pages were both still drafts, so upgrading their range-input to the new
picker cost nothing — a real user sees no difference until a human tests and ships it. Applying
the same upgrade to Split's already-shipped interaction is a different kind of change — new,
untested UI reaching production the next time this deploys — and was judged worth a separate,
explicit decision rather than folding it into the rest of this pass. The picker is a drop-in for
Split whenever that's wanted.

**Compress, built.** pdf-and-ui §2's original spec — "pdf.js render → JPEG re-encode → pdf-lib
rebuild" — was rejected for the reason flagged here originally: it rasterises every page, so text
stops being selectable or searchable and a text-heavy file can come out *larger*. What shipped
instead walks the PDF's object graph directly (`page.node.Resources()` → `/XObject` → `context.lookup`,
recursing into Form XObjects) and recompresses only Image XObjects it can be fully confident about:
already `DCTDecode` (JPEG), already `DeviceRGB`/`DeviceGray`. Everything else — indexed colour,
ICC profiles, `JPXDecode` — is left untouched rather than guessed at, and the result says how many
images it touched versus skipped. No new dependency; `mupdf-wasm`/`pdfcpu-wasm` were the fallback
if this scoped approach didn't cover enough real PDFs, but it does for the dominant case (a scan or
a phone photo dropped into a page).

Verified against real embedded JPEGs (not mocks): 14 cases in Node using `@napi-rs/canvas` for the
decode/encode step pdf-lib itself doesn't do — a photo-heavy PDF shrinks meaningfully with its text
byte-for-byte identical before and after (checked with a real embedded Cyrillic+Uzbek font via
fontkit, not just ASCII), a text-only PDF reports nothing to compress rather than faking a win, an
already-small image is left alone rather than made larger, and multi-page/multi-image documents are
all considered.

**Exit:** a 100-page PDF compresses without freezing the UI; CWV still green (CWV check itself still
needs a real browser session).

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

The order in which to test — and so to publish — is the wave order in
`testing-checklist.md`: ranked by search volume, by where the site has no competition,
and by how much human time a tool costs to test. One wave, one deploy.

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
- [x] **Protect / unlock PDF** — on `@cantoo/pdf-lib`
- [x] **Currency converter** — CBU primary, open.er-api fallback, fetched in the browser
- [x] Header/footer · resize · flatten · fill forms · sign
- [x] **PDF→text** — built in Phase 3 once pdf.js landed; see that phase for detail.

**Wave 2 complete: 38 tools in the registry at the time, 35 drafts.** 114 pages across three
locales, all 200 in dev.

Notes on the last five:

- **Resize** scales content by the smaller of the two ratios and then *centres* it. Tools that
  only call `setSize` leave the content in the bottom-left corner. Landscape pages keep their
  orientation rather than being forced upright.
- **Sign** places a picture of a signature. That is the same standing as a scanned signature,
  not a cryptographic one — it proves nothing about who signed and detects no later edits. The
  FAQ says exactly that rather than implying legal weight it does not have.
- **Fill form** silently skips a value that no longer matches a field's options instead of
  aborting the whole fill, so one stale dropdown value does not lose the other twenty fields.
- **Flatten** on a PDF with no form is a no-op that says so, rather than pretending to work.

### Library decision: `@cantoo/pdf-lib` replaces `pdf-lib`

Upstream `pdf-lib` cannot encrypt. The alternatives:

| Option | Licence | Verdict |
| --- | --- | --- |
| `pdfcpu-wasm` | MIT (upstream Apache-2.0) | **30 MB unpacked**, 0 stars, one commit, untouched since Jul 2025 |
| `@cantoo/pdf-lib` | MIT | Maintained fork of `pdf-lib`, same API, adds encryption. **Chosen** |

`save()` preserves existing encryption, so unlocking means copying pages into a fresh
document. Title, author and subject are carried across explicitly; bookmarks and form fields
are not.

### Currency data: no key, no server route

Both sources send `Access-Control-Allow-Origin: *`, so the browser fetches them directly — no
Worker invocation, and the browser-only promise holds.

| Source | Currencies | Key | Role |
| --- | --- | --- | --- |
| CBU (Central Bank of Uzbekistan) | 75 | none | Primary. Official UZS rate |
| open.er-api.com | 166 | none | Fallback |
| exchangerate.host | — | **required now** | Not usable; the plan's reference is out of date |

Verified the rebasing maths against CBU's own direct EUR quote. The two sources differ by
~0.1% on UZS, so the page always shows which one it used and the date.

> **Watermarks and page numbers are Latin-only.** The fonts built into the PDF format are
> WinAnsi-encoded, so Cyrillic cannot be drawn without embedding a TTF plus fontkit — a large
> download on every visit for a feature most visitors will not use. The tool says so plainly
> instead of producing a page full of empty boxes. Worth revisiting if `ru`/`uz` watermark
> traffic ever justifies the weight.

## Phase 6 — Wave 3: tier 3 differentiators (48 tools)

- [x] **OCR uz/ru/en** and **broken text → UTF-8** — the two nobody else builds
- [x] DOCX→PDF · Excel/CSV→PDF · grayscale
- [x] DOCX→text/HTML/MD · CSV⇄JSON⇄Excel · word count for DOCX · Markdown⇄HTML
- [x] Scanned photos → PDF (web version of the bot)
- [x] Compare · Annotate · Redact — split into three tools rather than one,
      since "annotate" and "redact" turned out to need genuinely different,
      not merely differently-skinned, mechanisms (see below)

**Wave 3: 63 tools in the registry, 60 drafts.** 213 pages across three
locales, all verified rendering (not just 200 — checked against markers a
client-side render failure actually leaves behind). PDF→JPG, PDF→text, and
Compress/Compare/Annotate/Redact (counted here since they're tier-3-adjacent
heavy tools even though PDF→text was a Wave-2 leftover) brought the total up
from 57.

**Compare, Annotate and Redact** are three separate tools sharing one
category, not one "compare/annotate/redact" tool wearing three hats — the
original phase note lumped them together, but they turned out to need
different guarantees, not just different UI:

- **Compare** runs on extracted text per page (`usePdfCompare.ts`, pure and
  tested on its own: 13 cases covering identical/changed/added/removed
  classification and the page-count-mismatch boundary), not a pixel diff —
  cheap enough for a long document without rendering any of it, and it's what
  actually answers "what changed" rather than "do these pixels differ." Pages
  flagged changed get a real word-level diff (`diff`/jsdiff, BSD-3) plus
  side-by-side thumbnails rendered only for those pages, not every page.
  Deliberately outside the shared file store — comparison genuinely needs two
  independent files at once, which the store's one-tool-owns-one-fileset model
  (`store.claim`) isn't built for.
- **Annotate** (highlight + short Latin-only notes) is purely additive —
  `page.drawRectangle`/`drawText` on top of the existing content stream,
  nothing underneath is touched. Safe to build on the simple public API for
  exactly that reason.
- **Redact** is not annotate-with-a-different-colour, and treating it as one
  would have been the dangerous shortcut: a black box drawn *on top of* live
  text — which is what "highlight, but black" amounts to — still leaves that
  text selectable and copyable underneath, the exact failure behind real,
  public redaction incidents. So any page with a redaction box is rasterised
  (via the same `rasterizePages` the PDF→JPG tool uses), the box is painted
  directly onto the decoded pixels *before* re-encoding, and the flattened
  result replaces the entire page — text layer, form fields, everything —
  via a new `replacePagesWithImages` primitive in `usePdf.ts`
  (`doc.removePage` + `doc.insertPage` + `embedJpg`, page size preserved).
  Pages with no box are left completely untouched. The cost — a redacted
  page's text is no longer selectable or searchable, because it is no longer
  text — is stated on the page above the file picker, not folded into the
  FAQ where it's easy to skip past. Verified directly against the property
  that actually matters: 16 cases in Node confirm the redacted page has zero
  extractable text via pdf.js's own `getTextContent`, the box renders solid
  black at the right position, an untouched page keeps its real text, and a
  page with no box survives byte-identical.

Notes on the nineteen new tools:

- **Fix broken text** solves mojibake two ways, because pasted text and a raw
  file are genuinely different problems. A file still has its original bytes,
  so the right encoding can simply be applied — lossless. Pasted text has
  already been decoded, so the damage has to be undone by searching over
  plausible (misread, actual) pairs and scoring the result. The scorer had to
  move past per-character plausibility once real data showed the failure
  mode: UTF-8 Cyrillic misread as windows-1251 turns "Привет" into
  "РџСЂРёРІРµС‚" — also made of real Cyrillic letters, so a plausibility score
  alone can't tell the two apart. What does is structure (a capital appearing
  mid-word, a code-page symbol wedged between letters), counted as an
  absolute defect count, not a rate — a repair confined to a few characters
  in an otherwise clean paragraph must not get diluted into invisibility by
  an average. Search is a small beam, not a greedy hill-climb: text mangled
  twice has a correct first step that scores *worse* than the input by every
  local measure, so requiring each step to improve walks straight past the
  answer.
- **OCR** carries English, Russian and both Uzbek alphabets (Latin and
  Cyrillic) — the second nobody else builds. Small images are upscaled toward
  Tesseract's preferred ~30px glyph height before recognition, which matters
  more than any local thresholding. Confidence is averaged over words found by
  walking blocks → paragraphs → lines → words, not read from the page-level
  number, which a single confident heading can drag upward over an unreadable
  body.
- **Word → PDF** and the HTML→PDF path underneath it use `pdfmake`, not
  `pdf-lib` like the rest of the site — pdf-lib's built-in fonts are
  WinAnsi-encoded and cannot draw Cyrillic at all. pdfmake's bundled Roboto
  covers Russian and Uzbek Cyrillic (Ўў Ҳҳ Ққ Ғғ) plus ₽ and №; the one gap is
  U+02BB (Uzbek's modifier apostrophe in oʻzbek), silently substituted with
  the visually near-identical U+2018 rather than left as a missing-glyph box.
  pdfmake 0.3 also switched its API from callbacks (`getBuffer(cb)`) to
  promises without much fanfare — the old form still type-checks against
  community typings but silently never calls back, so this was worth getting
  right rather than copying the widely-posted 0.2 snippet.
- **Grayscale PDF** does not rasterise. Render-to-image-and-rebuild is the
  approach that looks obvious and is wrong for the same reason Compress in
  Phase 3 is flagged: it drops the text layer. Instead each page gets a
  half-opaque grey rectangle painted through a graphics state whose blend
  mode is `Saturation` — the source's saturation is zero, so it flattens
  whatever colour sits beneath it to that colour's own brightness, with text
  staying real text. Necessary honesty in the FAQ: this is a *display*
  transformation. The original colour bytes are still in the file: fine for
  printing, wrong for anyone who thinks they've stripped colour information
  for good.
- **Scan to PDF** — the web counterpart of the bot — cleans up phone photos
  with a genuine auto-levels pass (percentile-clipped histogram stretch),
  not a fixed brightness/contrast bump. It finds where the paper and the ink
  actually sit in the image's tonal range and stretches that to full black
  and white, which is what turns a grey, unevenly lit photo into something
  that reads as scanned.
- **CSV / Excel / JSON**, all six directions, share one `Grid = string[][]`
  boundary in `utils/table.ts`. The CSV reader detects both the delimiter and
  the character set from the file rather than assuming comma and UTF-8:
  Excel under a Russian or Uzbek locale writes semicolons (comma is the
  decimal separator), and files are routinely windows-1251. `SheetJS`
  (`xlsx`) is used at 0.20.3 from the vendor's own CDN — the npm-published
  `xlsx` package is frozen at 0.18.5 from 2022 with open advisories; upstream
  stopped publishing new versions to npm itself.
- **Word ⇄ HTML/Markdown** run through `mammoth`, which maps Word's styles
  onto semantic HTML rather than reproducing its layout — the right trade
  here, since the goal is clean, reusable output, not a pixel copy. The
  Markdown side needed one real fix to Turndown's own list-item rule: its
  default output pads markers to a fixed width (`-   item`, three spaces),
  which is valid but not what anyone expects from an export and looks odd
  pasted anywhere else.

### New dependencies

| Library | Licence | Role |
| --- | --- | --- |
| `tesseract.js` | Apache-2.0 | OCR engine |
| `mammoth` | BSD-2-Clause | .docx → HTML/text |
| `marked` | MIT | Markdown → HTML |
| `turndown` | MIT | HTML → Markdown |
| `dompurify` | MPL-2.0 / Apache-2.0 | Sanitising HTML before on-page preview |
| `papaparse` | MIT | CSV parsing |
| `xlsx` (SheetJS, 0.20.3 via vendor CDN) | Apache-2.0 | Excel read/write |
| `pdfmake` | MIT | Cyrillic-capable PDF generation (tables, converted HTML) |

All lazy-imported inside their tool component, per standing rule 2 — nothing
here is paid for by a visitor to an unrelated tool. Tesseract's language
models (~1–3 MB each) are fetched from a public CDN only when a language is
actually selected, and cached by the browser after that.

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
8. **Never type a control character into source.** A literal NUL reached `usePdf.ts` inside a
   regex character class. It silently widened `[ -ÿ]` to `[0-ÿ]`, so tabs
   and newlines counted as valid watermark text, **and git treated the entire file as binary** —
   no diff on it in commit `20d2fa1`. Write such bounds as `\u` escapes. `git diff --numstat`
   showing `-` for a source file is the tell.
9. **Run `npm run typecheck` before deploying.** `nuxt build` does not typecheck; the separate
   pass caught an invalid i18n config key that was being silently ignored, plus two unsound
   types. Note that a running `nuxt dev` holds `.output` through its workerd child and will
   make `nuxt build` fail with `EBUSY` — stop it first.
10. **Never branch on `constructor.name`.** The production build minifies class names, so a
    check that passes in `nuxt dev` matches nothing once deployed — Fill form shipped that
    way and rendered an empty form in production. Use `instanceof` against the library's
    exported classes. More generally, anything that could behave differently minified needs
    one `npm run build && npx wrangler dev` pass; the dev-server checklist does not give you that.

---

## Tests

`npm test` runs the headless suite in `tests/` on Node's built-in runner — no extra
dependency. The composables are imported straight from `app/` (Node strips the types), so
the code under test is the code the site ships. Output PDFs are rendered with pdf.js on
`@napi-rs/canvas` and asserted on pixels: page numbers, headers, watermarks, signatures
and annotations are checked *where a viewer shows them* on pages stored with every
`/Rotate` value; redaction is checked to keep the displayed size; compress runs against a
canvas shim. `TOOLKAVE_TEST_ARTIFACTS=1 npm test` also writes contact sheets to
`tests/.artifacts/` for a look.

Run it before the human pass on any PDF tool and before every deploy, alongside
`npm run typecheck`. Two platform facts it records: Node's `TextDecoder('windows-1252')`
returns C1 controls for 0x80–0x9F where browsers follow the Encoding Standard (worked
around in `utils/encoding.ts`, which now decodes that label itself), and `@cantoo/pdf-lib`
drops the document Info dictionary — title, author — on encrypted save, so Protect
loses metadata; a `todo` test turns green when the fork fixes it.

---

## Design

The look is the name: a cave. Near-black header and footer (`stone-950`), warm paper
body (`stone-50`), and one accent — **ember** (`--color-ember-*` in `main.css`) — for
the logo, actions and focus. Type is **Manrope**, self-hosted from `public/fonts/`
(OFL; the Latin subset includes the Uzbek apostrophes U+02BB–02BC). Each category has a
hue for its icon tile (`app/utils/tone.ts`); tool icons are lucide, mapped from the
registry's `icon` names in `ShellIcon`. Neutrals are `stone`, never `slate`; the accent is
`ember`, never `sky` — a new component that uses either is wrong.

The home page shows at most six tools per category with a counted "All N tools" link;
the category page is the full list; every tool page lists its siblings in the sidebar.
