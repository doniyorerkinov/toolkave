# Toolkave — Document Builders: Presentation, Resume, Invoice

Plan for three "builder" tools. They differ from every other tool on the site: the user creates a document from structured input over a 10–30 minute session, rather than transforming a file in 20 seconds. They share one foundation and one exception to the site's rules (a rewarded ad gate on download, for Resume and Invoice only).

Companion files: `toolkave-plan.md`, `toolkave-pdf-and-ui.md`, `toolkave-roadmap-and-bot.md`, `ORDER.md`.

---

> **Build plan:** [toolkave-document-builders-plan.md](toolkave-document-builders-plan.md)
> (15 Sept 2026) — phases, gates and effort against the codebase as it is.
>
> Two lines below are already settled by work since this was written: the
> Telegram Mini App download fallback exists (share sheet, verified on an
> iPhone), so builders inherit it; and PDF export embeds pdfmake's Roboto,
> so the "installed everywhere" font rule applies to `.pptx` and `.docx` only.

## 0. Shared rules

- **Browser-only, nothing uploaded.** These tools hold personal and business data (CVs, client lists). The privacy promise is stated on every page: "Your data never leaves your device."
- **Local persistence** in IndexedDB: drafts, saved profiles/clients, past documents. No accounts.
- **Exports:** PDF (pdfmake) and .docx (`docx` library) for Resume and Invoice; .pptx (PptxGenJS) and PDF for Presentation. All lazy-loaded.
- **Fonts:** only families installed everywhere with full Cyrillic + Uzbek Latin coverage (Arial, Calibri, Georgia, Times). Preview and export must use the same fonts.
- **Templates are original designs.** Nothing copied from Canva, Novoresume, Slidesgo or similar.
- **Three UI locales** (en, ru, uz) plus a separate *document language* selector, so an Uzbek user can produce an English CV or invoice.
- **Ad gate:** Resume and Invoice downloads go through **AdSense Offerwall's rewarded ad gate** — never a display unit wrapped in a countdown (policy violation). Frequency cap: once per day per browser, not per download. Graceful fallback: if the ad fails to load or is blocked, wait 15 s, then download anyway. **Presentation and every other tool on the site: no gate.** This is a written rule; it does not creep.
- **Ad categories** blocked per the site's ad policy (finance/lending, betting, alcohol, dating, astrology).

### Shared foundation (build once)

```
components/builders/
├── BuilderShell.vue        # two-pane layout: form/outline left, live preview right, template strip, export bar
├── LivePreview.vue         # renders the document model to HTML/CSS at true page/slide proportions
├── TemplateStrip.vue       # theme/template picker with thumbnails
├── ExportBar.vue           # PDF / DOCX / PPTX buttons, gate integration, download fallback
└── OfferwallGate.vue       # AdSense Offerwall rewarded gate wrapper with frequency cap + fallback

composables/
├── useDocumentModel.ts     # typed model + validation per builder
├── useLocalDrafts.ts       # IndexedDB save/load/list/delete
├── useExportPdf.ts         # pdfmake from model + template
├── useExportDocx.ts        # docx from model + template
└── useExportPptx.ts        # PptxGenJS from slide model + theme

data/templates/
├── resume/*.ts             # 6–8 templates
├── invoice/*.ts            # 5–6 templates
└── presentation/*.ts       # 8–10 themes
```

Each template/theme is a **data object** (colours, fonts, spacing, coordinates) consumed by both the preview and the exporters. That is what keeps preview and export identical.

---

## 1. Presentation builder

### What it is
A structured-input → .pptx generator. The user supplies an outline (typed, pasted, or from a Word file), picks a theme, gets a real PowerPoint file plus a PDF. Design decisions are made by the theme, not the user. **Not** a slide editor.

### Entry points (three pages, one engine)
| Page | Query it serves | Notes |
|---|---|---|
| Outline → Presentation | "make a presentation online free", "prezentatsiya yaratish", "создать презентацию онлайн бесплатно" | the product |
| Word → PowerPoint | "word to powerpoint", "docx to pptx" | mammoth: Heading 1 → slide, lists → bullets. Likely the biggest traffic page of the three |
| PDF → PowerPoint | "pdf to pptx" | pdf.js renders each page → image slide. Two hours once the exporter exists |

### User flow
1. **Start:** type / paste / upload .docx, or a scaffold button — *School report · Lesson · Project defense · Business* — pre-filling Title, Plan, 3–5 content slides, Conclusion, Thank you, in the chosen document language.
2. **Edit:** outline left, live slide preview right, theme strip below, 16:9 / 4:3 toggle, font pair, accent colour.
3. **Download:** .pptx and .pdf. No gate.

### Outline syntax (tiny, with toolbar buttons so nobody has to learn it)
```
# Presentation title         → title slide
Author / class               → subtitle line
## Slide title               → new slide
- bullet                     → bullet
  - sub-bullet
![caption](image-name)       → image slide (image picked from device)
> quote                      → quote slide
| a | b |                    → table
notes: ...                   → speaker notes
```

### Architecture
```
outline text ──parse──▶ Slide model (JSON) ──▶ Vue preview
                                             ├──▶ PptxGenJS → .pptx
                                             └──▶ pdfmake  → .pdf
```
Slide model: `{ layout, title, body[], image?, table?, notes? }[]`.
Layouts (only these): title, section, bullets, bullets+image, image-full, two-columns, quote, table, closing.
Themes: data objects with per-layout coordinates in inches, shared by preview and exporters.

### Hard parts and answers
| Problem | Answer |
|---|---|
| Fonts can't be embedded in .pptx from the browser | Standard families only; preview uses the same |
| Text overflow | Measure with canvas `measureText`; step font size down one notch, then auto-split into "(1/2)" slides |
| Preview ≠ export drift | Shared coordinates; golden set of 20 outlines rendered both ways, checked per theme change; keep layouts simple |
| Huge images | Downscale to 1920 px, JPEG 80% on import; cap 40 images, warn |
| Telegram Mini App blob downloads | Detect webview → "Open in browser" for download, or send via bot (later) |
| PPTX → PDF, editing existing .pptx | Server-only; say no on the page, point to the outline door |

Skip entirely: freeform editing, animations, transitions, collaboration, video.

### Effort
- **MVP (1 week):** parser, model, 5 layouts, 4 themes, preview, .pptx export, scaffold, three UI languages. Ship to nephew's class; watch.
- **v1 (+2 weeks):** PDF export, auto-split, image import, Word door, PDF door, 10 themes, notes, tables.
- **Later:** native charts from table syntax, Telegram download path, local outline saving.

### Validation
Build the MVP around one real assignment the nephew has this week. If his deck comes out well, the tool works.

---

## 2. Resume builder

### What it is
Free CV/resume builder: form-driven, live preview, 6–8 original templates, PDF and .docx export, no watermark, no account. Data stays in the browser.

### Fields
Personal (name, title, contacts, photo optional), summary, experience (repeating), education (repeating), skills (tags with optional level), languages, certificates, projects, custom sections. Section reorder. Photo stays local; downscaled on import.

### Templates
6–8 clean, ATS-friendly designs; single- and two-column; one "photo-first" variant common in CIS hiring; all Cyrillic-safe. Colour accent selectable.

### Exports
- **PDF** (pdfmake) — primary
- **.docx** — HR in Uzbekistan often asks for Word
- Print stylesheet so Ctrl+P works

### Ad gate
Offerwall rewarded gate on download, once per day per browser, with the 15 s fallback. The builder itself is never gated. Expected revenue is modest (a few cents per completion in CIS, ~$0.10–0.15 US/EU); the value of the page is intent, session length, sharing and links.

### Search targets
Uzbek and Russian first — "rezyume yaratish", "rezyume namunasi", "резюме онлайн бесплатно без регистрации", "создать резюме" — where competition is weak. English is a secondary target; the big brands own it.

### Effort
- **MVP (1 week):** model, form, preview, 3 templates, PDF export, local drafts.
- **v1 (+1 week):** .docx export, 8 templates, photo, section reorder, Offerwall gate, three languages for document labels.

---

## 3. Invoice maker

### What it is
Free commercial invoice/bill generator: your details + logo, client, line items, discount, tax, notes, due date, auto-incrementing number. PDF and .docx. Saved clients and past invoices stay local.

### Fields
Issuer (name, address, contacts, logo, bank details optional), client (saved list), invoice number (auto-increment, editable), dates (issue, due), items (description, qty, unit, price), discount (% or fixed), tax line (VAT/QQS as a percentage the user sets), shipping/other, notes, payment terms, signature line.

### Locale behaviour
- Currencies: so'm, USD, EUR, RUB, custom.
- Number formatting per locale (1 250 000,00 vs 1,250,000.00).
- Document language independent of UI language.

### Naming caution
**Never** "hisob-faktura" / "счёт-фактура" — those are fiscal tax documents issued only through official e-invoice systems. Use "invoice / to'lov uchun hisob / счёт на оплату" and say so in the FAQ.

### Templates
5–6 original designs; same font rules.

### Exports
PDF, .docx, print stylesheet.

### Ad gate
Same Offerwall gate, same daily cap — invoice users are repeat users (a freelancer sends several a month); a gate on every download would drive them off.

### Effort
- After Resume: **~1 week** (reuses model/preview/export/gate). Line-item math, numbering, saved clients are the new pieces.

---

## 4. Category and pages

New category **Documents** (`/documents` · `/ru/dokumenty` · `/uz/hujjatlar`):

| Tool | Gate |
|---|---|
| Resume builder | Offerwall (daily cap) |
| Cover letter (later, days) | Offerwall (daily cap) |
| Invoice maker | Offerwall (daily cap) |
| Quotation / proposal (later, days) | Offerwall (daily cap) |
| Presentation builder | none |
| Word → PowerPoint | none |
| PDF → PowerPoint | none |

Each page: 200–400 words + FAQ per locale, `WebApplication` JSON-LD, the privacy line above the fold.

**Sponsors that fit the ad policy** for this category: printing houses, coworking spaces, accounting software, stationery, education centres.

---

## 5. Build order

1. Shared foundation: `BuilderShell`, `LivePreview`, `useLocalDrafts`, `useExportPdf`, `OfferwallGate` (needs AdSense approval first — apply now).
2. **Presentation MVP** — the nephew's assignment is the test. Ship without gate.
3. **Word → PowerPoint** and **PDF → PowerPoint** pages on the same exporter.
4. **Resume MVP** → v1 with .docx and gate.
5. **Invoice** on the resume foundation.
6. Presentation v1 (PDF export, auto-split, Word door, 10 themes).
7. Cover letter and quotation as cheap add-ons.

Publishing gate applies to all of it: built → Doniyor uses it → `published: true`.

---

## 6. Checklist

- [ ] AdSense application submitted (Offerwall requires an approved account)
- [ ] Ad policy page live with blocked categories
- [ ] Shared foundation components and composables
- [ ] Presentation MVP: parser, 5 layouts, 4 themes, preview, .pptx, scaffold, 3 UI languages
- [ ] Nephew test with a real assignment
- [ ] Word → PowerPoint page (mammoth door)
- [ ] PDF → PowerPoint page (pdf.js door)
- [ ] Resume MVP: model, form, preview, 3 templates, PDF, local drafts
- [ ] Resume v1: .docx, 8 templates, photo, reorder, Offerwall gate + fallback, document-language labels
- [ ] Invoice: line-item math, numbering, saved clients, currencies, 5 templates, PDF/.docx, gate
- [ ] FAQ wording for invoice naming (not hisob-faktura)
- [ ] Presentation v1: PDF export, auto-split, image import, 10 themes, notes, tables
- [ ] Telegram Mini App download fallback for builders
- [ ] Content (200–400 words + FAQ) per page per locale
- [ ] Golden-set fidelity check: preview vs export for every template/theme
