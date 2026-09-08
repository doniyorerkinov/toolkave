# Toolkave — UI Structure, PDF/Docs Catalog, Architecture Adjustments

Supplement to `toolkave-plan.md`. Covers: page-level UI, the full PDF & document tool list by tier, and the architecture changes needed to support many tools.

Reference competitor: PDF Leader (pdfleader.com) — a paid-ads → $0.95 trial → ~€45/month subscription funnel with dark-pattern billing. Copy its single-purpose landing layout and premium feature list; do not copy its billing, its client-only SPA (no SEO), or server-side file processing.

---

## 1. UI structure

### Homepage `/`
- **Header:** logo · category nav (PDF · Image · Converters · Calculators · Generators · Text · Dev) · language switcher · search
- **Hero:** one line — "Free tools that run in your browser. Your files never leave your device." + search box
- **Popular:** row of 6 most-used tool cards
- **Per category:** heading + grid of `ToolCard` (icon, name, one-line description)
- **Footer:** about · privacy · contact · sitemap · language links

### Category page `/pdf`
- Title + two-sentence intro (SEO text)
- Tool cards grouped: Organize · Convert to PDF · Convert from PDF · Optimize · Edit · Security · Other docs
- Sidebar ad on desktop

### Tool page `/pdf/merge` — same `ToolShell` for every tool
1. Breadcrumb (Home › PDF › Merge PDF) · H1 · one-sentence description
2. **Tool area** (above the fold)
   - Dropzone: drag-drop / click / paste; shows accepted formats and size hint
   - File list: thumbnails, drag-reorder, remove
   - Options panel: only the 2–4 options that matter for this tool
   - Primary button (e.g. "Merge PDF")
   - Progress bar → **Result card:** filename, size before/after, Download, Start over
3. Ad slot `below-result` — rendered only after a result exists
4. How-to: 3 numbered steps with icons
5. Why-this-tool: 3–4 short blocks (private, free, no upload, no limits)
6. FAQ: 4–6 questions — this is the 200–400 words of SEO text
7. Related tools: 4–6 cards from the registry (chainable — see §3.5)
8. Desktop sidebar: one ad `sidebar` + "All PDF tools" list

**Mobile:** single column, dropzone fills the screen, options in an accordion, sticky action button at the bottom.

**Ad rules:** never between upload and result; max 3–4 units per page; load scripts lazily after hydration.

### Shared components
`ToolShell` · `FileDropzone` · `FileList` · `OptionsPanel` · `ResultCard` · `AdSlot` · `HowTo` · `Faq` · `RelatedTools` · `ToolCard`

---

## 2. PDF & document tools

### Tier 1 — build first (≈80% of PDF search traffic; all browser-only)

| Tool | Library / approach |
|---|---|
| Merge PDF | pdf-lib |
| Split PDF (range / every N pages / extract pages) | pdf-lib |
| Rotate pages | pdf-lib |
| Reorder / delete pages (with thumbnails) | pdf.js + pdf-lib |
| JPG / PNG / WebP / HEIC → PDF | pdf-lib (+ heic2any) |
| PDF → JPG / PNG (ZIP of pages) | pdf.js + jszip |
| Compress PDF | pdf.js render → JPEG re-encode → pdf-lib rebuild (slow on 100+ pages) |

### Tier 2 — edit & convert (browser-only)

| Tool | Library / approach |
|---|---|
| Add page numbers | pdf-lib |
| Watermark (text / image) | pdf-lib |
| Header / footer text | pdf-lib |
| Sign PDF (draw signature, place it) | canvas → PNG → pdf-lib |
| Fill PDF forms | pdf-lib forms API |
| Flatten PDF (forms/annotations → static) | pdf-lib |
| PDF → text | pdf.js |
| Crop pages / resize (A4 ⇄ Letter, scale) | pdf-lib (MediaBox / CropBox) |
| Protect / unlock with password | pdfcpu-wasm or a pdf-lib encryption fork |
| View / edit / remove metadata | pdf-lib |
| PDF info (pages, size, version, metadata) | pdf.js |
| Text / Markdown → PDF | jspdf |

### Tier 3 — differentiators (heavier)

| Tool | Library / approach |
|---|---|
| OCR scanned PDF in uz / ru / en | tesseract.js (slow; rare in Uzbek — strong local angle) |
| DOCX → PDF | docx-preview + print (layout imperfect) |
| Excel / CSV → PDF | SheetJS → HTML table → jspdf |
| Grayscale PDF | render-rebuild |
| Compare two PDFs (text diff) | pdf.js text + diff lib |
| Annotate / highlight / redact (draw + flatten) | pdf.js viewer + canvas layer + pdf-lib — big UI job |
| DOCX → text / HTML / Markdown | mammoth |
| CSV ⇄ JSON ⇄ Excel | SheetJS |
| Broken Cyrillic → UTF-8 fixer | plain JS — very local, very searched |
| Word counter for PDF / DOCX | pdf.js, mammoth |
| Markdown ⇄ HTML | plain JS |
| Scanned photos → PDF (web version of @toolkavebot) | pdf-lib |

### Server-only — future paid tier (the honest version of PDF Leader's upsell)
PDF → Word / Excel with layout · edit text inside a PDF · PowerPoint → PDF · repair PDF · true redaction.
Requires LibreOffice-class tooling → small FastAPI container (Railway / VPS), called only from premium tools.

### Build order for the PDF category
1. Merge · Split · Rotate · Reorder/Delete · JPG→PDF · PDF→JPG · Compress
2. Page numbers · Watermark · Sign · Fill forms · PDF→text · Protect/Unlock · Crop
3. OCR · DOCX→PDF · Grayscale · Compare · Metadata tools · Cyrillic fixer
4. Server-backed premium tools — later

After Merge and Split, each tier-1/2 tool = registry entry + options panel + one function in `usePdf.ts`.

---

## 3. Architecture adjustments for many tools

**Unchanged:** registry-driven pages, `ToolShell`, static Nuxt, Cloudflare Pages, browser-only processing.

**Do these before writing the second PDF tool:**

### 3.1 Category-nested URLs
`/pdf/merge`, `/pdf/split` instead of `/tools/pdf-merge`. Better topic clustering for SEO; gives the `/pdf` category page for free.
→ `pages/[category]/[tool].vue` — one dynamic page that reads the registry. Tool-specific UI lives in `components/tools/pdf/Merge.vue` etc., selected via the registry's `component` field.

### 3.2 Registry grows a level
`category` → `group` (Organize, Convert, Edit…) → tool.
New fields: `acceptedTypes`, `maxFiles`, `heavy: boolean`, `component`, `related[]`.

### 3.3 Lazy-load heavy libraries
pdf.js is ~1 MB; tesseract.js plus language packs is more. Use dynamic `import()` inside the tool component — never in the layout — so the word counter page doesn't pay for OCR. Skipping this will wreck Core Web Vitals.

### 3.4 Web Workers for heavy processing
Compress, PDF→JPG, OCR block the UI for seconds on large files. Run the heavy `usePdf` functions in a worker (`new Worker(new URL('./pdf.worker.ts', import.meta.url))`). Merge/split can stay on the main thread.

### 3.5 File-state store (Pinia)
Keep current file(s) in a store so tools chain without re-upload — "merged, now compress." Makes "Related tools" real actions and keeps users on site (the iLovePDF pattern).

### 3.6 Shared file UI primitives
Page thumbnails (pdf.js small render), drag-reorder, per-page selection — build once, reuse across Split, Reorder, Rotate, Delete.

### 3.7 Optional server side — later
Separate FastAPI service for premium conversions. The static site never depends on it; all free tools keep working if the server is down.

**Everything else waits until it hurts.**

---

## 4. Updated folder structure

```
toolkave/
├── nuxt.config.ts
├── app.vue
├── layouts/
│   └── default.vue
├── pages/
│   ├── index.vue                    # homepage
│   ├── [category]/
│   │   ├── index.vue                # category page (/pdf)
│   │   └── [tool].vue               # dynamic tool page (/pdf/merge)
├── components/
│   ├── shell/
│   │   ├── ToolShell.vue
│   │   ├── FileDropzone.vue
│   │   ├── FileList.vue             # thumbnails, reorder, remove
│   │   ├── OptionsPanel.vue
│   │   ├── ResultCard.vue
│   │   ├── HowTo.vue
│   │   ├── Faq.vue
│   │   ├── RelatedTools.vue
│   │   └── ToolCard.vue
│   ├── ads/
│   │   └── AdSlot.vue
│   └── tools/
│       ├── pdf/
│       │   ├── Merge.vue
│       │   ├── Split.vue
│       │   ├── Rotate.vue
│       │   ├── Reorder.vue
│       │   ├── ImagesToPdf.vue
│       │   ├── PdfToImages.vue
│       │   └── Compress.vue
│       ├── image/
│       └── ...
├── composables/
│   ├── usePdf.ts                    # thin API; heavy parts call the worker
│   ├── useImage.ts
│   ├── useSeo.ts
│   └── useToolRegistry.ts
├── workers/
│   ├── pdf.worker.ts                # compress, render pages, OCR
│   └── image.worker.ts
├── stores/
│   └── files.ts                     # Pinia: current files for tool chaining
├── data/
│   └── tools.ts                     # registry: category → group → tool
├── i18n/
│   ├── uz.json  uz-cyrl.json  ru.json  en.json
├── utils/
│   └── formatters.ts
└── public/
    ├── robots.txt
    └── og/
```

---

## 5. Checklist additions

- [ ] Switch to `pages/[category]/[tool].vue` dynamic routing
- [ ] Registry with `group`, `acceptedTypes`, `maxFiles`, `heavy`, `component`
- [ ] Dynamic `import()` for pdf.js / tesseract / SheetJS inside tool components
- [ ] `workers/pdf.worker.ts` with a tiny message protocol; Compress and PDF→JPG run there
- [ ] Pinia `files` store + chaining from `RelatedTools`
- [ ] `FileList` with thumbnails and drag-reorder, reused by Split/Reorder/Rotate/Delete
- [ ] Tier-1 PDF tools live (7)
- [ ] Tier-2 PDF tools live
- [ ] OCR uz/ru/en + Cyrillic fixer (local differentiators)
- [ ] Core Web Vitals checked after each heavy tool ships
