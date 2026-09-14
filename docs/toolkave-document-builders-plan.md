# Document Builders — Build Plan

**Companion to [toolkave-document-builders.md](toolkave-document-builders.md).**
The spec says *what*; this says *in what order, against this codebase, with what
proof at each step*. Written 15 September 2026 after reading the shell, the
registry, the exporters and the test harness rather than assuming them.

Position in the overall order is **not decided yet** — see the last section.

> **Presentation dropped, 15 Sept** — see the stopped
> [toolkave-presentation-editor-plan.md](toolkave-presentation-editor-plan.md).
> Phases 1, 2 and 6 below no longer apply. Resume and invoice (Phases 0, 3–5)
> remain valid but are **not scheduled**; they wait on a decision to build
> builder-shaped tools at all, and on AdSense, which is deferred until traffic.

---

## What the codebase already gives us

Roughly half the spec's "shared foundation" exists. Building it twice would be
the most expensive mistake available.

| Spec asks for | Already here | Consequence |
|---|---|---|
| Two-pane builder inside the site | `ToolShell` renders the tool as a free `<slot />` inside a `max-w-6xl` container | A builder lays out its own two panes. Breadcrumb, H1, intro, how-to, FAQ, JSON-LD and the ad slot come free. **No shell change.** |
| Three presentation doors, one engine | `ToolDef.config` already drives shared components (`from: 'markdown'`, `to: 'html'`) | `config: { from: 'outline' \| 'docx' \| 'pdf' }` on one component — the exact `MarkdownConvert` pattern. |
| PDF export | `useDocPdf.ts` lazy-loads **pdfmake with Roboto** (regular / medium / italic), cached after first use | Resume and invoice PDF export is a document definition, not a font project. |
| Word door | `mammoth` (docx → HTML) in `useDocx.ts` | Heading 1 → slide, lists → bullets, from a function that exists. |
| PDF door | `pdfjs-dist` rendering, used by PDF → JPG | Page → image slide is the existing render path. |
| Download, including Telegram | `ResultCard` + `downloadBytes` (share sheet inside Telegram, verified on iPhone 15 Sept) | The spec's "Telegram Mini App download fallback" is done before it starts. |
| Number formatting per locale | `ShellNumberInput` already uses `Intl.NumberFormat` | Invoice money fields reuse it. |
| Tests | `node:test`, pdfjs rendering onto `@napi-rs/canvas`, `jszip` as a dependency | PDF output asserted by rendered text; `.pptx` and `.docx` are zips — slide and paragraph counts asserted from XML. |

**One correction to the spec.** The rule "only fonts installed everywhere —
Arial, Calibri, Georgia, Times" is right for `.pptx` and `.docx`, which name a
font and let the viewer's machine supply it. It cannot apply to PDF: pdfmake
embeds a TTF, and the one it ships with is **Roboto**. So the preview must be
told which export it is previewing — Roboto metrics for PDF, the named family
for Office — or the "preview equals export" promise breaks on line wraps. Small,
but it has to be designed in at Phase 0, not discovered in Phase 3.

## What is genuinely new

- **Local persistence.** IndexedDB has never been used on the site. `useLocalDrafts` is the first stateful thing here, and it needs a versioned schema from day one.
- **A document model with validation**, separate from the file store. Builders take no file; `ToolResult.sourceSize` is simply 0.
- **Two export libraries**: `pptxgenjs` and `docx`. Neither is installed. Both must be lazy `import()`s inside the export action — the `jsqr` / `onnxruntime-web` discipline — never in a component's import graph.
- **Text measurement** for overflow, via canvas `measureText` against the template's real font.
- **Document language ≠ UI language.** Every builder label exists twice: once for the interface (existing i18n) and once for the document (a new, smaller table keyed by document language).
- **The ad gate.** Blocked on AdSense approval, which has not been applied for — `AdSlot.vue` renders nothing in production. The gate is a wrapper around the export bar; every phase below ships correctly with or without it.

---

## Phases

Each phase ends with a **gate**: something a person does with the real thing.
Nothing is `published: true` until the gate is passed, per the site's rule.

### Phase 0 — Foundation · 3–4 days

Build once, used by all three.

- Registry: category `documents` — `/documents` · `/ru/dokumenty` · `/uz/hujjatlar` — plus `categories.documents.{name,title,description}` in three locales.
- `components/builders/BuilderShell.vue` — form or outline left, preview right; **stacked at 375px with a preview toggle**, since the site's audience is on phones.
- `components/builders/LivePreview.vue` — renders a document model at true page (A4) or slide (16:9) proportions from template data.
- `components/builders/TemplateStrip.vue`, `ExportBar.vue` — export bar produces a `ToolResult` and hands it to the existing `ResultCard`, so download and the Telegram share sheet are inherited.
- `composables/useLocalDrafts.ts` — IndexedDB, **schema version 1 written down**, `list / save / load / delete`, debounced autosave. Wrapped: a private window or a webview that refuses IndexedDB degrades to memory and tells the user drafts will not survive a reload, rather than throwing.
- `composables/useDocumentModel.ts` — shared validation helpers (required, max length, repeating groups).
- Dev dependency `fake-indexeddb` so drafts are tested under `node:test`.

**Gate:** a stub builder page renders two panes at 1152px and stacks at 375px, saves a draft, survives a reload, and is readable in dark mode.

### Phase 1 — Presentation MVP · 5 days · **no AdSense dependency**

- `shared/outline.ts` — the parser, pure and testable: `#` title slide, `##` new slide, `-` bullets, `![](…)` image, `>` notes. Toolbar buttons insert the syntax so nobody learns it.
- Slide model → **5 layouts**: title, bullets, two-column, image + text, section divider.
- **4 themes** as data objects in `data/templates/presentation/` — colours, fonts, coordinates — consumed by both the preview and the exporter. This is the whole defence against preview ≠ export drift.
- `composables/useExportPptx.ts` — `pptxgenjs`, lazy.
- Overflow, MVP scope: measure, step the font down one notch. Auto-split into "(1/2)" slides is Phase 6.
- Scaffolds — *School report · Lesson · Project defense · Business* — pre-filled in the chosen document language.
- Registry: `presentation-builder`, `config: { from: 'outline' }`. Full i18n for three UI locales.
- Tests: parser golden cases; export unzipped and `ppt/slides/slideN.xml` counted; theme colour present in the XML; Cyrillic and Uzbek Latin survive the round trip.

**Gate: the nephew's assignment.** A real deck, opened in PowerPoint *and* Google Slides — they render `.pptx` differently and both matter. Published only after.

### Phase 2 — The other two doors · 2–3 days

- `config: { from: 'docx' }` → `mammoth` → HTML → outline (H1 → slide, H2 → subtitle, `li` → bullet) → the Phase 1 pipeline unchanged.
- `config: { from: 'pdf' }` → pdfjs renders each page → downscaled to 1920px, JPEG 80% → image slides. Cap 40 pages, warn above.
- Two registry entries on the same component. The spec is right that **Word → PowerPoint is probably the biggest traffic page of the three** — it answers a query people already type.
- Tests: a `.docx` fixture produces the expected slide count; a 3-page PDF fixture produces 3 image slides.

### Phase 3 — Resume MVP · 5 days

- Model per the spec's field list; repeating groups for experience and education.
- Form left, A4 preview right, **3 templates** as data.
- PDF via pdfmake / Roboto — a document definition built from model + template.
- Drafts autosave from Phase 0.
- **Document-language selector**: section labels ("Experience" / "Опыт" / "Tajriba") come from the new document-language table, independent of the UI locale, so an Uzbek user writes an English CV.
- Tests: model → pdfmake definition golden file; rendered PDF asserted for name, first job title, page count.

**Gate:** Doniyor produces his own CV with it and would send it.

### Phase 4 — Resume v1 · 5 days

- `composables/useExportDocx.ts` — the `docx` library, lazy, from the same template data. HR in Uzbekistan asks for Word; this is not optional.
- 8 templates, photo (downscaled on import, never leaves the device), section reorder, print stylesheet.
- **`OfferwallGate.vue`** — rewarded Offerwall, once per day per browser, 15-second fallback when the ad fails or is blocked. **Only if AdSense is approved by then.** If it is not, v1 ships ungated and the gate is added later; it wraps `ExportBar` and touches nothing else.

### Phase 5 — Invoice · 5 days

On the resume foundation. The new pieces:

- Line-item arithmetic in integer minor units (tiyin, cents) — never floating point on money. Discount as percent or fixed, one tax line at a user-set rate, rounding rule stated.
- Auto-incrementing number kept in IndexedDB; editable; survives reload.
- Saved clients and past invoices, local.
- Currencies (so'm, USD, EUR, RUB, custom) and per-locale number formatting via the existing `Intl` path.
- **Naming per the spec, enforced in copy and tests**: "invoice / to'lov uchun hisob / счёт на оплату", never *hisob-faktura* / *счёт-фактура*, with the FAQ explaining why.
- 5 templates, PDF and `.docx`, the same gate rule as Resume.
- Tests: totals across discount, tax and rounding; the number sequence after a simulated reload; the forbidden terms absent from all three locale files.

**Gate:** one real invoice, sent to a real client.

### Phase 6 — Presentation v1 · 10 days

PDF export of slides, auto-split on overflow, image import, 10 themes, speaker notes, tables. Native charts from table syntax stay in "later".

**After all of it:** cover letter and quotation, each a few days on the resume and invoice foundations.

---

## Blockers and owners

| Item | Owner | When |
|---|---|---|
| **AdSense application** | Doniyor | **Today.** Approval takes days to weeks and nothing we do speeds it. It gates only Phase 4's gate and the revenue case — every phase ships without it. |
| Ad policy page with blocked categories | both | Before the AdSense review sees the site |
| `pptxgenjs`, `docx`, `fake-indexeddb` installs | me | Start of Phases 1, 4, 0 |
| A real assignment from the nephew | Doniyor | The week Phase 1 lands |

## Risks specific to this codebase

- **Bundle weight.** `pptxgenjs` and `docx` must appear only behind a dynamic `import()` in the export action. Check the built chunk list after each is added — a builder page must not load either until Export is pressed.
- **Preview ≠ export drift.** Two defences: templates as data consumed by both sides, and a golden set of 20 outlines rendered both ways after any theme change. Plus the font correction above — the preview has to know which export it is previewing.
- **IndexedDB in Telegram's webview and in private windows** can be refused outright. Degrade to memory, say so, never throw.
- **Locale volume.** Each builder adds dozens of strings × 3 locales. One bare `@` or stray `<tag>` takes every string on the site down; run `tests/locales.test.mjs` after every edit, no exceptions.
- **The Worker is untouched.** Everything here runs in the browser, so nothing competes with the bot for CPU, and the privacy line holds for CVs and client lists exactly as it does for PDFs.

## Effort

| Phase | Days |
|---|---|
| 0 Foundation | 3–4 |
| 1 Presentation MVP | 5 |
| 2 Word and PDF doors | 2–3 |
| 3 Resume MVP | 5 |
| 4 Resume v1 | 5 |
| 5 Invoice | 5 |
| 6 Presentation v1 | 10 |
| **All three at MVP** (0–3, 5) | **~4 weeks** |
| **Everything** | **~7 weeks** |

## Decisions needed before Phase 0 starts

1. **Where this sits in ORDER.md.** It is larger than audio/video, which is currently #1. Ahead, behind, or interleaved — your call, not mine.
2. **AdSense: apply today?** Determines whether Phase 4 ships gated or the gate arrives later.
3. **The nephew's assignment date**, so Phase 1 is scheduled to land the week it is needed.
